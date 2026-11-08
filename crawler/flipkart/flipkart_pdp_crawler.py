#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Flipkart PDP (Product Detail Page) Crawler - ScentKhoj
Reads Flipkart listing products from MongoDB ('flipkart.products'),
fetches product detail pages, extracts rich specifications, fragrance pyramid notes
(Top, Heart, Base notes, Fragrance Family), variants, images, reviews, and seller details,
and real-time upserts into MongoDB ('flipkart.product_data').
"""

import os
import sys
import re
import json
import random
import logging
import argparse
import asyncio
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

# Force UTF-8 stdout on Windows console
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

# Setup Logging
os.makedirs('logs', exist_ok=True)
_file_handler = logging.FileHandler('logs/flipkart_pdp_crawler.log', encoding='utf-8')
_file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))

logging.basicConfig(
    level=logging.INFO,
    handlers=[_file_handler, _stream_handler]
)
logger = logging.getLogger("flipkart-pdp-crawler")

# BeautifulSoup
try:
    from bs4 import BeautifulSoup
except ImportError:
    logger.error("BeautifulSoup4 is required. Please run: pip install beautifulsoup4")
    BeautifulSoup = None

# MongoDB
try:
    import pymongo
    from pymongo import UpdateOne
except ImportError:
    pymongo = None
    UpdateOne = None

# dotenv
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env'))
    load_dotenv()
except ImportError:
    pass

# Import MakeupKhoj DB config and Category Mapper
_crawler_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _crawler_root not in sys.path:
    sys.path.insert(0, _crawler_root)

from db_config import get_db, COLLECTIONS, DB_NAME, DEFAULT_MONGO_URI, validate_db_safety

# Default Configuration (Unified listing + PDP inside flipkart_makeupkhoj)
DEFAULT_DB = DB_NAME  # 'makeupkhoj'
DEFAULT_SOURCE_COLLECTION = COLLECTIONS['flipkart']  # 'flipkart_makeupkhoj'
DEFAULT_TARGET_COLLECTION = COLLECTIONS['flipkart']  # 'flipkart_makeupkhoj'

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
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


# ==============================================================================
# Helper Normalization & Parsing Functions
# ==============================================================================
def clean_text(val: Any) -> str:
    """Clean string values, stripping excess spaces, zero-width chars and newlines."""
    if val is None:
        return ""
    s = str(val).replace("\r", "").replace("\n", " ").strip()
    s = re.sub(r"^[\u200b\s]+", "", s).strip()
    return re.sub(r"\s+", " ", s).strip()


def parse_number(val: Any) -> Optional[Any]:
    """Parse integer or float from strings or numbers, handling Lakh (L/Lakh), k, and commas."""
    if val is None or val == "" or val == "N/A":
        return None
    if isinstance(val, (int, float)):
        return val
    text = str(val).strip()

    # Check for Indian Lakh notation e.g. '1.2L+', '1.2 L', '1.5 Lakh'
    lakh_match = re.search(r"([\d.]+)\s*(?:lakh|l)\+?", text, re.I)
    if lakh_match:
        try:
            return int(float(lakh_match.group(1)) * 100000)
        except Exception:
            pass

    # Check for 'k' notation e.g. '9.6k'
    k_match = re.search(r"([\d.]+)\s*k", text, re.I)
    if k_match:
        try:
            return int(float(k_match.group(1)) * 1000)
        except Exception:
            pass

    tokens = [t.strip() for t in re.split(r"[\r\n\s]+", text) if t.strip()]
    for token in tokens:
        clean_tok = token.replace(",", "").replace("₹", "").replace("|", "").strip()
        match = re.search(r"[-+]?\d*\.?\d+", clean_tok)
        if match:
            num = float(match.group(0))
            return int(num) if num.is_integer() else num
    return None


def clean_flipkart_url(raw_url: str) -> str:
    """Ensure absolute clean Flipkart URL."""
    if not raw_url:
        return ""
    if raw_url.startswith("/"):
        return f"https://www.flipkart.com{raw_url}"
    elif not raw_url.startswith("http"):
        return f"https://www.flipkart.com/{raw_url.lstrip('/')}"
    return raw_url


# ==============================================================================
# Flipkart PDP Parser (Extracted from Live & User-Provided DOM)
# ==============================================================================
def parse_flipkart_pdp(html_content: str, fallback_id: Optional[str] = None, page_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Parse a Flipkart Product Detail Page HTML string into the unified ScentKhoj schema.
    """
    if not BeautifulSoup:
        raise ImportError("BeautifulSoup4 is required for parsing.")

    soup = BeautifulSoup(html_content, "html.parser")

    # Decompose script, style, and noscript tags to prevent internal JSON/styles from leaking into text queries
    for s_tag in soup(["script", "style", "noscript"]):
        s_tag.extract()


    # 1. Product ID / PID
    pid = fallback_id
    if not pid and page_url:
        pid_m = re.search(r"[?&]pid=([A-Z0-9]+)", page_url)
        if pid_m:
            pid = pid_m.group(1)
    if not pid:
        for a in soup.find_all("a", href=True):
            pid_m = re.search(r"[?&]pid=([A-Z0-9]+)", a["href"])
            if pid_m:
                pid = pid_m.group(1)
                break
    if not pid:
        pid_el = soup.find(attrs={"data-id": True})
        if pid_el:
            pid = pid_el.get("data-id")

    # 2. Breadcrumbs
    breadcrumbs = []
    bc_divs = soup.select("div._g4lWX div.vQDoqR") or soup.select("div.vQDoqR") or soup.select("div._3GIHBu")
    for b in bc_divs:
        a = b.find("a")
        if a and a.get_text(strip=True):
            txt = clean_text(a.get_text())
            href = clean_flipkart_url(a.get("href", ""))
            if txt and txt != "/":
                breadcrumbs.append({"title": txt, "url": href})

    bc_leaf_el = soup.select_one("div._g4lWX ~ div.v1zwn21n, div._g4lWX div.v1zwn21n")
    bc_leaf_title = clean_text(bc_leaf_el.get_text()) if bc_leaf_el else ""

    # 3. Product Title / Name
    h1 = soup.find("h1")
    title_raw = ""
    if h1:
        h1_copy = BeautifulSoup(str(h1), "html.parser").find("h1")
        for tag in h1_copy.find_all(lambda t: "more" in t.get_text().lower()):
            tag.decompose()
        title_raw = clean_text(h1_copy.get_text()).rstrip(". ")

    # 4. Specifications & Highlights
    specifications: Dict[str, str] = {}
    specifications_grouped: Dict[str, Dict[str, str]] = {}

    # Product Highlights (.grid-formation.grid-column-2)
    highlights: Dict[str, str] = {}
    for row in soup.select(".grid-formation.grid-column-2, ._21lJ10"):
        divs = row.find_all("div", recursive=False)
        if len(divs) >= 2:
            k = clean_text(divs[0].get_text())
            v = clean_text(divs[1].get_text())
            if k and v:
                highlights[k] = v
                specifications[k] = v

    # Dynamic Specifications (.grid-formation-dynamic or ._1s_Smc)
    current_section = "General"
    for container in soup.find_all(class_=re.compile(r"grid-formation\s+grid-column-1|_1psv1ze4i|_3k-BhJ")):
        sec_header = container.find(class_=re.compile(r"v1zwn24|v1zwn22|_2H87wv"))
        if sec_header and sec_header.get_text(strip=True) in ["In the Box", "General", "Additional Features", "Manufacturer info", "Dimensions"]:
            current_section = clean_text(sec_header.get_text())
            if current_section not in specifications_grouped:
                specifications_grouped[current_section] = {}

        dyn_rows = container.find_all(class_=re.compile(r"grid-formation-dynamic|_1s_Smc"))
        for d in dyn_rows:
            label_el = d.find(class_=re.compile(r"v1zwn28|v1zwn2o|_2H87wv|col-3-12"))
            val_el = d.find(class_=re.compile(r"v1zwn27|v1zwn26|v1zwn2n|_1NRrm1|col-9-12"))
            if label_el and val_el:
                k = clean_text(label_el.get_text())
                v = clean_text(val_el.get_text())
                if k and v:
                    specifications[k] = v
                    if current_section not in specifications_grouped:
                        specifications_grouped[current_section] = {}
                    specifications_grouped[current_section][k] = v

    # Traditional table rows fallback (._1s_Smc or .row)
    for tr in soup.select("table tr, ._3k-BhJ tr, ._1s_Smc"):
        cols = tr.find_all(["td", "th", "div"], recursive=False)
        if len(cols) >= 2:
            k = clean_text(cols[0].get_text())
            v = clean_text(cols[1].get_text())
            if k and v and len(k) < 50:
                specifications[k] = v
                if "General" not in specifications_grouped:
                    specifications_grouped["General"] = {}
                specifications_grouped["General"][k] = v

    # Manufacturer / Packer info rows
    manuf_origin_rows = soup.find_all(class_=re.compile(r"_1psv1ze0.*_1psv1ze2u|_1psv1ze0.*_1psv1ze53"))
    for r in manuf_origin_rows:
        label = r.find(class_=re.compile(r"v1zwn28"))
        val = r.find(class_=re.compile(r"v1zwn26|v1zwn27"))
        if label and val:
            k = clean_text(label.get_text())
            v = clean_text(val.get_text())
            if k in ["Country of Origin", "Generic Name", "Name and address of the Manufacturer", "Name and address of the Packer"]:
                specifications[k] = v
                if "Manufacturer info" not in specifications_grouped:
                    specifications_grouped["Manufacturer info"] = {}
                specifications_grouped["Manufacturer info"][k] = v

    # 5. Brand & Model Name
    brand = specifications.get("Brand")
    model_name = specifications.get("Model Name")

    if not brand and breadcrumbs:
        for bc in breadcrumbs:
            if "brand" in bc.get("url", "").lower() or "~brand" in bc.get("url", "").lower():
                brand = bc["title"].replace("Makeup", "").replace("Cosmetics", "").strip()
                break

    if not brand and title_raw:
        brand = title_raw.split()[0]
    if not brand:
        brand = "Makeup"

    # Full Name / Title resolution (prefer h1 title_raw over breadcrumb leaf candidate)
    if title_raw and not title_raw.startswith("#") and len(title_raw) > 5:
        full_name = title_raw
    elif bc_leaf_title and not bc_leaf_title.startswith("#") and len(bc_leaf_title) > 5:
        full_name = bc_leaf_title
    elif model_name:
        full_name = f"{brand} {model_name}" if not model_name.lower().startswith(brand.lower()) else model_name
    else:
        full_name = f"{brand} Makeup"

    # 6. Fragrance Notes & Olfactory Pyramid (ScentKhoj Core)
    top_notes = specifications.get("Top Notes") or specifications.get("Top Note")
    heart_notes = specifications.get("Heart Notes") or specifications.get("Heart Note")
    base_notes = specifications.get("Base Notes") or specifications.get("Base Note")
    fragrance_family = specifications.get("Fragrance Family") or specifications.get("Fragrance Type") or "Fresh"
    concentration = specifications.get("Fragrance Classification") or "Eau de Parfum"
    ideal_for = specifications.get("Ideal For") or "Men & Women"
    quantity = specifications.get("Quantity") or specifications.get("Net Quantity") or "Standard"

    # 7. Pricing, MRP & Discount
    price_el = soup.find(string=re.compile(r"^₹\s*\d+")) or soup.select_one(".Nx9bqj, .hZ3P6w, ._30jeq3")
    price = parse_number(price_el.get_text() if hasattr(price_el, 'get_text') else price_el) if price_el else None

    mrp_el = soup.find(style=re.compile(r"line-through", re.I)) or soup.select_one(".yRaY8j, .kRYCnD, ._3I9_wc")
    mrp = parse_number(mrp_el.get_text()) if mrp_el else None

    disc_el = soup.find(string=re.compile(r"\b\d+%\s*off\b|\b\d+%\b", re.I)) or soup.select_one(".UkUFwK, .HQe8jr, ._3Ay6Sb")
    discount_pct = parse_number(disc_el.get_text() if hasattr(disc_el, 'get_text') else disc_el) if disc_el else None
    discount = f"{int(discount_pct)}% OFF" if discount_pct else ""

    if mrp is None and price:
        mrp = price
    if not discount and mrp and price and mrp > price:
        discount_pct = round(((mrp - price) / mrp) * 100)
        discount = f"{discount_pct}% OFF"

    # Offer Badge & Applied Offers
    offer_badge_el = soup.find(string=re.compile(r"Top Discount|Special Price|Deal of the Day|Hot Deal", re.I))
    offer_badge = clean_text(offer_badge_el) if offer_badge_el else None

    offers: List[Dict[str, str]] = []
    applied_offer_el = soup.find(string=re.compile(r"applied for you", re.I))
    if applied_offer_el and applied_offer_el.parent:
        p_box = applied_offer_el.parent.parent
        off_title = p_box.find(string=re.compile(r"₹\d+\s*off", re.I))
        if off_title:
            offers.append({"title": clean_text(off_title), "description": "applied for you"})

    # 8. Rating & Rating Count
    rating_el = soup.select_one("a[href*='ratings-reviews'] div[dir='auto'], ._3LWZlK, div[class*='MKiFS6']")
    rating = parse_number(rating_el.get_text()) if rating_el else None
    if rating is None:
        r_box = soup.find(string=re.compile(r"based on .* ratings", re.I))
        if r_box and r_box.parent:
            parent_sec = r_box.parent.parent
            rating_candidate = parent_sec.find(string=re.compile(r"^\d\.\d$"))
            if rating_candidate:
                rating = parse_number(rating_candidate)

    rc_el = soup.find(string=re.compile(r"\|\s*[\d,]+")) or soup.select_one("span[class*='PvbNMB']")
    raw_rc_text = rc_el.get_text() if hasattr(rc_el, 'get_text') else (rc_el or "")
    rc_match = re.search(r"\|\s*([\d,]+)", str(raw_rc_text)) or re.search(r"\(([\d,]+)\)", str(raw_rc_text))
    if rc_match:
        rating_count = parse_number(rc_match.group(1))
    else:
        rating_count = parse_number(raw_rc_text)

    # Sanity check: rating counts are rarely above 10,000,000 for a perfume
    if rating_count and rating_count > 10000000:
        rating_count = None

    if rating_count is None:
        rc_match_str = soup.find(string=re.compile(r"based on ([\d,]+) ratings", re.I))
        if rc_match_str:
            rating_count = parse_number(rc_match_str)


    # 9. Gallery Images (High-Res 800/1070 or 1600/2140 Flixcart CDN URLs)
    images: List[str] = []
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if "flixcart.com/image/" in src and "blobio" not in src and "image/22c78488c0ad07f7" not in src:
            high_res = re.sub(r"image/\d+/\d+/", "image/800/1070/", src)
            if high_res not in images:
                images.append(high_res)

    for src_tag in soup.find_all("source", srcset=True):
        srcset = src_tag["srcset"]
        for part in srcset.split(","):
            url_match = re.search(r"(https://[^\s]+\.(?:jpeg|jpg|png|webp)[^\s]*)", part.strip())
            if url_match:
                u = url_match.group(1)
                if "flixcart.com/image/" in u and "blobio" not in u and "image/22c78488c0ad07f7" not in u:
                    high_res = re.sub(r"image/\d+/\d+/", "image/800/1070/", u)
                    if high_res not in images:
                        images.append(high_res)

    primary_image = images[0] if images else ""

    # 10. Selected Quantity & Available Variants
    selected_quantity = None
    sq_label = soup.find(string=re.compile(r"Selected Quantity:", re.I))
    if sq_label and sq_label.parent:
        parent_pill = sq_label.parent.parent or sq_label.parent
        val_candidate = parent_pill.find(class_=re.compile(r"v1zwn26|v1zwn27"))
        if val_candidate:
            selected_quantity = clean_text(val_candidate.get_text())

    variants: List[Dict[str, Any]] = []
    for a in soup.find_all("a", href=True):
        if "/p/itm" in a["href"] or "pid=" in a["href"]:
            size_txt = a.find(string=re.compile(r"^\d+\s*ml$|^\d+\s*g$", re.I))
            if size_txt:
                s_name = clean_text(size_txt)
                unit_price = ""
                up_el = a.find(string=re.compile(r"₹\d+/\d+ml|₹\d+/ml", re.I))
                if up_el:
                    unit_price = clean_text(up_el).strip("()")
                is_selected = (s_name == selected_quantity) if selected_quantity else False
                v_url = clean_flipkart_url(a["href"])
                variants.append({
                    "size": s_name,
                    "price_per_unit": unit_price,
                    "url": v_url,
                    "selected": is_selected,
                    "available": True
                })

    # 11. Description
    description = ""
    desc_el = soup.find(string=re.compile(r"We bring forth the broad assortment|broad assortment of Perfume", re.I))
    if desc_el:
        description = clean_text(desc_el)
    else:
        for p_cand in soup.find_all(class_=re.compile(r"v1zwn27|_1mXWrf")):
            t = clean_text(p_cand.get_text())
            if len(t) > 80 and any(w in t.lower() for w in ["perfume", "fragrance", "scent", "aroma"]):
                description = t
                break

    # 12. Seller Information
    seller_name = None
    seller_rating = None
    seller_experience = None

    seller_el = soup.find(string=re.compile(r"Seller:\s*", re.I)) or soup.select_one("#sellerName")
    if seller_el:
        seller_name = clean_text(seller_el).replace("Seller:", "").strip()
        # Find the tightest container that holds "years with Flipkart"
        curr = seller_el.parent
        for _ in range(5):
            if curr and curr.find(string=re.compile(r"years with Flipkart", re.I)):
                break
            if curr and curr.parent:
                curr = curr.parent

        if curr:
            exp_el = curr.find(string=re.compile(r"years with Flipkart", re.I))
            if exp_el:
                seller_experience = clean_text(exp_el)
            for cand in curr.find_all(string=re.compile(r"^\d\.\d$")):
                cand_num = parse_number(cand)
                # Seller rating is typically next to star icon inside the seller block
                if cand_num is not None:
                    seller_rating = cand_num
                    break



    # 13. Delivery Date & Policies
    delivery_date = None
    deliv_date_match = soup.find(string=re.compile(r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*\d+\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)", re.I))
    if deliv_date_match:
        delivery_date = clean_text(deliv_date_match)
    else:
        deliv_el = soup.find(string=re.compile(r"Delivery by", re.I))
        if deliv_el:
            deliv_container = deliv_el.find_parent(class_=re.compile(r"_1psv1zeku|_1psv1ze0")) or deliv_el.parent
            if deliv_container:
                for cand in deliv_container.find_all(string=True):
                    c_clean = clean_text(cand)
                    if c_clean and c_clean.lower() != "delivery by" and any(day in c_clean.lower() for day in ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "tomorrow", "today"]):
                        delivery_date = c_clean
                        break

    policies: List[str] = []
    for pol_kw in ["Cancellation", "return", "Cash on Delivery", "Flipkart Assured"]:
        found_el = soup.find(string=re.compile(pol_kw, re.I))
        if found_el:
            clean_pol = clean_text(found_el)
            if clean_pol and clean_pol not in policies:
                policies.append(clean_pol)

    # 14. Customer Feedback / Review Photos / Reviews
    customer_photos: List[str] = []
    features_loved: List[str] = []
    user_reviews: List[Dict[str, Any]] = []
    seen_review_texts = set()

    # Extract structured initial state JSON if present (available on direct HTTP PDP fetches)
    initial_state_data = None
    try:
        m_state = re.search(r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\});\s*(?:window|\n|</script>)', html_content, re.DOTALL)
        if m_state:
            initial_state_data = json.loads(m_state.group(1))
    except Exception as e:
        logger.debug(f"Could not parse window.__INITIAL_STATE__: {e}")

    # Method 0: Recursively extract customer photos, features loved, and reviews from window.__INITIAL_STATE__
    if initial_state_data:
        try:
            mws = initial_state_data.get('multiWidgetState', {})
            slots = mws.get('widgetsData', {}).get('slots', [])

            def _traverse_state_node(node):
                if not isinstance(node, (dict, list)):
                    return

                if isinstance(node, dict):
                    # 1. Customer Photos
                    dyn_url = node.get('dynamicImageUrl')
                    if dyn_url and isinstance(dyn_url, str) and 'blobio' in dyn_url:
                        p_url = dyn_url.replace('{@width}', '800').replace('{@height}', '1020').replace('{@quality}', '80')
                        if p_url not in customer_photos:
                            customer_photos.append(p_url)

                    # 2. Features Customers Loved
                    aspect = (
                        node.get('trackerData_0', {}).get('tracking', {}).get('aspectName') or
                        node.get('tracking', {}).get('aspectName')
                    )
                    if aspect and aspect not in features_loved:
                        features_loved.append(clean_text(aspect))

                    # 3. User Review Card
                    if 'likeDislikeData_0' in node:
                        r_rating = node.get('ratingData_0', {}).get('value', {}).get('rating', 5)
                        r_title = clean_text(node.get('label_0', {}).get('value', {}).get('text', ''))
                        r_date = clean_text(node.get('label_1', {}).get('value', {}).get('text', ''))
                        r_author = clean_text(node.get('label_3', {}).get('value', {}).get('text', 'Flipkart Customer'))
                        r_text = clean_text(
                            node.get('customEllipsisData_0', {}).get('value', {}).get('prependingText') or
                            node.get('richText_0', {}).get('value', {}).get('text') or ''
                        )
                        ld = node.get('likeDislikeData_0', {}).get('value', {})
                        likes = ld.get('upvoteCount')
                        dislikes = ld.get('downvoteCount')

                        review_key = (r_text or r_title).strip().lower()
                        if review_key and review_key not in seen_review_texts:
                            seen_review_texts.add(review_key)
                            user_reviews.append({
                                "author": r_author,
                                "userName": r_author,
                                "rating": int(r_rating) if r_rating else 5,
                                "title": r_title,
                                "date": r_date,
                                "review": r_text,
                                "text": r_text,
                                "photos": [],
                                "images": [],
                                "likes": int(likes) if likes is not None else None,
                                "dislikes": int(dislikes) if dislikes is not None else None,
                                "verified": True,
                                "verifiedPurchase": True,
                                "marketplace": "flipkart"
                            })

                    for v in node.values():
                        _traverse_state_node(v)

                elif isinstance(node, list):
                    for item in node:
                        _traverse_state_node(item)

            for s in slots:
                _traverse_state_node(s)

        except Exception as e:
            logger.debug(f"Error traversing INITIAL_STATE: {e}")

    # Fallback to pageDataResponse.seoData.schema[0].review if reviews still empty
    if not user_reviews and initial_state_data:
        try:
            mws = initial_state_data.get('multiWidgetState', {})
            schemas = mws.get('pageDataResponse', {}).get('seoData', {}).get('schema', [])
            for sch in schemas:
                for r in sch.get('review', []):
                    r_text = clean_text(r.get('reviewBody', ''))
                    r_title = clean_text(r.get('name', ''))
                    r_author = clean_text(r.get('author', {}).get('name', 'Flipkart Customer'))
                    r_date = clean_text(r.get('datePublished', ''))
                    r_rating = r.get('reviewRating', {}).get('ratingValue', 5)

                    review_key = (r_text or r_title).lower()
                    if not review_key or review_key in seen_review_texts:
                        continue
                    seen_review_texts.add(review_key)

                    user_reviews.append({
                        "author": r_author,
                        "userName": r_author,
                        "rating": int(r_rating) if r_rating else 5,
                        "title": r_title,
                        "date": r_date,
                        "review": r_text,
                        "text": r_text,
                        "photos": [],
                        "images": [],
                        "likes": None,
                        "dislikes": None,
                        "verified": True,
                        "verifiedPurchase": True,
                        "marketplace": "flipkart"
                    })
        except Exception as e:
            logger.debug(f"Error extracting reviews from SEO schema: {e}")

    # Method A: Extract high-resolution customer photos from review-image links (desktop & mobile DOM)
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "review-image" in href:
            m_img = re.search(r"imageId=([a-zA-Z0-9_\-\.]+)", href)
            if m_img:
                img_id = m_img.group(1)
                high_res = f"https://rukminim1.flixcart.com/blobio/800/1020/imr/{img_id}?q=80"
                if high_res not in customer_photos:
                    customer_photos.append(high_res)

    # Method B: Extract from img and source tags with blobio CDN
    for el in soup.find_all(["img", "source"]):
        src = el.get("src") or el.get("srcset") or el.get("data-src") or ""
        for part in src.split(","):
            u_m = re.search(r"(https://[^\s]+\.(?:jpeg|jpg|png|webp)[^\s]*)", part.strip())
            if u_m:
                u = u_m.group(1)
                if "blobio" in u and "flixcart.com" in u:
                    high_res = re.sub(r"blobio/\d+/\d+/", "blobio/800/1020/", u)
                    high_res = re.sub(r"\?q=\d+", "?q=80", high_res)
                    if high_res not in customer_photos:
                        customer_photos.append(high_res)

    if not features_loved:
        f_loved_header = soup.find(string=re.compile(r"Features customers loved", re.I))
        if f_loved_header:
            header_el = f_loved_header.parent
            section = header_el.find_parent(class_=re.compile(r"_1psv1zegu|_1psv1zegj")) or header_el.parent
            if section:
                for item in section.find_all(class_=re.compile(r"v1zwn26|v1zwn27|v1zwn28")):
                    txt = clean_text(item.get_text())
                    if txt and txt != "Features customers loved" and len(txt) < 30 and txt not in features_loved:
                        features_loved.append(txt)

    if not features_loved:
        for a in soup.find_all("a", href=True):
            if "an=" in a["href"] and ("mid=FLIPKART" in a["href"] or "cat=Fragrance" in a["href"]):
                txt = clean_text(a.get_text())
                if txt and txt not in features_loved:
                    features_loved.append(txt)

    if not features_loved:
        for tag_cand in ["Quality", "Fragrance", "Long Lasting", "Skin Friendly", "Value for Money", "Design", "Packaging"]:
            el = soup.find(string=re.compile(rf"^\s*{re.escape(tag_cand)}\s*$", re.I))
            if el and tag_cand not in features_loved:
                features_loved.append(tag_cand)

    # 15. User reviews from DOM tags (Supports both new horizontal card rail .vQDoqR and traditional review containers)
    rev_cards = soup.find_all(class_=re.compile(r"vQDoqR|_16PBlq|col\s+_2wzgFH|_27M-vq|EPCmJX"))
    for rc in rev_cards:
        # Verify it is an actual review card (not breadcrumbs or unrelated elements)
        has_review_marker = (
            rc.find(string=re.compile(r"Verified Buyer|Certified Buyer", re.I)) or
            rc.find(string=re.compile(r"ago|months?|years?|days?", re.I)) or
            rc.find(class_=re.compile(r"v1zwn27|t-ZTKy|_2-N8zT"))
        )
        if not has_review_marker:
            continue

        # Rating (1 to 5)
        rating_badge = (
            rc.find(string=re.compile(r"^[1-5]$")) or
            rc.find(class_=re.compile(r"_3LWZlK")) or
            rc.find(class_=re.compile(r"css-146c3p1"))
        )
        user_rating = None
        if rating_badge:
            raw_r = clean_text(rating_badge.get_text() if hasattr(rating_badge, 'get_text') else rating_badge)
            m_r = re.match(r"^([1-5])(?:\.0)?$", raw_r)
            if m_r:
                user_rating = int(m_r.group(1))

        # Review Title
        title_el = rc.find(class_=re.compile(r"v1zwn24|_2-N8zT"))
        title_text = clean_text(title_el.get_text()) if title_el else ""

        # Review Text
        rev_text_el = rc.find(class_=re.compile(r"v1zwn27|t-ZTKy")) or rc.find("a", href=re.compile(r"product-reviews"))
        rev_text = ""
        if rev_text_el:
            txt_copy = BeautifulSoup(str(rev_text_el), "html.parser")
            for m in txt_copy.find_all(string=re.compile(r"^more$", re.I)):
                if m.parent:
                    m.parent.decompose()
            rev_text = clean_text(txt_copy.get_text(" ", strip=True)).rstrip(". ")

        if not rev_text and not title_text:
            continue

        review_key = (rev_text or title_text).lower()
        if review_key in seen_review_texts:
            continue
        seen_review_texts.add(review_key)

        # Date
        time_el = rc.find(string=re.compile(r"ago|months?|years?|days?|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*,?\s*\d{2,4}\b", re.I))
        date_text = clean_text(time_el) if time_el else ""

        # Author Name
        author_text = ""
        for cand in rc.find_all(class_=re.compile(r"v1zwn28|v1zwn2n|_2sc7ZR")):
            t = clean_text(cand.get_text())
            if t and t != "Verified Buyer" and "based on" not in t.lower() and len(t) < 50:
                author_text = t
                break
        if not author_text:
            author_text = "Flipkart Customer"

        # Helpful votes (Likes & Dislikes)
        likes, dislikes = None, None
        num_badges = [t.get_text(strip=True) for t in rc.find_all(class_=re.compile(r"css-146c3p1|_3c3Px5")) if t.get_text(strip=True).isdigit()]
        if len(num_badges) >= 3:
            likes = int(num_badges[1])
            dislikes = int(num_badges[2])

        # Attached Review Photos
        card_photos: List[str] = []
        for p_img in rc.find_all("img"):
            psrc = p_img.get("src") or p_img.get("data-src") or ""
            if "blobio" in psrc and "flixcart.com" in psrc:
                high_p = re.sub(r"blobio/\d+/\d+/", "blobio/800/1020/", psrc)
                high_p = re.sub(r"\?q=\d+", "?q=80", high_p)
                if high_p not in card_photos:
                    card_photos.append(high_p)
                if high_p not in customer_photos:
                    customer_photos.append(high_p)

        user_reviews.append({
            "author": author_text,
            "userName": author_text,
            "rating": user_rating or 5,
            "title": title_text,
            "date": date_text,
            "review": rev_text,
            "text": rev_text,
            "photos": card_photos,
            "images": card_photos,
            "likes": likes,
            "dislikes": dislikes,
            "verified": True,
            "verifiedPurchase": True,
            "marketplace": "flipkart"
        })

    target_id = pid or fallback_id or "UNKNOWN"

    return {
        "id": target_id,
        "pid": target_id,
        "brand": brand,
        "name": full_name,
        "title": full_name,
        "model_name": model_name,
        "currency": "INR",
        "price": price,
        "mrp": mrp,
        "discount": discount,
        "discount_percentage": int(discount_pct) if discount_pct else 0,
        "offer_badge": offer_badge,
        "offers": offers,
        "rating": rating,
        "rating_count": rating_count,
        "reviews_count": rating_count,
        "size": selected_quantity or quantity,
        "sizes": variants if variants else [{"size": selected_quantity or quantity, "available": True, "selected": True}],
        "selected_size": selected_quantity,
        "seller": seller_name or "Flipkart Assured Partner",
        "seller_info": {
            "name": seller_name,
            "rating": seller_rating,
            "experience": seller_experience
        },
        "delivery_date": delivery_date,
        "policies": policies,
        "breadcrumbs": breadcrumbs,
        "images": images,
        "image": primary_image,
        "highlights": highlights,
        "specifications": specifications,
        "specifications_grouped": specifications_grouped,
        "top_notes": top_notes,
        "heart_notes": heart_notes,
        "middle_notes": heart_notes,
        "base_notes": base_notes,
        "fragrance_family": fragrance_family,
        "concentration": concentration,
        "gender": ideal_for,
        "description": description,
        "features_loved": features_loved,
        "customer_photos": customer_photos,
        "customer_photos_count": len(customer_photos),
        "user_reviews": user_reviews,
        "reviews": user_reviews,
        "total_reviews_count": len(user_reviews),
        "marketplace": "flipkart",
        "marketplace_name": "Flipkart"
    }


# ==============================================================================
# HTTP Request Executor (Async via asyncio.to_thread)
# ==============================================================================
def _fetch_html_sync(url: str, timeout: float = 12.0) -> Optional[str]:
    """Fetch raw HTML using standard urllib with desktop headers."""
    req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            if res.getcode() == 200:
                return res.read().decode("utf-8", errors="ignore")
            else:
                logger.warning(f"HTTP {res.getcode()} for {url}")
                return None
    except urllib.error.HTTPError as e:
        logger.warning(f"HTTP Error {e.code} for {url}: {e.reason}")
        return None
    except Exception as e:
        logger.error(f"Error fetching URL {url}: {e}")
        return None


async def fetch_product_pdp(prod_id: str, prod_url: str) -> Optional[Dict[str, Any]]:
    """Fetch product detail page asynchronously and parse fields."""
    target_url = clean_flipkart_url(prod_url) if prod_url else f"https://www.flipkart.com/search?q={prod_id}"
    html = await asyncio.to_thread(_fetch_html_sync, target_url)
    if not html:
        return None

    try:
        parsed = parse_flipkart_pdp(html, fallback_id=prod_id, page_url=target_url)
        parsed["url"] = target_url
        return parsed
    except Exception as e:
        logger.error(f"Failed to parse Flipkart PDP for ID {prod_id}: {e}")
        return None


# ==============================================================================
# MongoDB Connection Manager
# ==============================================================================
def get_mongo_connection(mongo_uri: Optional[str] = None, db_name: Optional[str] = None):
    """Establish connection to MongoDB client and target database."""
    if pymongo is None:
        raise ImportError("pymongo is not installed. Please run 'pip install pymongo'.")
    uri = mongo_uri or DEFAULT_MONGO_URI
    target_db = db_name or DEFAULT_DB
    validate_db_safety(target_db)
    client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=10000)
    client.admin.command('ping')
    return client, client[target_db]


# ==============================================================================
# Core PDP Crawler Pipeline
# ==============================================================================
async def run_flipkart_pdp_crawler(
    limit: Optional[int] = None,
    concurrency: int = 3,
    skip_existing: bool = True,
    delay_range: Tuple[float, float] = (0.5, 1.5),
    mongo_uri: Optional[str] = None,
    mongo_db: Optional[str] = None,
    source_collection: Optional[str] = None,
    target_collection: Optional[str] = None,
    mode: str = "pending",
):
    """
    Query Flipkart listing database ('makeupkhoj.flipkart_makeupkhoj') and extract full PDP details.
    - mode='pending': Scrapes un-crawled products only.
    - mode='all': Re-scrapes ALL catalog products to detect price changes, update reviews, and sync price history.
    """
    client, db = get_mongo_connection(mongo_uri, mongo_db)
    src_coll_name = source_collection or DEFAULT_SOURCE_COLLECTION
    tgt_coll_name = target_collection or DEFAULT_TARGET_COLLECTION

    src_coll = db[src_coll_name]
    tgt_coll = db[tgt_coll_name]
    sk_coll = db['products']

    # Ensure indexes on target collection safely
    try:
        existing_indexes = tgt_coll.index_information()
        for field in ("id", "brand", "category_path", "price", "price_last_checked"):
            existing = [spec for spec in existing_indexes.values() if list(spec.get("key", [])) == [(field, 1)]]
            if existing:
                continue
            tgt_coll.create_index(field, unique=False)
    except Exception as e:
        logger.warning(f"Could not verify or create index: {e}")

    total_in_src = src_coll.count_documents({})
    logger.info(f"Connected to MongoDB. Source collection '{src_coll_name}' has {total_in_src} items | Target: '{tgt_coll_name}'.")

    # Build query according to mode
    is_all_mode = (mode == "all" or not skip_existing)
    if is_all_mode:
        logger.info(f"[CRAWL MODE: ALL CATALOG] Re-checking all Flipkart products to track price shifts, reviews & counts.")
        cursor = src_coll.find({}, {"id": 1, "pid": 1, "url": 1, "name": 1, "title": 1, "brand": 1, "rating": 1, "rating_count": 1, "reviews_count": 1, "image": 1})
    else:
        logger.info(f"[CRAWL MODE: PENDING ONLY] Targeting unscraped Flipkart products.")
        query = {"$or": [{"pdp_scraped": {"$ne": True}}, {"pdp_scraped": {"$exists": False}}]}
        pending_count = src_coll.count_documents(query)
        logger.info(f"Found {pending_count} pending items in '{src_coll_name}'.")
        cursor = src_coll.find(query, {"id": 1, "pid": 1, "url": 1, "name": 1, "title": 1, "brand": 1, "rating": 1, "rating_count": 1, "reviews_count": 1, "image": 1})

    if limit:
        cursor = cursor.limit(limit)

    products_to_crawl = list(cursor)
    total_to_crawl = len(products_to_crawl)

    if total_to_crawl == 0:
        logger.info(f"No products to crawl in '{mode}' mode. Use --all to re-check all products!")
        client.close()
        return

    logger.info(f"Targeting {total_to_crawl} Flipkart products (Mode: {mode.upper()} | Concurrency: {concurrency}).")

    semaphore = asyncio.Semaphore(concurrency)
    completed_count = 0
    saved_count = 0

    async def worker(prod: Dict[str, Any], idx: int):
        nonlocal completed_count, saved_count
        prod_id = clean_text(prod.get("id") or prod.get("pid"))
        prod_url = prod.get("url")

        if not prod_id:
            return

        async with semaphore:
            # Polite randomized delay
            delay = random.uniform(*delay_range)
            await asyncio.sleep(delay)

            pdp_data = await fetch_product_pdp(prod_id, prod_url)
            completed_count += 1

            if pdp_data and pdp_data.get("id"):
                now_utc = datetime.now(timezone.utc)
                now_iso = now_utc.isoformat()
                today_str = now_utc.strftime("%Y-%m-%d")

                pdp_data["crawled_at"] = now_iso
                pdp_data["updated_at"] = now_iso
                pdp_data["price_last_checked"] = now_iso
                pdp_data["pdp_scraped"] = True
                pdp_data["pdp_scraped_at"] = now_iso

                # Fallback from listing document if PDP had missing fields
                if not pdp_data.get("rating") and prod.get("rating"):
                    pdp_data["rating"] = prod.get("rating")
                if not pdp_data.get("rating_count") and (prod.get("rating_count") or prod.get("reviews_count")):
                    pdp_data["rating_count"] = prod.get("rating_count") or prod.get("reviews_count")
                    pdp_data["reviews_count"] = pdp_data["rating_count"]
                if not pdp_data.get("image") and prod.get("image"):
                    pdp_data["image"] = prod.get("image")
                    if not pdp_data.get("images"):
                        pdp_data["images"] = [prod.get("image")]
                if (not pdp_data.get("name") or pdp_data.get("name") == "Perfume") and (prod.get("title") or prod.get("name")):
                    pdp_data["name"] = prod.get("title") or prod.get("name")
                    pdp_data["title"] = pdp_data["name"]

                new_price = pdp_data.get("price")
                mrp = pdp_data.get("mrp") or new_price
                if mrp is None and new_price is not None:
                    mrp = new_price
                elif new_price is None and mrp is not None:
                    new_price = mrp
                pdp_data["price"] = new_price
                pdp_data["mrp"] = mrp

                # Check existing document for price shifts & review changes
                existing = tgt_coll.find_one({"id": pdp_data["id"]})
                update_ops = {"$set": pdp_data}
                price_shift_detected = False
                old_price = None

                if existing:
                    old_price = existing.get("price")
                    existing_history = existing.get("price_history") or []

                    if new_price is not None and old_price is not None and round(float(old_price)) != round(float(new_price)):
                        price_shift_detected = True
                        shift = round(float(new_price) - float(old_price))
                        history_entry = {
                            "date": today_str,
                            "timestamp": now_iso,
                            "price": new_price,
                            "old_price": old_price,
                            "mrp": mrp or new_price,
                            "change": shift,
                            "marketplace": "flipkart"
                        }
                        if shift < 0:
                            logger.info(f"  [PRICE DROP] Flipkart ID {prod_id}: ₹{old_price} -> ₹{new_price} (Save ₹{abs(shift)} / Price Drop!)")
                        else:
                            logger.info(f"  [PRICE HIKE] Flipkart ID {prod_id}: ₹{old_price} -> ₹{new_price} (+₹{shift})")

                        update_ops["$push"] = {
                            "price_history": {
                                "$each": [history_entry],
                                "$slice": -30
                            }
                        }
                        update_ops["$min"] = {"lowest_recorded_price": new_price}
                        update_ops["$max"] = {"highest_recorded_price": max(mrp or new_price, existing.get("highest_recorded_price", 0))}
                    elif not existing_history and new_price is not None:
                        history_entry = {
                            "date": today_str,
                            "timestamp": now_iso,
                            "price": new_price,
                            "old_price": new_price,
                            "mrp": mrp or new_price,
                            "change": 0,
                            "marketplace": "flipkart"
                        }
                        update_ops["$push"] = {
                            "price_history": {
                                "$each": [history_entry],
                                "$slice": -30
                            }
                        }
                        update_ops["$min"] = {"lowest_recorded_price": new_price}
                        update_ops["$max"] = {"highest_recorded_price": mrp or new_price}

                    old_rating = existing.get("rating")
                    new_rating = pdp_data.get("rating")
                    old_rc = existing.get("rating_count") or existing.get("reviews_count")
                    new_rc = pdp_data.get("rating_count") or pdp_data.get("reviews_count")
                    if (new_rating and old_rating and new_rating != old_rating) or (new_rc and old_rc and new_rc != old_rc):
                        logger.info(f"  [REVIEWS UPDATED] Flipkart ID {prod_id}: Rating {old_rating}★ -> {new_rating}★ | Reviews: {old_rc} -> {new_rc}")

                else:
                    pdp_data["created_at"] = now_iso
                    if new_price is not None:
                        history_entry = {
                            "date": today_str,
                            "timestamp": now_iso,
                            "price": new_price,
                            "old_price": new_price,
                            "mrp": mrp or new_price,
                            "change": 0,
                            "marketplace": "flipkart"
                        }
                        update_ops["$push"] = {
                            "price_history": {
                                "$each": [history_entry],
                                "$slice": -30
                            }
                        }
                        pdp_data["lowest_recorded_price"] = new_price
                        pdp_data["highest_recorded_price"] = mrp or new_price

                # Real-time upsert to target product_data collection
                try:
                    tgt_coll.update_one(
                        {"id": pdp_data["id"]},
                        update_ops,
                        upsert=True
                    )
                    # Also mark source listing as crawled
                    src_coll.update_one(
                        {"id": prod_id},
                        {"$set": {
                            "pdp_scraped": True,
                            "pdp_scraped_at": now_iso,
                            "pdp_crawled": True,
                            "pdp_updated_at": now_iso,
                            "price_last_checked": now_iso,
                            "price": new_price
                        }}
                    )

                    # Propagate updates to scentkhoj.products master catalog
                    try:
                        sk_update = {
                            "mappings.flipkart.price": new_price,
                            "mappings.flipkart.mrp": mrp,
                            "mappings.flipkart.rating": pdp_data.get("rating"),
                            "mappings.flipkart.rating_count": pdp_data.get("rating_count"),
                            "mappings.flipkart.reviews_count": pdp_data.get("rating_count") or len(pdp_data.get("reviews", [])),
                            "mappings.flipkart.updated_at": now_iso,
                            "price_last_checked": now_iso,
                            "updated_at": now_iso
                        }
                        if pdp_data.get("image"):
                            sk_update["mappings.flipkart.image"] = pdp_data["image"]
                        if pdp_data.get("images"):
                            sk_update["mappings.flipkart.images"] = pdp_data["images"]
                        if pdp_data.get("reviews"):
                            sk_update["mappings.flipkart.reviews"] = pdp_data["reviews"]
                        if pdp_data.get("customer_photos"):
                            sk_update["mappings.flipkart.customer_photos"] = pdp_data["customer_photos"]
                            sk_update["mappings.flipkart.customer_photos_count"] = len(pdp_data["customer_photos"])

                        sk_ops = {"$set": sk_update}
                        if pdp_data.get("customer_photos"):
                            sk_ops["$addToSet"] = {
                                "customer_photos": {"$each": pdp_data["customer_photos"]}
                            }

                        if price_shift_detected and old_price is not None:
                            history_entry = {
                                "date": today_str,
                                "timestamp": now_iso,
                                "price": new_price,
                                "old_price": old_price,
                                "mrp": mrp or new_price,
                                "change": round(float(new_price) - float(old_price)),
                                "marketplace": "flipkart"
                            }
                            sk_ops["$push"] = {
                                "price_history": {
                                    "$each": [history_entry],
                                    "$slice": -30
                                }
                            }
                            if new_price:
                                sk_ops["$min"] = {"lowest_recorded_price": new_price}

                        sk_filter = {
                            "$or": [
                                {"mappings.flipkart.id": pdp_data["id"]},
                                {"mappings.flipkart.pid": pdp_data["id"]},
                                {"mappings.flipkart.url": pdp_data.get("url")},
                                {"id": pdp_data["id"]},
                                {"id": f"SK-FK-{pdp_data['id']}"}
                            ]
                        }

                        sk_coll.update_many(sk_filter, sk_ops)

                        # If master product does not have reviews yet, populate from Flipkart
                        if pdp_data.get("reviews"):
                            sk_coll.update_many(
                                {
                                    "$and": [
                                        sk_filter,
                                        {
                                            "$or": [
                                                {"reviews": {"$exists": False}},
                                                {"reviews": None},
                                                {"reviews": {"$size": 0}}
                                            ]
                                        }
                                    ]
                                },
                                {"$set": {"reviews": pdp_data["reviews"]}}
                            )
                    except Exception as sk_err:
                        logger.debug(f"Scentkhoj sync note for Flipkart ID {prod_id}: {sk_err}")

                    saved_count += 1
                    notes_summary = f"Notes: [T: {pdp_data.get('top_notes') or 'N/A'}, H: {pdp_data.get('heart_notes') or 'N/A'}, B: {pdp_data.get('base_notes') or 'N/A'}]"
                    logger.info(
                        f"[{completed_count}/{total_to_crawl}] SAVED: {pdp_data.get('brand')} - {pdp_data.get('name')[:35]}... "
                        f"(ID: {pdp_data['id']}) | ₹{pdp_data.get('price')} ({pdp_data.get('discount')}) | "
                        f"Rating: {pdp_data.get('rating')}★ ({pdp_data.get('rating_count')}) | "
                        f"Images: {len(pdp_data.get('images', []))} | Specs: {len(pdp_data.get('specifications', {}))} | {notes_summary}"
                    )
                except Exception as err:
                    logger.error(f"Failed to upsert product {prod_id} to MongoDB: {err}")
            else:
                logger.warning(f"[{completed_count}/{total_to_crawl}] SKIPPED: Failed to fetch/parse product {prod_id} ({prod_url})")

    tasks = [worker(prod, i) for i, prod in enumerate(products_to_crawl, start=1)]
    await asyncio.gather(*tasks)

    logger.info("=" * 65)
    logger.info(f"FLIPKART PDP CRAWL FINISHED: Processed {completed_count}/{total_to_crawl} products (Mode: {mode.upper()}).")
    logger.info(f"Total Successfully Upserted to '{tgt_coll_name}': {saved_count}")
    logger.info(f"Target Collection '{tgt_coll_name}' now has {tgt_coll.count_documents({})} total documents.")
    logger.info("=" * 65)

    client.close()


# ==============================================================================
# Interactive Prompt
# ==============================================================================
def get_interactive_inputs():
    print("\n" + "=" * 65)
    print("      FLIPKART PDP CRAWLER -> MONGODB product_data")
    print("=" * 65)
    
    print("Select Crawling Mode:")
    print("  [1] Crawl PENDING products only (unscraped Flipkart listings) [DEFAULT]")
    print("  [2] Re-crawl ALL catalog products (check price changes, reviews, ratings)")
    mode_choice = input("Enter choice [1 or 2, default: 1]: ").strip()
    if mode_choice == "2":
        mode = "all"
        skip_existing = False
    else:
        mode = "pending"
        skip_existing = True

    limit_in = input("\nEnter max products to crawl [Press Enter for all, or number e.g. 50]: ").strip().lower()
    if limit_in == "all" or not limit_in:
        limit = None
    elif limit_in.isdigit():
        limit = int(limit_in)
    else:
        limit = None

    conc_in = input("\nEnter concurrency [Default: 3]: ").strip()
    concurrency = int(conc_in) if conc_in.isdigit() else 3

    default_src = DEFAULT_SOURCE_COLLECTION
    src_in = input(f"\nSource Collection [Default: {default_src}]: ").strip()
    source_collection = src_in if src_in else default_src

    target_collection = DEFAULT_TARGET_COLLECTION
    tgt_in = input(f"\nTarget Collection [Default: {target_collection}]: ").strip()
    if tgt_in:
        target_collection = tgt_in

    print("\n" + "-" * 65)
    print("Starting Flipkart PDP Crawl with:")
    print(f" - Mode: {mode.upper()}")
    print(f" - Limit: {'ALL' if limit is None else limit}")
    print(f" - Concurrency: {concurrency}")
    print(f" - Skip Existing: {skip_existing}")
    print(f" - Source Collection: {source_collection}")
    print(f" - Target Collection: {target_collection}")
    print("-" * 65 + "\n")

    return limit, concurrency, skip_existing, mode, source_collection, target_collection


# ==============================================================================
# Standalone Snippet Verification Test
# ==============================================================================
SAMPLE_FLIPKART_HTML = '''<div id="slot-list-container" class="ltwm06" style="--bottomBarHeight: 65px; --cachedHeaderHeight: 65px;"><div class="lQLKCP"><div class="fWi7J_" style="max-width: 1200px; width: 100%;"><div style="display: flex; width: 100%; flex-direction: column; background-color: rgb(255, 255, 255);"><div class="yiQOTv" style="max-width: 1200px; width: 100%;"><div class="CTTtEa" style="flex-direction: column; background-color: rgb(255, 255, 255); margin: 0px;"><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 0; --md-order: 0; --lg-order: 0; height: 100%; background-color: rgb(241, 243, 246); margin-top: 0px;"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="eea0b3b4-99d9-48e5-add0-c2cddadb1175"><div class="css-g5y9jx r-13awgt0 r-eqz5dr" style="background-color: rgb(255, 255, 255);"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="af3773b5-e886-4061-b037-da6be477169e"><div><div><div class="_1psv1zeb9 _1psv1ze0 _1psv1ze90 _1psv1ze2u _1psv1ze53 _1psv1zel6 _1psv1zeix" style="display: flex; flex-basis: auto; flex-direction: row; flex-shrink: 0; align-items: stretch; min-height: 0px; min-width: 0px; position: relative; z-index: 0; box-sizing: border-box; border-width: 0px;"><div class="css-g5y9jx"><div class="_g4lWX"><div class="faikzn" style="--paddingLeft: undefinedpx; --paddingRight: undefinedpx;"><div class="vQDoqR"><div class="_1psv1zeb9 _1psv1ze0" style="display: flex; flex-basis: auto; flex-direction: row; flex-shrink: 0; align-items: stretch; min-height: 0px; min-width: 0px; position: relative; z-index: 0; box-sizing: border-box; border-width: 0px;"><a class="v1zwn28 _1psv1zeb9 _1psv1ze0 _1o6mltlk4 v1zwn21o" href="/" font="default-fk-font-l" style="box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; color: rgb(112, 112, 112);">Home</a><div class="v1zwn21o v1zwn28 _1psv1zeb9 _1psv1ze0 _1psv1zeki _1psv1zei9" font="default-fk-font-m" style="color: rgb(112, 112, 112); box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; user-select: text;">/</div></div></div><div class="vQDoqR"><div class="_1psv1zeb9 _1psv1ze0" style="display: flex; flex-basis: auto; flex-direction: row; flex-shrink: 0; align-items: stretch; min-height: 0px; min-width: 0px; position: relative; z-index: 0; box-sizing: border-box; border-width: 0px;"><a class="v1zwn28 _1psv1zeb9 _1psv1ze0 _1o6mltlk4 v1zwn21o" href="/beauty-and-grooming/pr?sid=g9b&amp;marketplace=FLIPKART" font="default-fk-font-l" style="box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; color: rgb(112, 112, 112);">Beauty and Grooming</a><div class="v1zwn21o v1zwn28 _1psv1zeb9 _1psv1ze0 _1psv1zeki _1psv1zei9" font="default-fk-font-m" style="color: rgb(112, 112, 112); box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; user-select: text;">/</div></div></div><div class="vQDoqR"><div class="_1psv1zeb9 _1psv1ze0" style="display: flex; flex-basis: auto; flex-direction: row; flex-shrink: 0; align-items: stretch; min-height: 0px; min-width: 0px; position: relative; z-index: 0; box-sizing: border-box; border-width: 0px;"><a class="v1zwn28 _1psv1zeb9 _1psv1ze0 _1o6mltlk4 v1zwn21o" href="/beauty-and-grooming/fragrances/pr?sid=g9b,0yh&amp;marketplace=FLIPKART" font="default-fk-font-l" style="box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; color: rgb(112, 112, 112);">Fragrances</a><div class="v1zwn21o v1zwn28 _1psv1zeb9 _1psv1ze0 _1psv1zeki _1psv1zei9" font="default-fk-font-m" style="color: rgb(112, 112, 112); box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; user-select: text;">/</div></div></div><div class="vQDoqR"><div class="_1psv1zeb9 _1psv1ze0" style="display: flex; flex-basis: auto; flex-direction: row; flex-shrink: 0; align-items: stretch; min-height: 0px; min-width: 0px; position: relative; z-index: 0; box-sizing: border-box; border-width: 0px;"><a class="v1zwn28 _1psv1zeb9 _1psv1ze0 _1o6mltlk4 v1zwn21o" href="/beauty-and-grooming/fragrances/perfume/pr?sid=g9b,0yh,jhz&amp;marketplace=FLIPKART" font="default-fk-font-l" style="box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; color: rgb(112, 112, 112);">Perfume</a><div class="v1zwn21o v1zwn28 _1psv1zeb9 _1psv1ze0 _1psv1zeki _1psv1zei9" font="default-fk-font-m" style="color: rgb(112, 112, 112); box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; user-select: text;">/</div></div></div><div class="vQDoqR"><div class="_1psv1zeb9 _1psv1ze0" style="display: flex; flex-basis: auto; flex-direction: row; flex-shrink: 0; align-items: stretch; min-height: 0px; min-width: 0px; position: relative; z-index: 0; box-sizing: border-box; border-width: 0px;"><a class="v1zwn28 _1psv1zeb9 _1psv1ze0 _1o6mltlk4 v1zwn21o" href="/beauty-and-grooming/fragrances/perfume/eau-de-parfum/pr?sid=g9b,0yh,jhz,xys&amp;marketplace=FLIPKART" font="default-fk-font-l" style="box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; color: rgb(112, 112, 112);">Eau De Parfum</a><div class="v1zwn21o v1zwn28 _1psv1zeb9 _1psv1ze0 _1psv1zeki _1psv1zei9" font="default-fk-font-m" style="color: rgb(112, 112, 112); box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; user-select: text;">/</div></div></div><div class="vQDoqR"><div class="_1psv1zeb9 _1psv1ze0" style="display: flex; flex-basis: auto; flex-direction: row; flex-shrink: 0; align-items: stretch; min-height: 0px; min-width: 0px; position: relative; z-index: 0; box-sizing: border-box; border-width: 0px;"><a class="v1zwn28 _1psv1zeb9 _1psv1ze0 _1o6mltlk4 v1zwn21o" href="/beauty-and-grooming/fragrances/perfume/eau-de-parfum/gediya~brand/pr?sid=g9b,0yh,jhz,xys&amp;marketplace=FLIPKART" font="default-fk-font-l" style="box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; color: rgb(112, 112, 112);">Gediya Eau De Parfum</a><div class="v1zwn21o v1zwn28 _1psv1zeb9 _1psv1ze0 _1psv1zeki _1psv1zei9" font="default-fk-font-m" style="color: rgb(112, 112, 112); box-sizing: border-box; display: inline; white-space: pre-wrap; overflow-wrap: break-word; border-width: 0px; user-select: text;">/</div></div></div></div></div></div><div class="v1zwn21n v1zwn28 _1psv1zeb9 _1psv1ze0 _1psv1zek9" font="default-fk-font-m" style="color: rgb(51, 51, 51); box-sizing: border-box; display: inline; white-space: nowrap; overflow-wrap: normal; border-width: 0px; user-select: text; max-width: 100%; overflow: hidden; text-overflow: ellipsis;">Megnet 30ml perfume spray for women&amp;men long lasting prefume spray Eau de Parfum  -  30 ml</div></div></div></div></div></div></div></div></div></div></div></div></div><div class="fWi7J_" style="max-width: 1200px; width: 100%;"><div style="display: flex; width: 100%; flex-direction: column; background-color: rgb(255, 255, 255);"><div class="yiQOTv" style="max-width: 1200px; width: 100%;"><div class="CTTtEa" style="flex-direction: column; background-color: rgb(255, 255, 255); margin: 0px;"><div class="OmE16y" style="width: 100%; position: static;"><div class="CTTtEa" style="flex-direction: row; background-color: rgb(255, 255, 255); margin: 0px;"><div class="OmE16y" style="width: 58.3333%; position: sticky; z-index: 10;"><div class="CTTtEa" style="flex-direction: column; background-color: rgb(255, 255, 255); margin: 0px;"><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 2; --md-order: 2; --lg-order: 2; height: 100%; background-color: rgb(241, 243, 246); margin-top: 0px;"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="29a62a9f-1e23-4f85-9cc8-8117834aaf89"><div class="css-g5y9jx r-13awgt0 r-eqz5dr" style="background-color: rgb(255, 255, 255);"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="09e62a9a-99b8-4f01-b580-9e634c4f1b27"><div><div><div class="_1psv1zeb9 _1psv1ze0 _1psv1ze36 _1psv1ze5f" style="display: flex; flex: 1 1 0%; flex-flow: wrap; width: 700px;"><div class="_1psv1zeb9 _1psv1ze0 _7dzyg24z _1psv1zel6"><picture><img alt="Image" src="https://rukminim2.flixcart.com/image/800/1070/xif0q/perfume/d/x/f/30-megnet-30ml-perfume-perfume-gediya-men-women-original-imagty3bzdgdwyrt.jpeg?q=90"></picture></div><div class="_1psv1zeb9 _1psv1ze0 _7dzyg24z _1psv1zek9"><picture><img alt="Image" src="https://rukminim2.flixcart.com/image/800/1070/xif0q/perfume/p/j/w/30-megnet-30ml-perfume-spray-for-women-men-long-lasting-prefume-original-imahymx2fvjhjyzc.jpeg?q=90"></picture></div><div class="_1psv1zeb9 _1psv1ze0 _7dzyg24z _1psv1zel6"><picture><img alt="Image" src="https://rukminim2.flixcart.com/image/800/1070/xif0q/perfume/k/x/q/30-megnet-30ml-perfume-spray-for-women-men-long-lasting-prefume-original-imahqh4g6xgzfnhg.jpeg?q=90"></picture></div><div class="_1psv1zeb9 _1psv1ze0 _7dzyg24z _1psv1zek9"><picture><img alt="Image" src="https://rukminim2.flixcart.com/image/800/1070/xif0q/perfume/w/s/q/30-megnet-30ml-perfume-perfume-gediya-men-women-original-imagty3bpfpajmwd.jpeg?q=90"></picture></div><div class="_1psv1zeb9 _1psv1ze0 _7dzyg24z _1psv1zel6"><picture><img alt="Image" src="https://rukminim2.flixcart.com/image/800/1070/xif0q/perfume/z/c/h/30-megnet-30ml-perfume-spray-for-women-men-long-lasting-prefume-original-imahqh4gfvzgrmsb.jpeg?q=90"></picture></div></div></div></div></div></div></div></div></div></div></div><div class="OmE16y" style="width: 41.6667%; position: static;"><div class="CTTtEa" style="flex-direction: column; background-color: rgb(255, 255, 255); margin: 0px;"><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 3; --md-order: 3; --lg-order: 3; height: 100%; background-color: rgb(241, 243, 246); margin-top: 0px;"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="96b9e873-a028-4e5b-98bf-daa30a4556ec"><div class="css-g5y9jx r-13awgt0 r-eqz5dr" style="background-color: rgb(255, 255, 255);"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="bbd70823-99dc-4ae3-8f88-d1db77aa0c7f"><div><div><div class="css-g5y9jx"><div class="_1psv1zeb9 _1psv1ze0 _1psv1ze9x _1psv1ze7o _1psv1ze36 _1psv1ze53"><div class="v1zwn21n v1zwn24 _1psv1zeb9 _1psv1ze0">Selected Quantity:</div><div class="v1zwn21n v1zwn26 _1psv1zeb9 _1psv1ze0 _1psv1ze99">30 ml</div></div><div><a class="_1psv1zeb9 _1o6mltlk4 _1psv1zei0" href="/gediya-megnet-6ml-attar-roll-women-men-long-lasting-eau-de-parfum-6-ml/p/itmb60b708b0f44d?pid=PERGHY9SAVGAGGHM"><div class="v1zwn21n v1zwn26">6 ml</div><div class="v1zwn21o v1zwn2d">(₹1250/50ml)</div></a><a class="_1psv1zeb9 _1o6mltlk4 _1psv1zei0" href="/gediya-megnet-30ml-perfume-spray-women-men-long-lasting-prefume-eau-de-parfum-30-ml/p/itm1a2deba87dd61?pid=PERGHY9SMAMHH2YX"><div class="v1zwn2g v1zwn24">30 ml</div><div class="v1zwn21o v1zwn2d">(₹190/50ml)</div></a></div></div></div></div></div></div></div></div></div><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 4; --md-order: 4; --lg-order: 4; height: 100%; background-color: rgb(241, 243, 246); margin-top: 0px;"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="7fe17075-672e-4068-9bc0-3d71e2af6d37"><div class="css-g5y9jx r-13awgt0 r-eqz5dr" style="background-color: rgb(255, 255, 255);"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="8f93769f-a348-46fc-9942-b56d7946d935"><div><div><div class="_1psv1zeb9 _1psv1ze0"><h1 class="v1zwn21n v1zwn27 _1psv1zeb9 _1psv1ze0" style="color: rgb(51, 51, 51);">Gediya Megnet 30ml perfume spray for women&amp;men long lasting prefu...<div class="v1zwn21u v1zwn24 _1psv1zeb9 _1psv1ze0" style="color: rgb(17, 98, 242);">more</div></h1></div></div></div></div></div></div></div><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 5; --md-order: 5; --lg-order: 5; height: 100%; background-color: rgb(241, 243, 246); margin-top: 0px;"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="f43b6387-3921-4e1f-9146-642e2818b2ae"><div class="css-g5y9jx r-13awgt0 r-eqz5dr" style="background-color: rgb(255, 255, 255);"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="0fb3fcb9-3764-4929-bdb8-92ae8d512ac8"><div><div><a class="_1psv1zeb9 _1o6mltlk4" href="/ratings-reviews-details-page?pid=PERGHY9SMAMHH2YX&amp;lidPERGHY9SMAMHH2YX&amp;marketplace=FLIPKART"><div dir="auto" class="css-146c3p1" style="color: rgb(51, 51, 51); font-size: 14px; font-family: inter_bold;">4.1</div><div dir="auto" class="css-146c3p1" style="color: rgb(112, 112, 112); font-size: 14px;">| 1,382</div></a></div></div></div></div></div></div><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 6; --md-order: 6; --lg-order: 6; height: 100%; background-color: rgb(241, 243, 246); margin-top: 0px;"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="7a18c5c0-d16b-4ea5-833e-4ff055b0d956"><div class="css-g5y9jx r-13awgt0 r-eqz5dr" style="background-color: rgb(255, 255, 255);"><div data-observerid-d41faf87-c244-47f1-b5b1-63e1a066f3e4="bef3dceb-825d-4886-8bb5-0df3bb35a022"><div><div><div class="_1psv1zeb9 _1psv1ze0"><div dir="auto" class="css-146c3p1">Top Discount of the Sale</div><div class="v1zwn222 v1zwn20 _1psv1zeb9 _1psv1ze0 _1psv1zeif">62%</div><div class="v1zwn21o v1zwn21 _1psv1zeb9 _1psv1ze0 _1psv1zeif" style="text-decoration-line: line-through;">299</div><div class="v1zwn21n v1zwn20 _1psv1zeb9 _1psv1ze0">₹114</div><div class="v1zwn21n v1zwn2b _1psv1zeb9 _1psv1ze0 _1psv1ze9f">₹33 off</div><div class="v1zwn21n v1zwn26 _1psv1zeb9 _1psv1ze0 _1psv1ze99">applied for you</div></div></div></div></div></div></div></div><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 7; --md-order: 7; --lg-order: 7; height: 100%; background-color: rgb(241, 243, 246); margin-top: 0px;"><div class="v1zwn21n v1zwn24 _1psv1zeb9 _1psv1ze0 _1psv1zeki" font="s">Saturday, 31 Oct</div><div class="v1zwn26 _1psv1zeb9 _1psv1ze0" font="s">Seller: KrishnaPerfumery</div><div class="v1zwn21o v1zwn29 _1psv1zeb9 _1psv1ze0" font="s">3.8</div><div class="v1zwn21o v1zwn29 _1psv1zeb9 _1psv1ze0 _1psv1zei9" font="s">7 years with Flipkart</div></div></div><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 9; --md-order: 9; --lg-order: 9;"><div class="v1zwn21n v1zwn28">&ZeroWidthSpace;&ZeroWidthSpace;Cancellation upto 24hrs</div><div class="v1zwn21n v1zwn28">No\nreturns</div><div class="v1zwn21n v1zwn28">Cash on\nDelivery</div><div class="v1zwn21n v1zwn28">Flipkart\nAssured</div></div></div><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 13; --md-order: 13; --lg-order: 13;"><div class="v1zwn21n v1zwn22">Product highlights</div><div class="grid-formation grid-column-2"><div class="v1zwn21n v1zwn26">Fragrance Classification</div><div class="v1zwn21n v1zwn26">Eau de Parfum</div></div><div class="grid-formation grid-column-2"><div class="v1zwn21n v1zwn26">Ideal For</div><div class="v1zwn21n v1zwn26">Men &amp; Women</div></div><div class="grid-formation grid-column-2"><div class="v1zwn21n v1zwn26">Quantity</div><div class="v1zwn21n v1zwn26">30 ml</div></div></div></div><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 14; --md-order: 14; --lg-order: 14;"><div class="v1zwn21n v1zwn22">All details</div><div class="grid-formation grid-column-1"><div class="v1zwn21n v1zwn24">In the Box</div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Sales Package</div><div class="v1zwn21n v1zwn27">bottle</div></div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Pack of</div><div class="v1zwn21n v1zwn27">1</div></div></div><div class="grid-formation grid-column-1"><div class="v1zwn21n v1zwn24">General</div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Brand</div><div class="v1zwn21n v1zwn27">Gediya</div></div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Model Name</div><div class="v1zwn21n v1zwn27">Megnet 30ml perfume spray for women&amp;men long lasting prefume spray</div></div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Fragrance Classification</div><div class="v1zwn21n v1zwn27">Eau de Parfum</div></div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Ideal For</div><div class="v1zwn21n v1zwn27">Men &amp; Women</div></div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Quantity</div><div class="v1zwn21n v1zwn27">30 ml</div></div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Organic</div><div class="v1zwn21n v1zwn27">Yes</div></div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Fragrance Family</div><div class="v1zwn21n v1zwn27">Fresh</div></div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Base Notes</div><div class="v1zwn21n v1zwn27">Vanilla and Musk</div></div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Heart Notes</div><div class="v1zwn21n v1zwn27">Tuberose and Gardenia</div></div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Top Notes</div><div class="v1zwn21n v1zwn27">Floral</div></div></div><div class="grid-formation grid-column-1"><div class="v1zwn21n v1zwn24">Additional Features</div><div class="grid-formation-dynamic"><div class="v1zwn21o v1zwn28">Key Features</div><div class="v1zwn21n v1zwn27">30ml long lasting body spray, fresh perfume, Consists of refreshing, Target Audience: Women, Men</div></div></div><div><div class="v1zwn21n v1zwn27">We bring forth the broad assortment of Perfume SPRAY 30 ML in various sizes and modifications to suit the required needs of our consumers. It is formulated with the natural compounds which are procured from the trustworthy vendors of the industry. Proposed perfume ensures attractive fragrance and long extended shelf life. It comes in a stylish packaging and uplifts your mood in a positive manner. This perfume is the perfect gamut to gift your close ones on their memorable days.</div></div><div class="v1zwn21o v1zwn28">Country of Origin</div><div class="v1zwn21n v1zwn26">India</div><div class="v1zwn21o v1zwn28">Name and address of the Manufacturer</div><div class="v1zwn21n v1zwn26">KRISHNA PERFUMERY AND COSMETICS Plot no. 36-37, Ground Floor, Soham Industrial Estate, N.H. No. 41,Surat contact no-9898435570</div></div></div><div class="OmE16y" style="width: 100%; position: static;"><div class="asbjxx" style="--sm-order: 16; --md-order: 16; --lg-order: 16;"><div class="v1zwn21n v1zwn22">Ratings and reviews</div><div dir="auto" class="css-146c3p1" style="font-size: 20px;">4.1</div><div class="v1zwn21z v1zwn28">Very Good </div><div class="v1zwn21o v1zwn28">based on 1,382 ratings by</div><a class="_1psv1zeb9 _1o6mltlk4" href="/review-image-fullscreen?pid=PERGHY9SMAMHH2YX&amp;imageId=blobio-imr_ee4350a81d7d471d88ea5996c0b022f5.jpg"><picture><img src="https://rukminim2.flixcart.com/blobio/400/510/imr/blobio-imr_ee4350a81d7d471d88ea5996c0b022f5.jpg?q=90"></picture></a><div class="v1zwn21n v1zwn26">Quality</div><div class="v1zwn21n v1zwn26">Fragrance</div><div class="v1zwn21n v1zwn26">Long Lasting</div><div class="v1zwn21n v1zwn26">Skin Friendly</div><div class="v1zwn21n v1zwn26">Value for Money</div><div class="vQDoqR" style="width: 300px;"><div dir="auto" class="css-146c3p1" style="font-size: 14px;">5</div><div class="v1zwn21n v1zwn24">Brilliant</div><div class="v1zwn21o v1zwn29">4 years ago</div><div class="v1zwn21n v1zwn27">Fragrance is Very Good fresh Awsome but I was expe...</div><div class="v1zwn21n v1zwn28">Md Shadab  Akhtar</div><div class="v1zwn21o v1zwn29">Verified Buyer</div></div></div></div></div></div></div></div>'''

def run_snippet_verification():
    logger.info("Running verification test against user-provided Flipkart HTML snippet...")
    parsed = parse_flipkart_pdp(SAMPLE_FLIPKART_HTML)
    print("\n--- EXTRACTED FLIPKART PDP DATA ---")
    print(json.dumps(parsed, indent=2, ensure_ascii=False))
    print("-----------------------------------\n")

    assert parsed["brand"] == "Gediya", f"Brand check failed: {parsed['brand']}"
    assert parsed["price"] == 114, f"Price check failed: {parsed['price']}"
    assert parsed["mrp"] == 299, f"MRP check failed: {parsed['mrp']}"
    assert parsed["discount"] == "62% OFF", f"Discount check failed: {parsed['discount']}"
    assert parsed["rating"] == 4.1, f"Rating check failed: {parsed['rating']}"
    assert parsed["rating_count"] == 1382, f"Rating count check failed: {parsed['rating_count']}"
    assert parsed["top_notes"] == "Floral", f"Top notes check failed: {parsed['top_notes']}"
    assert parsed["heart_notes"] == "Tuberose and Gardenia", f"Heart notes check failed: {parsed['heart_notes']}"
    assert parsed["base_notes"] == "Vanilla and Musk", f"Base notes check failed: {parsed['base_notes']}"
    assert parsed["fragrance_family"] == "Fresh", f"Fragrance family check failed: {parsed['fragrance_family']}"
    assert len(parsed["images"]) >= 5, f"Images count check failed: {len(parsed['images'])}"
    assert len(parsed["sizes"]) >= 2, f"Variants check failed: {len(parsed['sizes'])}"
    assert parsed["seller_info"]["name"] == "KrishnaPerfumery", f"Seller name failed: {parsed['seller_info']['name']}"
    assert parsed["seller_info"]["rating"] == 3.8, f"Seller rating failed: {parsed['seller_info']['rating']}"
    assert parsed["seller_info"]["experience"] == "7 years with Flipkart", f"Seller experience failed: {parsed['seller_info']['experience']}"
    logger.info(">>> [TEST PASSED] Flipkart PDP extractor validated 100% successfully! <<<")


# ==============================================================================
# CLI Entrypoint
# ==============================================================================
def main():
    parser = argparse.ArgumentParser(description="MakeupKhoj Flipkart Product Detail (PDP) Crawler")
    parser.add_argument("--mode", choices=["all", "pending"], default=None, help="Crawl mode: 'all' to re-crawl entire catalog (update prices, price history, reviews), 'pending' for unscraped products only")
    parser.add_argument("--all", dest="run_all", action="store_true", help="Re-crawl ALL catalog products (check price changes, record price history, update reviews/ratings)")
    parser.add_argument("--pending", dest="run_pending", action="store_true", help="Crawl ONLY pending / unscraped products")
    parser.add_argument("--limit", type=int, default=None, help="Max products to crawl (default: all)")
    parser.add_argument("--concurrency", type=int, default=3, help="Concurrent request workers (default: 3)")
    parser.add_argument("--force", action="store_true", help="Re-scrape items even if already in product_data (alias for --all)")
    parser.add_argument("--mongo-uri", type=str, default=None, help="MongoDB connection URI")
    parser.add_argument("--mongo-db", type=str, default=DEFAULT_DB, help=f"MongoDB database name (default: '{DEFAULT_DB}')")
    parser.add_argument("--source", type=str, default=DEFAULT_SOURCE_COLLECTION, help=f"Source collection (default: '{DEFAULT_SOURCE_COLLECTION}')")
    parser.add_argument("--target", type=str, default=DEFAULT_TARGET_COLLECTION, help=f"Target collection (default: '{DEFAULT_TARGET_COLLECTION}')")
    parser.add_argument("--non-interactive", action="store_true", help="Run without prompts using CLI arguments")
    parser.add_argument("--test-snippet", action="store_true", help="Run verification test on sample snippet and exit")

    args = parser.parse_args()

    if args.test_snippet:
        run_snippet_verification()
        return

    # Determine mode
    mode = "pending"
    if args.run_all or args.force or args.mode == "all":
        mode = "all"
        skip_existing = False
    elif args.run_pending or args.mode == "pending":
        mode = "pending"
        skip_existing = True
    elif args.non_interactive or args.limit is not None:
        mode = "pending"
        skip_existing = True
    else:
        limit, concurrency, skip_existing, mode, source_collection, target_collection = get_interactive_inputs()
        asyncio.run(run_flipkart_pdp_crawler(
            limit=limit,
            concurrency=concurrency,
            skip_existing=skip_existing,
            mode=mode,
            mongo_uri=args.mongo_uri,
            mongo_db=args.mongo_db,
            source_collection=source_collection,
            target_collection=target_collection
        ))
        return

    asyncio.run(run_flipkart_pdp_crawler(
        limit=args.limit,
        concurrency=args.concurrency,
        skip_existing=skip_existing,
        mode=mode,
        mongo_uri=args.mongo_uri,
        mongo_db=args.mongo_db,
        source_collection=args.source,
        target_collection=args.target
    ))


if __name__ == "__main__":
    main()
