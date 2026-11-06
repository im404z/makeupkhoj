import argparse
import asyncio
import json
import logging
import os
import random
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import httpx
from bs4 import BeautifulSoup

try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', 'server', '.env'))
except ImportError:
    pass

# Import MakeupKhoj DB config
_crawler_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _crawler_root not in sys.path:
    sys.path.insert(0, _crawler_root)

from db_config import get_db, COLLECTIONS, DB_NAME, DEFAULT_MONGO_URI, validate_db_safety

DEFAULT_DB = DB_NAME  # 'makeupkhoj'
DEFAULT_COLLECTION = COLLECTIONS['myntra']  # 'myntra_makeupkhoj'

try:
    import pymongo
    from pymongo import UpdateOne
except ImportError:
    pymongo = None
    UpdateOne = None

# Configure standard logging and ensure Windows UTF-8 stdout
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1"
}


def clean_text(val: Any) -> str:
    """Clean string values, stripping excess spaces and control chars."""
    if val is None:
        return ""
    s = str(val).replace("\r", "").replace("\n", " ").strip()
    s = re.sub(r"^[|\s]+", "", s).strip()
    return s


def parse_number(val: Any) -> Optional[Any]:
    """Parse integer or float from strings or numbers, handling 'k' (e.g. 9.6k)."""
    if val is None or val == "" or val == "N/A":
        return None
    if isinstance(val, (int, float)):
        return val
    s = str(val).replace(",", "").strip()
    # Check for '9.6k' format
    k_match = re.search(r"([\d.]+)\s*k", s, re.IGNORECASE)
    if k_match:
        try:
            return int(float(k_match.group(1)) * 1000)
        except Exception:
            pass
    match = re.search(r"[-+]?\d*\.?\d+", s)
    if match:
        num = float(match.group(0))
        return int(num) if num.is_integer() else num
    return None


def format_image_url(url: str, height: int = 720, width: int = 540, quality: int = 90) -> str:
    """Format template image URLs from Myntra assets into high-resolution URLs."""
    if not url:
        return ""
    formatted = url.replace("($height)", str(height)).replace("($width)", str(width)).replace("($qualityPercentage)", str(quality))
    if formatted.startswith("http://"):
        formatted = "https://" + formatted[7:]
    return formatted


def parse_pdp_html(html_content: str, fallback_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Parse Myntra Product Detail Page HTML using the exact HTML class selectors
    provided, supplemented by window.__myx.pdpData when available.
    """
    soup = BeautifulSoup(html_content, "html.parser")

    # -------------------------------------------------------------
    # Step 1: Extract window.__myx.pdpData if present in raw HTML
    # -------------------------------------------------------------
    pdp_json: Dict[str, Any] = {}
    myx_idx = html_content.find("window.__myx =")
    if myx_idx != -1:
        start_brace = html_content.find("{", myx_idx)
        end_script = html_content.find("</script>", start_brace)
        if start_brace != -1 and end_script != -1:
            raw_json = html_content[start_brace:end_script].strip().rstrip(";")
            try:
                parsed_myx = json.loads(raw_json)
                pdp_json = parsed_myx.get("pdpData", {}) or {}
            except Exception:
                pdp_json = {}

    # -------------------------------------------------------------
    # Step 2: Breadcrumbs (<div class="breadcrumbs-container">)
    # -------------------------------------------------------------
    breadcrumbs: List[Dict[str, str]] = []
    bc_container = soup.select_one(".breadcrumbs-container")
    if bc_container:
        for a in bc_container.select("a.breadcrumbs-link"):
            text = a.get_text(separator=" ", strip=True)
            href = a.get("href", "")
            if text:
                full_url = f"https://www.myntra.com{href}" if href.startswith("/") else href
                breadcrumbs.append({"title": text, "url": full_url})
    elif pdp_json.get("crossLinks"):
        for link in pdp_json.get("crossLinks", []):
            t = link.get("title")
            u = link.get("url", "")
            if t:
                full_url = f"https://www.myntra.com/{u}" if not u.startswith("http") else u
                breadcrumbs.append({"title": t, "url": full_url})

    # -------------------------------------------------------------
    # Step 3: Images & Videos (<div class="image-grid-container">)
    # -------------------------------------------------------------
    images: List[str] = []
    # A. From DOM background-image: url(...)
    for el in soup.select(".image-grid-image"):
        style = el.get("style", "")
        match = re.search(r'url\([&quot;\'"]?(.*?)[&quot;\'"]?\)', style)
        if match:
            clean_url = match.group(1).replace("&quot;", "").replace('"', '').replace("'", "")
            if clean_url and clean_url not in images:
                images.append(clean_url)
    # B. From DOM img tags
    for img in soup.select(".image-grid-container img"):
        src = img.get("src") or img.get("data-src")
        if src and src not in images:
            images.append(src)
    # C. Supplement from pdp_json media albums
    media_json = pdp_json.get("media", {})
    for album in media_json.get("albums", []):
        for img_obj in album.get("images", []):
            raw_src = img_obj.get("src") or img_obj.get("imageURL") or ""
            fmt_url = format_image_url(raw_src)
            if fmt_url and fmt_url not in images:
                images.append(fmt_url)

    videos: List[Dict[str, Any]] = []
    for vjs in soup.select("video-js"):
        video_id = vjs.get("data-video-id")
        video_el = vjs.select_one("video")
        poster = video_el.get("poster") if video_el else None
        src = video_el.get("src") if video_el else None
        videos.append({"video_id": video_id, "poster": poster, "src": src})
    if not videos and media_json.get("videos"):
        for v in media_json.get("videos", []):
            videos.append({
                "video_id": v.get("id"),
                "poster": v.get("thumbnail"),
                "src": v.get("url")
            })

    # -------------------------------------------------------------
    # Step 4: Product Title, Name, Price, MRP, Discount, VAT
    # -------------------------------------------------------------
    title_el = soup.select_one(".pdp-title")
    brand = title_el.get_text(strip=True) if title_el else None
    if not brand and pdp_json.get("brand"):
        brand = pdp_json["brand"].get("name") if isinstance(pdp_json["brand"], dict) else str(pdp_json["brand"])

    name_el = soup.select_one(".pdp-name")
    name = name_el.get_text(strip=True) if name_el else None
    if not name and pdp_json.get("name"):
        name = pdp_json.get("name")

    price_el = soup.select_one(".pdp-price strong, .pdp-price, .PriceInfo-price")
    price = parse_number(price_el.get_text(strip=True)) if price_el else None
    if price is None and pdp_json.get("price"):
        p_dict = pdp_json.get("price")
        if isinstance(p_dict, dict):
            price = parse_number(p_dict.get("discounted") or p_dict.get("mrp"))

    mrp_el = soup.select_one(".pdp-mrp s, .PriceInfo-mrp s, .pdp-mrp")
    mrp = parse_number(mrp_el.get_text(strip=True)) if mrp_el else None
    if mrp is None and pdp_json.get("mrp"):
        mrp = parse_number(pdp_json.get("mrp"))

    disc_el = soup.select_one(".pdp-discount, .PriceInfo-discount")
    discount = disc_el.get_text(strip=True).replace("(", "").replace(")", "").strip() if disc_el else ""
    if not discount and mrp and price and mrp > price:
        pct = round(((mrp - price) / mrp) * 100)
        discount = f"{pct}% OFF"

    vat_el = soup.select_one(".pdp-vatInfo, .pdp-selling-price")
    vat_info = vat_el.get_text(strip=True) if vat_el else "inclusive of all taxes"

    # Overall Rating & Rating Count
    rating_el = soup.select_one(".index-overallRating div:first-child, .index-averageRating span:first-child")
    rating = parse_number(rating_el.get_text(strip=True)) if rating_el else None
    if rating is not None:
        try:
            rating = round(float(rating), 1)
        except Exception:
            pass
    if rating is None and pdp_json.get("ratings"):
        rating = round(float(pdp_json["ratings"].get("averageRating", 0)), 1) or None

    rating_count_el = soup.select_one(".index-ratingsCount, .index-countDesc")
    rating_count_raw = rating_count_el.get_text(strip=True) if rating_count_el else None
    rating_count = parse_number(rating_count_raw)
    if rating_count is None and pdp_json.get("ratings"):
        rating_count = pdp_json["ratings"].get("totalCount")

    # -------------------------------------------------------------
    # Step 5: Sizes (<div class="size-buttons-size-container">)
    # -------------------------------------------------------------
    sizes: List[Dict[str, Any]] = []
    for btn in soup.select(".size-buttons-size-buttons button"):
        size_txt = btn.select_one(".size-buttons-unified-size")
        if size_txt:
            s_name = size_txt.get_text(strip=True)
            is_selected = "size-buttons-size-button-selected" in btn.get("class", [])
            sizes.append({"size": s_name, "selected": is_selected})
    if not sizes and pdp_json.get("sizes"):
        for s in pdp_json.get("sizes", []):
            lbl = s.get("label")
            if lbl:
                sizes.append({"size": lbl, "selected": s.get("selected", False), "available": s.get("available", True)})

    # -------------------------------------------------------------
    # Step 6: Seller Info & Product Style ID
    # -------------------------------------------------------------
    seller_el = soup.select_one(".SelectedSizeSellerInfo-sellerButton, .supplier-productSellerName, .SelectedSizeSellerInfo-sellerName")
    seller_name = seller_el.get_text(strip=True).replace("Seller:", "").strip() if seller_el else None
    if not seller_name and pdp_json.get("selectedSeller"):
        seller_name = pdp_json["selectedSeller"].get("sellerName")

    code_el = soup.select_one(".supplier-styleId")
    product_code = code_el.get_text(strip=True) if code_el else (str(pdp_json.get("id")) if pdp_json.get("id") else fallback_id)

    # Expiry Date (<div class="expiryDate-container">)
    expiry_el = soup.select_one(".expiryDate-container")
    expiry_date = None
    if expiry_el:
        exp_txt = expiry_el.get_text(separator=" ", strip=True)
        exp_match = re.search(r"Expiry\s*Date\s*:\s*(.*)", exp_txt, re.IGNORECASE) or re.search(r"Expiry\s*Date\s+(.*)", exp_txt, re.IGNORECASE)
        expiry_date = exp_match.group(1).strip() if exp_match else exp_txt
    elif pdp_json.get("selectedSeller", {}).get("expiryDate"):
        raw_ts = pdp_json["selectedSeller"]["expiryDate"]
        try:
            # If timestamp in ms
            ts_sec = int(raw_ts) / 1000.0
            expiry_date = datetime.fromtimestamp(ts_sec, timezone.utc).strftime("%d %b %Y")
        except Exception:
            expiry_date = str(raw_ts)

    # Offers (<div class="pdp-offers-container">)
    offers: List[Dict[str, str]] = []
    for offer_box in soup.select(".pdp-offers-container .pdp-offers-offerLikeBestPrice, .pdp-offers-container .pdp-offers-offer"):
        t_el = offer_box.select_one(".pdp-offers-offerTitle")
        d_el = offer_box.select_one(".pdp-offers-labelMarkup, .pdp-offers-offerDesc")
        t = t_el.get_text(strip=True) if t_el else ""
        d = d_el.get_text(strip=True) if d_el else ""
        if t or d:
            offers.append({"title": t, "description": d})
    if not offers and pdp_json.get("offers"):
        for o in pdp_json.get("offers", []):
            if isinstance(o, dict):
                offers.append({"title": o.get("title", ""), "description": o.get("description", "")})

    # -------------------------------------------------------------
    # Step 7: Description & Specifications (<div class="index-sizeFitDesc">)
    # -------------------------------------------------------------
    desc_el = soup.select_one(".pdp-product-description-content")
    description = desc_el.get_text(separator="\n", strip=True) if desc_el else None
    if not description and pdp_json.get("productDetails"):
        for pd in pdp_json.get("productDetails", []):
            if pd.get("description"):
                soup_desc = BeautifulSoup(pd["description"], "html.parser")
                description = soup_desc.get_text(separator="\n", strip=True)
                break

    specifications: Dict[str, str] = {}
    for row in soup.select(".index-sizeFitDesc .index-row, .index-tableContainer .index-row"):
        k = row.select_one(".index-rowKey")
        v = row.select_one(".index-rowValue")
        if k and v:
            specifications[k.get_text(strip=True)] = v.get_text(strip=True)
    if not specifications and pdp_json.get("articleAttributes"):
        for k, v in pdp_json["articleAttributes"].items():
            if v is not None:
                # Strip internal html if present
                clean_v = BeautifulSoup(str(v), "html.parser").get_text(separator=" ", strip=True) if "<" in str(v) else str(v)
                specifications[k] = clean_v

    # -------------------------------------------------------------
    # Step 8: Detailed Ratings & Reviews (<main class="detailed-reviews-reviewsContainer">)
    # -------------------------------------------------------------
    rating_breakdown: Dict[str, Any] = {}
    for bar in soup.select(".index-ratingBarContainer"):
        lvl = bar.select_one(".index-ratingLevel, .index-rating")
        cnt = bar.select_one(".index-count, progress")
        if lvl and cnt:
            level_num = lvl.get_text(strip=True)
            val = cnt.get("value") or cnt.get_text(strip=True)
            rating_breakdown[f"{level_num}_star"] = parse_number(val)
    if not rating_breakdown and pdp_json.get("ratings", {}).get("ratingInfo"):
        for r_info in pdp_json["ratings"]["ratingInfo"]:
            star = r_info.get("rating")
            c = r_info.get("count")
            if star is not None:
                rating_breakdown[f"{star}_star"] = c

    rev_info = pdp_json.get("ratings", {}).get("reviewInfo", {}) if isinstance(pdp_json.get("ratings"), dict) else {}

    photos_head = soup.select_one(".image-thumb-wrapper-headline")
    photos_count = parse_number(photos_head.get_text(strip=True)) if photos_head else None
    if photos_count is None:
        photos_count = parse_number(rev_info.get("reviewsImageCount"))

    customer_photos: List[str] = []
    # 1. Primary: Extract from reviewInfo.topImages
    for img_obj in (rev_info.get("topImages") or []):
        u = img_obj.get("imageUrl") if isinstance(img_obj, dict) else str(img_obj)
        if u and isinstance(u, str) and u.startswith("http") and u not in customer_photos:
            customer_photos.append(u)

    # 2. Extract from DOM if present
    for img in soup.select(".image-thumb-wrapper-container img.image-thumb-wrapper-image, .image-thumb-wrapper-container img"):
        src = img.get("src")
        if src and src.startswith("http") and src not in customer_photos:
            customer_photos.append(src)

    reviews_head = soup.select_one(".detailed-reviews-headline, .detailed-reviews-allReviews")
    reviews_count = parse_number(reviews_head.get_text(strip=True)) if reviews_head else None
    if reviews_count is None:
        reviews_count = parse_number(rev_info.get("reviewsCount"))

    user_reviews: List[Dict[str, Any]] = []
    seen_review_keys = set()

    # 1. Primary: Extract rich verified buyer reviews from window.__myx.pdpData.ratings.reviewInfo
    raw_reviews = (rev_info.get("topReviews") or []) + (rev_info.get("topImageReviews") or [])
    for r in raw_reviews:
        r_id = r.get("reviewId") or r.get("reviewText")
        if not r_id or r_id in seen_review_keys:
            continue
        seen_review_keys.add(r_id)

        # Format date from timestamp in milliseconds
        date_str = ""
        ts = r.get("timestamp")
        if ts:
            try:
                date_str = datetime.fromtimestamp(int(ts) / 1000).strftime("%d %b %Y")
            except Exception:
                date_str = str(ts)

        rev_photos = []
        for p_img in (r.get("reviewImages") or []):
            u = p_img.get("imageUrl") if isinstance(p_img, dict) else str(p_img)
            if u and isinstance(u, str) and u.startswith("http") and u not in rev_photos:
                rev_photos.append(u)
                if u not in customer_photos:
                    customer_photos.append(u)

        u_name = r.get("userName") or "Myntra Customer"
        r_text = clean_text(r.get("reviewText") or "")
        u_rating = parse_number(r.get("userRating"))

        user_reviews.append({
            "id": str(r.get("reviewId") or ""),
            "author": u_name,
            "userName": u_name,
            "rating": u_rating,
            "date": date_str,
            "text": r_text,
            "review": r_text,
            "title": clean_text(r.get("title") or ""),
            "photos": rev_photos,
            "images": rev_photos,
            "upvotes": parse_number(r.get("upvotes")) or 0,
            "downvotes": parse_number(r.get("downvotes")) or 0,
            "verifiedPurchase": True,
            "marketplace": "myntra"
        })

    # 2. Secondary: Fallback to DOM if rendered (.user-review-userReviewWrapper)
    for rev in soup.select(".user-review-userReviewWrapper"):
        text_el = rev.select_one(".user-review-reviewTextWrapper")
        user_text = clean_text(text_el.get_text(strip=True)) if text_el else None
        if not user_text or user_text in seen_review_keys:
            continue
        seen_review_keys.add(user_text)

        star_el = rev.select_one(".user-review-starRating")
        user_rating = parse_number(star_el.get_text(strip=True)) if star_el else None
        author_el = rev.select_one(".user-review-left span:nth-child(1)")
        author = author_el.get_text(strip=True) if author_el else "Myntra Customer"
        date_el = rev.select_one(".user-review-left span:nth-child(2)")
        rev_date = date_el.get_text(strip=True) if date_el else None

        rev_photos = []
        for p_img in rev.select(".image-thumb-wrapper-container img"):
            psrc = p_img.get("src")
            if psrc and psrc not in rev_photos:
                rev_photos.append(psrc)
                if psrc not in customer_photos:
                    customer_photos.append(psrc)

        user_reviews.append({
            "author": author,
            "userName": author,
            "rating": user_rating,
            "date": rev_date,
            "text": user_text,
            "review": user_text,
            "photos": rev_photos,
            "images": rev_photos,
            "verifiedPurchase": True,
            "marketplace": "myntra"
        })

    return {
        "id": product_code,
        "brand": brand,
        "name": name,
        "currency": "INR",
        "price": price,
        "mrp": mrp,
        "discount": discount,
        "vat_info": vat_info,
        "rating": rating,
        "rating_count": rating_count,
        "rating_breakdown": rating_breakdown,
        "seller": seller_name,
        "expiry_date": expiry_date,
        "sizes": sizes,
        "breadcrumbs": breadcrumbs,
        "images": images,
        "videos": videos,
        "description": description,
        "specifications": specifications,
        "offers": offers,
        "customer_photos_count": photos_count or len(customer_photos),
        "customer_photos": customer_photos,
        "total_reviews_count": reviews_count or len(user_reviews),
        "user_reviews": user_reviews,
        "reviews": user_reviews
    }


async def fetch_myntra_reviews_page(client: httpx.AsyncClient, product_id: str) -> List[Dict[str, Any]]:
    """Fetch additional reviews from dedicated https://www.myntra.com/reviews/{product_id} page."""
    url = f"https://www.myntra.com/reviews/{product_id}"
    try:
        r = await client.get(url, headers=DEFAULT_HEADERS, timeout=10.0, follow_redirects=True)
        if r.status_code != 200:
            return []
        html = r.text
        myx_idx = html.find("window.__myx =")
        if myx_idx == -1:
            return []
        start_brace = html.find("{", myx_idx)
        end_script = html.find("</script>", start_brace)
        if start_brace == -1 or end_script == -1:
            return []
        data = json.loads(html[start_brace:end_script].strip().rstrip(";"))
        raw_revs = data.get("reviewsData", {}).get("reviews", [])
        out = []
        for rev in raw_revs:
            u_name = rev.get("userName") or "Myntra Customer"
            r_text = clean_text(rev.get("review") or rev.get("reviewText") or "")
            if not r_text:
                continue
            photos = []
            for img in (rev.get("images") or rev.get("reviewImages") or []):
                u = img.get("imageUrl") if isinstance(img, dict) else str(img)
                if u and isinstance(u, str) and u.startswith("http"):
                    photos.append(u)
            out.append({
                "id": str(rev.get("id") or ""),
                "author": u_name,
                "userName": u_name,
                "rating": parse_number(rev.get("userRating")),
                "date": rev.get("updatedAt") or "",
                "text": r_text,
                "review": r_text,
                "photos": photos,
                "images": photos,
                "upvotes": parse_number(rev.get("upvotes")) or 0,
                "downvotes": parse_number(rev.get("downvotes")) or 0,
                "verifiedPurchase": True,
                "marketplace": "myntra"
            })
        return out
    except Exception:
        return []


async def fetch_product_pdp(client: httpx.AsyncClient, product_id: str, product_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Fetch product detail page and parse fields."""
    target_url = product_url if product_url and product_url.startswith("http") else f"https://www.myntra.com/{product_id}"

    try:
        resp = await client.get(target_url, headers=DEFAULT_HEADERS, timeout=15.0, follow_redirects=True)
        if resp.status_code == 200:
            parsed = parse_pdp_html(resp.text, fallback_id=product_id)
            parsed["url"] = str(resp.url)

            # If user_reviews is empty but product has ratings, try dedicated /reviews/{id} page
            if (not parsed.get("user_reviews") or len(parsed["user_reviews"]) == 0) and parsed.get("rating_count", 0):
                extra_revs = await fetch_myntra_reviews_page(client, product_id)
                if extra_revs:
                    parsed["user_reviews"] = extra_revs
                    parsed["reviews"] = extra_revs
                    for r in extra_revs:
                        for p in r.get("photos", []):
                            if p and p not in parsed["customer_photos"]:
                                parsed["customer_photos"].append(p)
                    parsed["customer_photos_count"] = len(parsed["customer_photos"])

            return parsed
        elif resp.status_code == 404:
            logging.warning(f"Product {product_id} returned 404 Not Found.")
            return None
        else:
            logging.warning(f"HTTP {resp.status_code} for product {product_id} ({target_url})")
            return None
    except Exception as e:
        logging.error(f"Error fetching product {product_id}: {e}")
        return None


def get_mongo_connection(mongo_uri: Optional[str] = None, db_name: Optional[str] = None):
    """Establish connection to MongoDB client and database with safety validation."""
    if pymongo is None:
        raise ImportError("pymongo is not installed. Please run 'pip install pymongo'.")
    uri = mongo_uri or DEFAULT_MONGO_URI
    target_db = db_name or DEFAULT_DB
    validate_db_safety(target_db)
    client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=10000)
    return client, client[target_db]


def init_price_update_stats() -> Dict[str, Any]:
    """Initialize change counters for PDP price updates."""
    return {
        "crawled_count": 0,
        "product_data_saved": 0,
        "products_updated": 0,
        "master_matched": 0,
        "master_updated": 0,
        "price_drops": 0,
        "price_hikes": 0,
        "price_unchanged": 0,
        "sample_drops": [],
        "sample_hikes": []
    }


def update_master_catalog_for_pdp(sk_coll, pdp_data: Dict[str, Any], stats: Optional[Dict[str, Any]] = None):
    """
    Update matching master SKU in scentkhoj.products when a PDP is crawled:
    - Updates mappings.myntra with latest price, mrp, discount, ratings
    - Recalculates lowest_price and lowest_marketplace across all stores
    - Detects price changes and records shift in price_history
    - Refreshes price_last_checked and updated_at
    """
    prod_id = str(pdp_data.get("id") or "")
    price = pdp_data.get("price")
    if not prod_id or price is None or price <= 0:
        return

    now_iso = datetime.now(timezone.utc).isoformat()
    today_str = datetime.now().strftime("%Y-%m-%d")
    mrp = pdp_data.get("mrp") or price
    discount = pdp_data.get("discount") or ""
    rating = pdp_data.get("rating")
    if rating is not None:
        try:
            rating = round(float(rating), 1)
        except Exception:
            pass
    rating_count = pdp_data.get("rating_count")
    url = pdp_data.get("url")
    images = pdp_data.get("images") or []
    image = images[0] if images else None

    # Find matching master product in scentkhoj.products
    int_id = int(prod_id) if prod_id.isdigit() else prod_id
    match_conditions = [
        {"mappings.myntra.id": prod_id},
        {"mappings.myntra.id": int_id},
        {"id": f"SK-MYN-{prod_id}"},
        {"id": prod_id}
    ]
    if url:
        match_conditions.append({"mappings.myntra.url": url})

    master_doc = sk_coll.find_one({"$or": match_conditions})
    if not master_doc:
        return

    if stats is not None:
        stats["master_matched"] += 1

    old_myn_mapping = master_doc.get("mappings", {}).get("myntra", {})
    old_price = old_myn_mapping.get("price") or master_doc.get("price") or 0
    price_changed = old_price > 0 and abs(old_price - price) >= 1

    updated_mappings = dict(master_doc.get("mappings") or {})
    new_myn_mapping = dict(old_myn_mapping)
    new_myn_mapping.update({
        "id": prod_id,
        "price": price,
        "mrp": mrp,
        "discount": discount,
        "in_stock": True
    })
    if rating is not None:
        new_myn_mapping["rating"] = rating
    if rating_count is not None:
        new_myn_mapping["rating_count"] = rating_count
    if url:
        new_myn_mapping["url"] = url
    if image and not new_myn_mapping.get("image"):
        new_myn_mapping["image"] = image
    if pdp_data.get("user_reviews"):
        new_myn_mapping["reviews"] = pdp_data["user_reviews"]
    if pdp_data.get("customer_photos"):
        new_myn_mapping["customer_photos"] = pdp_data["customer_photos"]

    updated_mappings["myntra"] = new_myn_mapping

    active_prices = []
    for store_key, store_data in updated_mappings.items():
        if store_data and isinstance(store_data, dict):
            st_price = store_data.get("price")
            if st_price and st_price > 0:
                active_prices.append((st_price, store_key))

    if active_prices:
        active_prices.sort(key=lambda x: x[0])
        lowest_price, lowest_marketplace = active_prices[0]
    else:
        lowest_price = price
        lowest_marketplace = "myntra"

    update_fields = {
        "mappings.myntra": new_myn_mapping,
        "store_count": len(updated_mappings),
        "price": lowest_price,
        "lowest_price": lowest_price,
        "lowest_marketplace": lowest_marketplace,
        "price_last_checked": now_iso,
        "updated_at": now_iso
    }

    if pdp_data.get("user_reviews") and not master_doc.get("reviews"):
        update_fields["reviews"] = pdp_data["user_reviews"]
    if pdp_data.get("customer_photos") and not master_doc.get("customer_photos"):
        update_fields["customer_photos"] = pdp_data["customer_photos"]

    if lowest_marketplace == "myntra":
        update_fields["price"] = lowest_price
        update_fields["mrp"] = max(mrp or 0, master_doc.get("mrp") or 0)
        update_fields["discount"] = discount
        dp_match = re.search(r"(\d+)%", str(discount or ""))
        if dp_match:
            update_fields["discount_percentage"] = int(dp_match.group(1))
        if rating is not None:
            update_fields["rating"] = rating
        if rating_count is not None:
            update_fields["rating_count"] = rating_count

    master_update_op = {"$set": update_fields}

    history = master_doc.get("price_history") or []
    if price_changed or not history:
        shift = round(price - old_price) if price_changed else 0
        history_entry = {
            "date": today_str,
            "timestamp": now_iso,
            "price": price,
            "mrp": mrp or price,
            "old_price": old_price,
            "change": shift,
            "marketplace": "myntra"
        }
        master_update_op["$push"] = {
            "price_history": {
                "$each": [history_entry],
                "$slice": -20
            }
        }
        master_update_op["$min"] = {"lowest_recorded_price": lowest_price}
        master_update_op["$max"] = {"highest_recorded_price": max(mrp or 0, master_doc.get("highest_recorded_price") or 0, master_doc.get("mrp") or 0)}

    sk_coll.update_one({"_id": master_doc["_id"]}, master_update_op)

    if stats is not None:
        stats["master_updated"] += 1
        if price_changed:
            if price < old_price:
                diff = round(old_price - price, 2)
                stats["price_drops"] += 1
                logging.info(f"  [PRICE DROP] {master_doc.get('title')[:45]} (ID: {prod_id}): INR {old_price} -> INR {price} (Save INR {diff})")
                if len(stats["sample_drops"]) < 5:
                    stats["sample_drops"].append({
                        "title": master_doc.get("title"),
                        "brand": master_doc.get("brand"),
                        "old_price": old_price,
                        "price": price,
                        "diff": diff,
                        "slug": master_doc.get("slug")
                    })
            else:
                diff = round(price - old_price, 2)
                stats["price_hikes"] += 1
                logging.info(f"  [PRICE HIKE] {master_doc.get('title')[:45]} (ID: {prod_id}): INR {old_price} -> INR {price} (+INR {diff})")
                if len(stats["sample_hikes"]) < 5:
                    stats["sample_hikes"].append({
                        "title": master_doc.get("title"),
                        "brand": master_doc.get("brand"),
                        "old_price": old_price,
                        "price": price,
                        "diff": diff,
                        "slug": master_doc.get("slug")
                    })
        else:
            stats["price_unchanged"] += 1


def run_master_catalog_sync() -> bool:
    """Run server/scripts/sync_catalog_skus.js --marketplace=myntra cleanly"""
    candidate_paths = [
        os.path.join(os.path.dirname(__file__), "..", "..", "server", "scripts", "sync_catalog_skus.js"),
        os.path.join(os.getcwd(), "server", "scripts", "sync_catalog_skus.js"),
        os.path.join(os.getcwd(), "..", "..", "server", "scripts", "sync_catalog_skus.js")
    ]
    script_path = None
    for p in candidate_paths:
        abs_p = os.path.abspath(p)
        if os.path.exists(abs_p):
            script_path = abs_p
            break

    if not script_path:
        logging.warning("sync_catalog_skus.js not found. Master Catalog records updated directly.")
        return False

    logging.info(f"Triggering Master SKU Synchronizer: node {script_path} --marketplace=myntra")
    try:
        proc = subprocess.run(["node", script_path, "--marketplace=myntra"], check=False)
        return proc.returncode == 0
    except Exception as e:
        logging.warning(f"Could not execute node sync_catalog_skus.js: {e}")
        return False


def print_pdp_price_update_summary(stats: Dict[str, Any], total_targeted: int, duration_secs: float):
    """Print executive summary table of PDP price update and crawl results."""
    mins, secs = divmod(int(duration_secs), 60)
    dur_str = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"

    print("\n" + "=" * 78)
    print("        MYNTRA PDP PRICE UPDATE & CATALOG VERIFICATION SUMMARY")
    print("=" * 78)
    print(f"  Finished At:                       {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Duration:                          {dur_str}")
    print(f"  Targeted Products:                 {total_targeted:,}")
    print(f"  Successfully Scraped PDPs:         {stats.get('product_data_saved', 0):,}")
    print(f"  Refreshed in `myntra.products`:     {stats.get('products_updated', 0):,}")
    print(f"  Matched Master SKUs (`scentkhoj`):    {stats.get('master_matched', 0):,}")
    print(f"  Master Catalog Prices Updated:     {stats.get('master_updated', 0):,}")
    print(f"  Verified Price Drops (Live Deals): {stats.get('price_drops', 0):,}")
    print(f"  Price Increases:                   {stats.get('price_hikes', 0):,}")
    print(f"  Prices Unchanged:                  {stats.get('price_unchanged', 0):,}")
    print("-" * 78)

    sample_drops = stats.get("sample_drops", [])
    if sample_drops:
        print("  >>> SAMPLE LIVE PRICE DROPS DETECTED <<<")
        for i, d in enumerate(sample_drops, 1):
            print(f"  [{i}] {d.get('title')}")
            print(f"      Brand: {d.get('brand')} | Shift: INR {d.get('old_price')} -> INR {d.get('price')} (SAVE INR {d.get('diff')})")
            if d.get("slug"):
                print(f"      Product URL: /products/{d.get('slug')}")
        print("-" * 78)
    print("=" * 78 + "\n")


async def run_pdp_crawler(
    limit: Optional[int] = None,
    concurrency: int = 3,
    skip_existing: bool = True,
    delay_range: tuple = (0.5, 1.5),
    mongo_uri: Optional[str] = None,
    mongo_db: Optional[str] = None,
    source_collection: Optional[str] = None,
    target_collection: Optional[str] = None,
    is_price_update: bool = False,
    sync_catalog: bool = True
):
    """
    Query search database (e.g. 'products') and fetch detailed PDP information,
    saving each product into 'product_data' collection in MongoDB.
    Synchronizes prices with 'products' and Master Catalog 'scentkhoj.products'.
    """
    start_time = time.time()
    stats = init_price_update_stats()

    client, db = get_mongo_connection(mongo_uri, mongo_db)
    sk_coll = db["products"]
    src_coll_name = source_collection or DEFAULT_COLLECTION
    tgt_coll_name = target_collection or DEFAULT_COLLECTION

    src_coll = db[src_coll_name]
    tgt_coll = db[tgt_coll_name]

    total_in_src = src_coll.count_documents({})
    logging.info(f"Connected to MongoDB. Source collection '{src_coll_name}' has {total_in_src} items.")

    # Find already scraped IDs in target collection if skip_existing is True
    existing_ids = set()
    if skip_existing:
        logging.info(f"Checking existing items in target collection '{tgt_coll_name}'...")
        existing_ids = set(tgt_coll.distinct("id"))
        logging.info(f"Found {len(existing_ids)} items already in '{tgt_coll_name}'.")

    # Build query
    query = {}
    if skip_existing and existing_ids:
        query = {"id": {"$nin": list(existing_ids)}}

    cursor = src_coll.find(query, {"id": 1, "url": 1, "name": 1, "brand": 1})
    if is_price_update:
        cursor = cursor.sort([("price_last_checked", 1)])
    if limit:
        cursor = cursor.limit(limit)

    products_to_crawl = list(cursor)
    total_to_crawl = len(products_to_crawl)

    if total_to_crawl == 0:
        logging.info("All items are already scraped or source collection is empty. Nothing to do!")
        client.close()
        return

    mode_label = "PRICE UPDATE & PDP RE-SCRAPE" if is_price_update else "STANDARD PDP CRAWL"
    logging.info(f"[{mode_label}] Targeting {total_to_crawl} products to crawl into '{tgt_coll_name}' (Concurrency: {concurrency}).")

    semaphore = asyncio.Semaphore(concurrency)
    completed_count = 0
    saved_count = 0

    async with httpx.AsyncClient(limits=httpx.Limits(max_connections=concurrency * 2)) as http_client:

        async def worker(prod: Dict[str, Any], idx: int):
            nonlocal completed_count, saved_count
            prod_id = clean_text(prod.get("id"))
            prod_url = prod.get("url")

            if not prod_id:
                return

            async with semaphore:
                # Polite delay
                delay = random.uniform(*delay_range)
                await asyncio.sleep(delay)

                pdp_data = await fetch_product_pdp(http_client, prod_id, prod_url)
                completed_count += 1

                if pdp_data and pdp_data.get("id"):
                    now_iso = datetime.now(timezone.utc).isoformat()
                    pdp_data["crawled_at"] = now_iso
                    pdp_data["price_last_checked"] = now_iso

                    # 1. Real-time upsert to MongoDB product_data collection
                    try:
                        tgt_coll.update_one(
                            {"id": pdp_data["id"]},
                            {"$set": pdp_data},
                            upsert=True
                        )
                        saved_count += 1
                        stats["product_data_saved"] += 1

                        # 2. Update price in source collection (myntra.products)
                        src_coll.update_one(
                            {"id": pdp_data["id"]},
                            {"$set": {
                                "price": pdp_data.get("price"),
                                "mrp": pdp_data.get("mrp"),
                                "discount": pdp_data.get("discount"),
                                "rating": pdp_data.get("rating"),
                                "rating_count": pdp_data.get("rating_count"),
                                "price_last_checked": now_iso
                            }}
                        )
                        stats["products_updated"] += 1

                        # 3. Update master catalog (scentkhoj.products) with price shift tracking
                        update_master_catalog_for_pdp(sk_coll, pdp_data, stats)

                        logging.info(
                            f"[{completed_count}/{total_to_crawl}] SAVED: {pdp_data.get('brand')} - {pdp_data.get('name')[:40]}... "
                            f"(ID: {pdp_data['id']}) | Price: INR {pdp_data.get('price')} ({pdp_data.get('discount')}) | "
                            f"Specs: {len(pdp_data.get('specifications', {}))} | Img: {len(pdp_data.get('images', []))} | "
                            f"Reviews: {len(pdp_data.get('user_reviews', []))}"
                        )
                    except Exception as err:
                        logging.error(f"Failed to upsert product {prod_id} to MongoDB: {err}")
                else:
                    logging.warning(f"[{completed_count}/{total_to_crawl}] SKIPPED: Failed to parse product {prod_id}")

        tasks = [worker(prod, i) for i, prod in enumerate(products_to_crawl, start=1)]
        await asyncio.gather(*tasks)

    elapsed_time = time.time() - start_time
    logging.info("=" * 65)
    logging.info(f"CRAWL FINISHED: Processed {completed_count}/{total_to_crawl} products in {elapsed_time:.1f}s.")
    logging.info(f"Total Successfully Upserted to '{tgt_coll_name}': {saved_count}")
    logging.info(f"Target Collection '{tgt_coll_name}' now has {tgt_coll.count_documents({})} total items.")
    logging.info("=" * 65)

    client.close()

    if sync_catalog:
        run_master_catalog_sync()

    print_pdp_price_update_summary(stats, total_to_crawl, elapsed_time)


def get_interactive_inputs():
    print("\n" + "=" * 65)
    print("      MYNTRA PDP CRAWLER & PRICE UPDATER")
    print("=" * 65)
    print("1. Select Option:")
    print("   [1] Price Update (Rescrape PDPs and update all prices properly across Master Catalog)")
    print("   [2] Standard PDP Crawl (Scrape un-crawled products into product_data)")
    mode_in = input("   Choice (1/2) [Default: 1]: ").strip()

    is_price_update = (mode_in != "2")

    limit_in = input(f"\n2. Enter max products to {'update' if is_price_update else 'crawl'} [Press Enter for 10, or 'all']: ").strip().lower()
    if limit_in in ["all", "0"]:
        limit = None
    elif limit_in.isdigit():
        limit = int(limit_in)
    else:
        limit = 10

    conc_in = input("\n3. Enter concurrency [Default: 3]: ").strip()
    concurrency = int(conc_in) if conc_in.isdigit() else 3

    if is_price_update:
        skip_existing = False  # Price update rescrapes items to check newest prices
    else:
        force_in = input("\n4. Rescrape already existing items in product_data? (y/N) [Default: N]: ").strip().lower()
        skip_existing = (force_in != "y")

    default_src = DEFAULT_COLLECTION
    src_in = input(f"\n{'4' if is_price_update else '5'}. Source Collection [Default: {default_src}]: ").strip()
    source_collection = src_in if src_in else default_src

    default_tgt = DEFAULT_COLLECTION
    tgt_in = input(f"\n{'5' if is_price_update else '6'}. Target Collection [Default: {default_tgt}]: ").strip()
    target_collection = tgt_in if tgt_in else default_tgt

    sync_in = input(f"\n{'6' if is_price_update else '7'}. Run Master Catalog Sync (sync_catalog_skus.js)? (Y/n) [Default: Y]: ").strip().lower()
    sync_catalog = (sync_in != "n")

    print("\n" + "-" * 65)
    print("Starting PDP Crawl with:")
    print(f" - Option/Mode: {'PRICE UPDATE (Rescrape & Sync Master Catalog)' if is_price_update else 'STANDARD PDP CRAWL'}")
    print(f" - Limit: {'ALL' if limit is None else limit}")
    print(f" - Concurrency: {concurrency}")
    print(f" - Skip Existing: {skip_existing}")
    print(f" - Source Collection: {source_collection}")
    print(f" - Target Collection: {target_collection}")
    print(f" - Master Catalog Sync: {'YES' if sync_catalog else 'NO'}")
    print("-" * 65 + "\n")

    return limit, concurrency, skip_existing, source_collection, target_collection, is_price_update, sync_catalog


def main():
    parser = argparse.ArgumentParser(description="Myntra Product Detail (PDP) Crawler & Price Updater")
    parser.add_argument("--limit", type=int, default=None, help="Max products to crawl (default: all un-crawled)")
    parser.add_argument("--concurrency", type=int, default=3, help="Concurrent request workers (default: 3)")
    parser.add_argument("--price-update", action="store_true", help="Run in Price Update mode (rescrape and update prices across Master Catalog)")
    parser.add_argument("--sync-catalog", action="store_true", default=True, help="Synchronize with Master Catalog (sync_catalog_skus.js)")
    parser.add_argument("--no-sync-catalog", dest="sync_catalog", action="store_false", help="Skip synchronizing with Master Catalog")
    parser.add_argument("--force", action="store_true", help="Re-scrape items even if already in product_data")
    parser.add_argument("--mongo-uri", type=str, default=None, help="MongoDB connection URI")
    parser.add_argument("--mongo-db", type=str, default=DEFAULT_DB, help=f"MongoDB database name (default: '{DEFAULT_DB}')")
    parser.add_argument("--source", type=str, default=DEFAULT_COLLECTION, help=f"Source collection (default: '{DEFAULT_COLLECTION}')")
    parser.add_argument("--target", type=str, default=DEFAULT_COLLECTION, help=f"Target collection (default: '{DEFAULT_COLLECTION}')")
    parser.add_argument("--non-interactive", action="store_true", help="Run without prompts using CLI arguments")

    args = parser.parse_args()

    sync_catalog = args.sync_catalog
    is_price_update = args.price_update

    if args.non_interactive or args.limit is not None or args.force or args.price_update:
        limit = args.limit
        concurrency = args.concurrency
        skip_existing = not (args.force or args.price_update)
        source_collection = args.source
        target_collection = args.target
    else:
        limit, concurrency, skip_existing, source_collection, target_collection, is_price_update, sync_catalog = get_interactive_inputs()

    asyncio.run(run_pdp_crawler(
        limit=limit,
        concurrency=concurrency,
        skip_existing=skip_existing,
        mongo_uri=args.mongo_uri,
        mongo_db=args.mongo_db,
        source_collection=source_collection,
        target_collection=target_collection,
        is_price_update=is_price_update,
        sync_catalog=sync_catalog
    ))


if __name__ == "__main__":
    main()
