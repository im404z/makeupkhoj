#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ScentKhoj Tata CLiQ PDP (Product Detail Page) Crawler - tatacliq_pdp_crawler.py
==============================================================================
Extracts deep fragrance specifications, olfactory pyramid notes (Top, Middle, Base),
concentration, fragrance family, full product stories, verified buyer reviews,
customer aspect scores, 5-star rating breakdowns, seller & manufacturer info,
and high-resolution zoom imagery from Tata CLiQ PDP pages.

Dual Extraction Engine:
  1. High-Fidelity DOM Parser targeting exact Tata CLiQ PDP HTML components:
     - .PdpBeautyDesktop__main-container
     - .ProductAndBrandComponent__brand-name & .ProductAndBrandComponent__product-desc
     - .PriceComponent__discounted-price & .PriceComponent__slash-price
     - .RatingsAndReviewsComponent & .RatingReviewHeaderComponent
     - .ShortAndLargeStoryComponent__perfume-guide-blocks & .ShortAndLargeStoryComponent__perfume-note-block
     - .DetailsLongComponent__product-details-block (Full Key-Value Specs)
     - .IngredientsComponents__all-ingred-desc (Composition)
     - .ReviewPage__base (Verified Buyer Reviews & Aspect Ratings)
     - .BeautyOtherSellersLink__winningSellerTexts & .NoReturnComponent__manufacture-col
  2. Official Tata CLiQ REST API Gateway:
     - /marketplacewebservices/v2/mpl/products/{productId} (Live price, stock, variants, zoom gallery)
     - /marketplacewebservices/v2/mpl/products/{productId}/reviews (Direct customer reviews)

Data Ingestion:
  - Upserts detailed catalog records into MongoDB: `tatacliq.product_data`
  - Flags processed items in `tatacliq.products` (`pdp_scraped: True`)

Usage:
  # Scrape a specific URL directly:
  python crawler/tatacliq/tatacliq_pdp_crawler.py --url "https://www.tatacliq.com/.../p-mp000000007904643"

  # Parse a saved raw HTML file:
  python crawler/tatacliq/tatacliq_pdp_crawler.py --html-file path/to/pdp.html --id MP000000007904643

  # Batch scrape pending un-scraped products from database:
  python crawler/tatacliq/tatacliq_pdp_crawler.py --limit 10

  # Dry run test (no database writes):
  python crawler/tatacliq/tatacliq_pdp_crawler.py --url "https://www.tatacliq.com/.../p-mp000000007904643" --dry-run
"""

import os
import sys
import re
import json
import time
import random
import logging
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from urllib.parse import urlparse

# Ensure UTF-8 console output on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

# Optional curl_cffi for TLS Impersonation
try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    cffi_requests = None

# BeautifulSoup
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

# PyMongo
try:
    import pymongo
    from pymongo import UpdateOne
except ImportError:
    pymongo = None
    UpdateOne = None

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', 'server', '.env'))
except ImportError:
    pass

DEFAULT_MONGO_URI = (
    os.getenv("MONGO_URI") or
    os.getenv("MONGO") or
    os.getenv("MONGODB_URI") or
    'mongodb://admin:8ko92AWggrY2%21@38.45.64.201:27017/?authSource=admin'
)

DEFAULT_DB = "tatacliq"
DEFAULT_SOURCE_COLLECTION = "products"
DEFAULT_TARGET_COLLECTION = "product_data"
API_BASE_URL = "https://www.tatacliq.com/marketplacewebservices/v2/mpl/products"

# Setup Logging
os.makedirs('logs', exist_ok=True)
_file_handler = logging.FileHandler('logs/tatacliq_pdp_crawler.log', encoding='utf-8')
_file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))

logging.basicConfig(
    level=logging.INFO,
    handlers=[_file_handler, _stream_handler]
)
logger = logging.getLogger("TataCliqPDPCrawler")


# ==============================================================================
# Helper Utilities
# ==============================================================================
def clean_text(val: Any) -> str:
    """Clean string values, stripping excess spaces, zero-width chars and newlines."""
    if val is None:
        return ""
    s = str(val).replace("\r", "").replace("\n", " ").strip()
    s = re.sub(r"^[\u200b\s]+", "", s).strip()
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_number(val: Any) -> Optional[Any]:
    """Parse numeric values (int/float) safely."""
    if val is None or val == "" or val == "N/A":
        return None
    if isinstance(val, (int, float)):
        return val
    s = str(val).replace(",", "").replace("₹", "").strip()
    m = re.search(r'[-+]?\d*\.?\d+', s)
    if m:
        num = float(m.group(0))
        return int(num) if num.is_integer() else num
    return None


def extract_volume_ml(text: str) -> Optional[int]:
    """Extract volume in ml from title, size text or specifications."""
    if not text:
        return None
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:ml|m\.l\.|milliliter|milli\s*litre)', text, re.I)
    if m:
        try:
            return int(float(m.group(1)))
        except (ValueError, TypeError):
            pass
    m_oz = re.search(r'(\d+(?:\.\d+)?)\s*(?:fl\.?\s*oz|oz)', text, re.I)
    if m_oz:
        try:
            return int(round(float(m_oz.group(1)) * 29.5735))
        except (ValueError, TypeError):
            pass
    return None


def extract_concentration(text: str) -> str:
    """Extract fragrance concentration (EDP, EDT, EDC, Parfum, Mist, Attar)."""
    if not text:
        return 'Perfume'
    s = text.lower()
    if re.search(r'\b(eau\s*de\s*parfum|edp)\b', s):
        return 'EDP'
    if re.search(r'\b(eau\s*de\s*toilette|edt)\b', s):
        return 'EDT'
    if re.search(r'\b(eau\s*de\s*cologne|edc|cologne)\b', s):
        return 'EDC'
    if re.search(r'\b(extrait\s*de\s*parfum|pure\s*perfume|parfum)\b', s):
        return 'Parfum'
    if re.search(r'\b(body\s*mist|fragrance\s*mist|body\s*spray|deodorant|deo)\b', s):
        return 'Mist'
    if re.search(r'\b(attar|ittar|concentrated\s*perfume\s*oil|cpo)\b', s):
        return 'Attar'
    return 'EDP'


def extract_gender(text: str) -> str:
    """Classify target gender from text."""
    if not text:
        return 'Unisex'
    s = text.lower()
    is_women = bool(re.search(r'\b(women|woman|femme|her|ladies|girls)\b', s))
    is_men = bool(re.search(r'\b(men|man|homme|him|pour\s*homme|boys)\b', s))
    if is_women and is_men:
        return 'Unisex'
    if is_women and not is_men:
        return 'Women'
    if is_men and not is_women:
        return 'Men'
    return 'Unisex'


def upgrade_tatacliq_image(url: str, target_res: str = "1348Wx2000H") -> str:
    """Upgrade Tata CLiQ image resolution to superZoom high-res format."""
    if not url:
        return ""
    clean = url.strip()
    if clean.startswith("//"):
        clean = "https:" + clean
    # Replace dimension folder e.g. 437Wx649H, 97Wx144H, 252Wx374H with target_res
    clean = re.sub(r'/\d+Wx\d+H/', f'/{target_res}/', clean)
    return clean


# ==============================================================================
# Tata CLiQ PDP Crawler Class
# ==============================================================================
class TataCliqPDPCrawler:
    """Extractor for Tata CLiQ Fragrance Product Details Pages."""

    def __init__(self, mongo_uri: Optional[str] = None):
        self.mongo_uri = mongo_uri or DEFAULT_MONGO_URI
        self.session = None

        if cffi_requests is not None:
            self.session = cffi_requests.Session(impersonate="chrome124")
        else:
            logger.info("Using standard urllib client for HTTP requests.")

        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-IN,en;q=0.9",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document",
        }

        self.api_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json",
            "Accept-Language": "en-IN,en;q=0.9",
        }

    def extract_product_id(self, url_or_id: str) -> Optional[str]:
        """Extract clean Tata CLiQ product ID (e.g. MP000000007904643)."""
        if not url_or_id:
            return None
        s = str(url_or_id).strip()
        # Direct product ID
        m_id = re.search(r'(MP\d{10,20})', s, re.I)
        if m_id:
            return m_id.group(1).upper()
        # From URL path /p-mp000000007904643
        m_url = re.search(r'/p-([a-z0-9]+)', s, re.I)
        if m_url:
            return m_url.group(1).upper()
        return None

    def fetch_page_html(self, url: str) -> Optional[str]:
        """Fetch live Tata CLiQ PDP HTML page."""
        try:
            if self.session:
                resp = self.session.get(url, headers=self.headers, timeout=25)
                if resp.status_code == 200:
                    return resp.text
                elif resp.status_code == 404:
                    logger.warning(f"  [404 NOT FOUND] {url}")
                    return None
                else:
                    logger.warning(f"  [HTTP {resp.status_code}] Failed to fetch HTML for {url}")
            else:
                req = urllib.request.Request(url, headers=self.headers)
                with urllib.request.urlopen(req, timeout=25) as resp:
                    if resp.status == 200:
                        return resp.read().decode('utf-8', errors='replace')
        except Exception as e:
            logger.warning(f"  [HTML FETCH ERROR] {url}: {e}")
        return None

    def fetch_product_api(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Fetch official Tata CLiQ Product Details REST API."""
        url = f"{API_BASE_URL}/{product_id}?channel=WEB&isMDE=true&isPwa=true&fields=FULL"
        try:
            req = urllib.request.Request(url, headers=self.api_headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            logger.warning(f"  [API FETCH ERROR] {product_id}: {e}")
        return None

    def fetch_product_reviews_api(self, product_id: str) -> List[Dict[str, Any]]:
        """Fetch official Tata CLiQ Product Reviews REST API."""
        url = f"{API_BASE_URL}/{product_id}/reviews"
        try:
            req = urllib.request.Request(url, headers=self.api_headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode('utf-8'))
                    return data.get("reviews") or []
        except Exception as e:
            logger.warning(f"  [REVIEWS API FETCH ERROR] {product_id}: {e}")
        return []

    def parse_dom(self, html: str, source_url: str = "") -> Dict[str, Any]:
        """
        High-fidelity DOM extraction targeting the exact Tata CLiQ Beauty PDP components.
        """
        res = {
            "breadcrumbs": [],
            "brand": None,
            "title": None,
            "price": None,
            "mrp": None,
            "discount": "",
            "discount_percentage": None,
            "rating": None,
            "rating_count": None,
            "review_count": None,
            "rating_breakdown": {},
            "aspect_ratings": {},
            "gallery_images": [],
            "guide_badges": [],
            "pyramid_notes": {"top": [], "heart": [], "base": [], "family": []},
            "specifications": {},
            "description": "",
            "composition": "",
            "sizes": [],
            "selected_size": None,
            "reviews": [],
            "seller_name": None,
            "manufacturer_info": {},
            "offers": []
        }

        if not html or not BeautifulSoup:
            return res

        soup = BeautifulSoup(html, "html.parser")

        # 1. Breadcrumbs
        for li in soup.select(".BreadcrumbsNavigation__breadcrumbsItem, ol.BreadcrumbsNavigation__breadcrumbs li"):
            txt = clean_text(li.get_text())
            if txt and txt not in res["breadcrumbs"]:
                res["breadcrumbs"].append(txt)

        # 2. Brand & Title
        brand_el = soup.select_one(".ProductAndBrandComponent__brand-name, a[href*='/c-mbh']")
        if brand_el:
            res["brand"] = clean_text(brand_el.get_text())

        title_el = soup.select_one(".ProductAndBrandComponent__product-desc, h1")
        if title_el:
            res["title"] = clean_text(title_el.get_text())

        # 3. Pricing & MRP
        price_el = soup.select_one(".PriceComponent__discounted-price, h3.PriceComponent__discounted-price")
        if price_el:
            res["price"] = parse_number(price_el.get_text())

        mrp_el = soup.select_one(".PriceComponent__slash-price, span.PriceComponent__slash-price")
        if mrp_el:
            res["mrp"] = parse_number(mrp_el.get_text())

        disc_el = soup.select_one(".PriceComponent__discount-percentage, .PdpFlags__new-arrival-block")
        if disc_el:
            disc_raw = clean_text(disc_el.get_text())
            res["discount"] = disc_raw
            res["discount_percentage"] = parse_number(disc_raw)

        # 4. Rating & Reviews Top Summary
        rating_el = soup.select_one(".RatingsAndReviewsComponent__rating-value, .RatingAndIconComponent__ratingText")
        if rating_el:
            res["rating"] = parse_number(rating_el.get_text())

        rc_el = soup.select_one(".RatingsAndReviewsComponent__rating-total-count, span[itemprop='ratingCount']")
        if rc_el:
            res["rating_count"] = parse_number(rc_el.get_text())

        rev_el = soup.select_one(".RatingsAndReviewsComponent__rating-total-review, span[itemprop='reviewCount']")
        if rev_el:
            res["review_count"] = parse_number(rev_el.get_text())

        # 5. Gallery Images
        for img in soup.select(".GalleryImagesComponent__image-gallery-img, .GalleryImagesComponent__image-gallery-list img"):
            src = img.get("src") or img.get("data-src")
            if src and isinstance(src, str) and src.startswith("http") and "[object" not in src:
                high_res = upgrade_tatacliq_image(src)
                if high_res not in res["gallery_images"]:
                    res["gallery_images"].append(high_res)

        # 6. Perfume Guide Badges (e.g. Woody & Musky, Men, Date Night, Sensual, Eau de Toilette, Belgium)
        for block in soup.select(".ShortAndLargeStoryComponent__perfume-guide-blocks"):
            head_el = block.select_one(".ShortAndLargeStoryComponent__perfume-guide-heading")
            if head_el:
                txt = clean_text(head_el.get_text())
                if txt and txt not in res["guide_badges"]:
                    res["guide_badges"].append(txt)

        # 7. Fragrance Pyramid Notes
        for n_block in soup.select(".ShortAndLargeStoryComponent__perfume-note-block"):
            head_el = n_block.select_one(".ShortAndLargeStoryComponent__perfume-note-head")
            desc_el = n_block.select_one(".ShortAndLargeStoryComponent__perfume-note-desc")
            if head_el and desc_el:
                h_txt = clean_text(head_el.get_text()).lower()
                d_txt = clean_text(desc_el.get_text())
                if "top" in h_txt:
                    res["pyramid_notes"]["top"].append(d_txt)
                elif "middle" in h_txt or "heart" in h_txt:
                    res["pyramid_notes"]["heart"].append(d_txt)
                elif "base" in h_txt or "bottom" in h_txt:
                    res["pyramid_notes"]["base"].append(d_txt)

        # 8. Detailed Specifications Table
        for row in soup.select(".DetailsLongComponent__product-details-block"):
            head_el = row.select_one(".DetailsLongComponent__product-details-head")
            col_el = row.select_one(".DetailsLongComponent__product-details-col")
            if head_el and col_el:
                k = clean_text(head_el.get_text()).rstrip(":")
                v = clean_text(col_el.get_text()).replace(clean_text(head_el.get_text()), "").strip()
                res["specifications"][k] = v

        # Supplement pyramid notes from specifications table if missing
        if not res["pyramid_notes"]["top"] and "Top Note" in res["specifications"]:
            res["pyramid_notes"]["top"] = [x.strip() for x in res["specifications"]["Top Note"].split(",") if x.strip()]
        if not res["pyramid_notes"]["heart"] and "Middle Note" in res["specifications"]:
            res["pyramid_notes"]["heart"] = [x.strip() for x in res["specifications"]["Middle Note"].split(",") if x.strip()]
        if not res["pyramid_notes"]["base"] and "Base Note" in res["specifications"]:
            res["pyramid_notes"]["base"] = [x.strip() for x in res["specifications"]["Base Note"].split(",") if x.strip()]
        if "Fragrance Family" in res["specifications"]:
            res["pyramid_notes"]["family"] = [res["specifications"]["Fragrance Family"]]

        # 9. Story & Description
        story_el = (
            soup.select_one(".DetailsLongComponent__details-what-it-is-desc") or
            soup.select_one(".DetailsComponent__what-it-is-desc")
        )
        if story_el:
            res["description"] = clean_text(story_el.get_text())

        # 10. Sizes / Net Quantity
        for s_box in soup.select(".SizeComponent__size-select"):
            txt = clean_text(s_box.get_text())
            if txt and txt not in res["sizes"]:
                res["sizes"].append(txt)
            if s_box.select_one(".SizeComponent__selected"):
                res["selected_size"] = txt

        # 11. Composition / Ingredients
        comp_el = soup.select_one(".IngredientsComponents__all-ingred-desc")
        if comp_el:
            res["composition"] = clean_text(comp_el.get_text())

        # 12. Rating 5-Star Breakdown
        for row in soup.select(".RatingReviewHeaderComponent__sectionTwo > div"):
            star_el = row.select_one(".RatingCountWithStatusBarComponent__rating")
            cnt_el = row.select_one(".RatingCountWithStatusBarComponent__ratingCount")
            if star_el and cnt_el:
                s_lbl = clean_text(star_el.get_text())
                s_cnt = parse_number(cnt_el.get_text())
                res["rating_breakdown"][f"{s_lbl}_star"] = s_cnt

        # 13. Overall Aspect Ratings (Freshness, Longevity, Scent, Value for money, Delivery)
        for badge in soup.select(".RatingReviewHeaderComponent__sectionThree .rnr-v3__capturedParamBadge"):
            t_el = badge.select_one(".RatingWithStatusBarComponent__ratingText")
            v_el = badge.select_one(".rnr-v3__ratingText")
            if t_el and v_el:
                res["aspect_ratings"][clean_text(t_el.get_text())] = clean_text(v_el.get_text())

        # 14. Customer Reviews
        for card in soup.select(".ReviewPage__base"):
            author_el = card.select_one(".ReviewPage__nameHolder")
            ver_el = card.select_one(".ReviewPage__isBuyer")
            date_el = card.select_one(".ReviewPage__reviewAge")
            r_el = card.select_one(".RatingAndIconComponent__ratingTextReviewPage")
            h_el = card.select_one(".ReviewPage__heading")
            t_el = card.select_one(".ReviewPage__text")
            attr_el = card.select_one(".ReviewPage__productAttribute")

            card_aspects = {}
            for ab in card.select(".rnr-v3__capturedParamBadge"):
                k_el = ab.select_one(".RatingWithStatusBarComponent__ratingText")
                val_el = ab.select_one(".rnr-v3__ratingText")
                if k_el and val_el:
                    card_aspects[clean_text(k_el.get_text())] = clean_text(val_el.get_text())

            res["reviews"].append({
                "author": clean_text(author_el.get_text()) if author_el else "Verified Buyer",
                "is_verified": bool(ver_el and "verified" in ver_el.get_text().lower()),
                "date": clean_text(date_el.get_text()) if date_el else "",
                "rating": parse_number(r_el.get_text()) if r_el else None,
                "title": clean_text(h_el.get_text()) if h_el else "",
                "text": clean_text(t_el.get_text()) if t_el else "",
                "attribute": clean_text(attr_el.get_text()) if attr_el else "",
                "aspects": card_aspects
            })

        # 15. Winning Seller & Manufacturer Information
        seller_el = soup.select_one(".BeautyOtherSellersLink__winningSellerTexts")
        if seller_el:
            res["seller_name"] = clean_text(seller_el.get_text())

        for col in soup.select(".NoReturnComponent__manufacture-col"):
            h_el = col.select_one(".NoReturnComponent__manufacture-head")
            if h_el:
                k = clean_text(h_el.get_text()).rstrip(":")
                v = clean_text(col.get_text()).replace(clean_text(h_el.get_text()), "").strip()
                res["manufacturer_info"][k] = v

        # 16. Available Offers
        for li in soup.select(".OffersSection__offer_list li"):
            hl_el = li.select_one(".OffersSection__offerBeautyHighlightText")
            op_el = li.select_one(".OffersSection__offerPriceValue")
            mm_el = li.select_one(".OffersSection__maxMin")
            if hl_el:
                res["offers"].append({
                    "highlight": clean_text(hl_el.get_text()),
                    "offer_price": clean_text(op_el.get_text()) if op_el else "",
                    "terms": clean_text(mm_el.get_text()) if mm_el else ""
                })

        return res

    def parse_api_data(self, api_json: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize official Tata CLiQ REST API response into standardized fields."""
        res: Dict[str, Any] = {}
        if not api_json:
            return res

        res["brand"] = api_json.get("brandName")
        res["title"] = api_json.get("productName")
        res["description"] = api_json.get("productDescription") or api_json.get("styleNote") or ""
        res["category"] = api_json.get("productCategory") or "Perfumes"
        res["rating"] = parse_number(api_json.get("averageRating"))
        res["review_count"] = parse_number(api_json.get("numberOfReviews"))
        res["in_stock"] = not bool(api_json.get("allOOStock", False))
        res["seller_name"] = api_json.get("winningSellerName")

        # Live Pricing
        mrp = parse_number(api_json.get("mrp"))
        price = parse_number(api_json.get("winningSellerMOP"))
        disc = parse_number(api_json.get("discount"))
        res["mrp"] = mrp
        res["price"] = price
        res["discount_percentage"] = disc
        if disc:
            res["discount"] = f"{disc}% off"

        # Images
        images: List[str] = []
        for g_item in api_json.get("galleryImagesList", []):
            super_zoom = None
            product_img = None
            for img_info in g_item.get("galleryImages", []):
                key = img_info.get("key")
                val = img_info.get("value")
                if key == "superZoom" and val:
                    super_zoom = upgrade_tatacliq_image(val)
                elif key == "product" and val:
                    product_img = upgrade_tatacliq_image(val)
            chosen = super_zoom or product_img
            if chosen and chosen not in images:
                images.append(chosen)
        res["gallery_images"] = images

        # Variants
        variants: List[Dict[str, Any]] = []
        for v in api_json.get("variantOptions", []):
            s_link = v.get("sizelink") or {}
            c_link = v.get("colorlink") or {}
            if s_link.get("size") or s_link.get("brandSize"):
                v_code = s_link.get("productCode")
                v_size = s_link.get("size") or s_link.get("brandSize")
                v_avail = bool(s_link.get("isAvailable", True))
                v_url = s_link.get("url") or c_link.get("colorurl")
                if v_url and not v_url.startswith("http"):
                    v_url = f"https://www.tatacliq.com{v_url}"
                variants.append({
                    "product_id": v_code,
                    "size": v_size,
                    "in_stock": v_avail,
                    "url": v_url
                })
        res["variants"] = variants

        return res

    def extract_pdp(
        self,
        url: Optional[str] = None,
        product_id: Optional[str] = None,
        html_content: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Combine DOM Extraction and official REST API Gateway for a complete PDP record.
        """
        # Resolve clean product ID
        resolved_pid = self.extract_product_id(product_id) or self.extract_product_id(url)
        if not resolved_pid and not html_content:
            logger.error("Could not determine Product ID from URL or arguments.")
            return None

        # 1. DOM Extraction if HTML is provided or fetchable
        dom_data: Dict[str, Any] = {}
        if html_content:
            dom_data = self.parse_dom(html_content, source_url=url or "")
        elif url:
            html = self.fetch_page_html(url)
            if html and "PdpBeautyDesktop" in html:
                dom_data = self.parse_dom(html, source_url=url)

        # 2. API Extraction if product ID is known
        api_data: Dict[str, Any] = {}
        api_reviews: List[Dict[str, Any]] = []
        if resolved_pid:
            raw_api = self.fetch_product_api(resolved_pid)
            if raw_api:
                api_data = self.parse_api_data(raw_api)
            raw_revs = self.fetch_product_reviews_api(resolved_pid)
            if raw_revs:
                for r in raw_revs:
                    aspects = {}
                    for p in r.get("eligibleParamCaptured", []):
                        if p.get("parameterName"):
                            aspects[p["parameterName"]] = f"{p.get('parameterRating', 0)}/5"
                    api_reviews.append({
                        "id": str(r.get("id", "")),
                        "author": (r.get("principal") or {}).get("name") or "Tata CLiQ Customer",
                        "is_verified": bool(r.get("isBuyer", True)),
                        "date": r.get("date", ""),
                        "rating": parse_number(r.get("rating")),
                        "title": clean_text(r.get("headline", "")),
                        "text": clean_text(r.get("comment", "")),
                        "attribute": (r.get("sizelink") or {}).get("size", ""),
                        "aspects": aspects
                    })

        # 3. Merging (prefer API for live price/stock/zoom, DOM for notes/specs/composition)
        brand = dom_data.get("brand") or api_data.get("brand") or "Unknown"
        title = dom_data.get("title") or api_data.get("title") or ""
        price = api_data.get("price") or dom_data.get("price")
        mrp = api_data.get("mrp") or dom_data.get("mrp") or price
        if mrp and price and mrp < price:
            mrp = price

        discount_pct = api_data.get("discount_percentage") or dom_data.get("discount_percentage")
        if discount_pct is None and mrp and price and mrp > price:
            discount_pct = int(round(((mrp - price) / mrp) * 100))
        discount_text = dom_data.get("discount") or (f"{discount_pct}% off" if discount_pct else "")

        rating = dom_data.get("rating") or api_data.get("rating") or 4.0
        rating_count = dom_data.get("rating_count") or 0
        review_count = dom_data.get("review_count") or api_data.get("review_count") or len(api_reviews)

        # Merge Images
        images: List[str] = []
        for img in (api_data.get("gallery_images") or []) + (dom_data.get("gallery_images") or []):
            if img and img not in images:
                images.append(img)
        hero_image = images[0] if images else ""

        # Fragrance classification & volume
        vol_ml = (
            extract_volume_ml(dom_data.get("selected_size", "")) or
            extract_volume_ml(dom_data.get("specifications", {}).get("Size", "")) or
            extract_volume_ml(title) or 100
        )
        conc = (
            extract_concentration(dom_data.get("specifications", {}).get("Fragrance Type", "")) or
            extract_concentration(title)
        )
        gender = (
            dom_data.get("specifications", {}).get("Gender") or
            extract_gender(" ".join(dom_data.get("guide_badges", []))) or
            extract_gender(title)
        )
        frag_family = (
            dom_data.get("specifications", {}).get("Fragrance Family") or
            (dom_data.get("pyramid_notes", {}).get("family") or [""])[0] or
            "Woody"
        )

        # Reviews merge
        final_reviews = dom_data.get("reviews") or api_reviews

        source_url = url or (f"https://www.tatacliq.com/p-{resolved_pid.lower()}" if resolved_pid else "")
        doc_id = f"TTC-{resolved_pid}" if resolved_pid else f"TTC-{abs(hash(title)) % 100000000}"

        bcs = dom_data.get("breadcrumbs") or []
        cat = "Perfumes"
        if bcs:
            if len(bcs) > 1 and (bcs[-1].lower() in title.lower() or title.lower() in bcs[-1].lower()):
                cat = bcs[-2]
            else:
                cat = bcs[-1]

        doc = {
            "id": doc_id,
            "product_id": resolved_pid,
            "title": title,
            "brand": brand,
            "url": source_url,
            "gender": gender,
            "category": cat,
            "breadcrumbs": bcs,

            # Volume & Fragrance Specs
            "size": f"{vol_ml} ml" if vol_ml else "100 ml",
            "volume_ml": vol_ml,
            "concentration": conc,
            "fragrance_family": frag_family,
            "fragrance_type": dom_data.get("specifications", {}).get("Fragrance Type") or conc,

            # Pricing & Stock
            "price": price,
            "mrp": mrp,
            "discount": discount_text,
            "discount_percentage": discount_pct,
            "in_stock": api_data.get("in_stock", True),

            # Ratings & Breakdown
            "rating": rating,
            "rating_count": rating_count,
            "review_count": review_count,
            "rating_breakdown": dom_data.get("rating_breakdown") or {},
            "aspect_ratings": dom_data.get("aspect_ratings") or {},

            # Images
            "image": hero_image,
            "images": images,

            # Detailed Olfactory Notes & Description
            "pyramid_notes": dom_data.get("pyramid_notes") or {"top": [], "heart": [], "base": [], "family": []},
            "specifications": dom_data.get("specifications") or {},
            "guide_badges": dom_data.get("guide_badges") or [],
            "composition": dom_data.get("composition") or "",
            "description": dom_data.get("description") or api_data.get("description") or "",

            # Variants & Reviews
            "variants": api_data.get("variants") or [{"size": s} for s in dom_data.get("sizes", [])],
            "reviews": final_reviews,
            "offers": dom_data.get("offers") or [],

            # Metadata & Seller
            "seller_name": dom_data.get("seller_name") or api_data.get("seller_name") or "Tata CLiQ Assured",
            "manufacturer_info": dom_data.get("manufacturer_info") or {},
            "return_policy": "This product is non-returnable",
            "authenticity_badge": "100% Genuine Products",
            "marketplace": "tatacliq",
            "crawled_at": datetime.now(timezone.utc).isoformat()
        }

        return doc

    def save_pdp_to_mongodb(self, pdp_doc: Dict[str, Any]) -> bool:
        """Upsert PDP data into tatacliq.product_data and update tatacliq.products status."""
        if not pdp_doc or not pdp_doc.get("id"):
            return False

        if pymongo is None:
            logger.error("pymongo is not installed.")
            return False

        try:
            client = pymongo.MongoClient(self.mongo_uri, serverSelectionTimeoutMS=10000)
            db = client[DEFAULT_DB]
            pdp_col = db[DEFAULT_TARGET_COLLECTION]
            prod_col = db[DEFAULT_SOURCE_COLLECTION]

            # Ensure indexes
            pdp_col.create_index("id", unique=True)
            pdp_col.create_index("product_id", unique=False)
            pdp_col.create_index("brand", unique=False)
            pdp_col.create_index("crawled_at", unique=False)

            doc_id = pdp_doc["id"]
            now_iso = datetime.now(timezone.utc).isoformat()
            pdp_doc["updated_at"] = now_iso

            # Upsert into tatacliq.product_data
            pdp_col.update_one(
                {"id": doc_id},
                {"$set": pdp_doc},
                upsert=True
            )

            # Flag scraped in tatacliq.products
            raw_pid = pdp_doc.get("product_id")
            if raw_pid:
                prod_col.update_one(
                    {"$or": [{"id": raw_pid}, {"product_id": raw_pid}, {"id": doc_id}]},
                    {"$set": {
                        "pdp_scraped": True,
                        "pdp_scraped_at": now_iso
                    }}
                )

            return True
        except Exception as e:
            logger.error(f"Error saving PDP to MongoDB for {pdp_doc.get('id')}: {e}")
            return False

    def run_batch(
        self,
        limit: int = 50,
        force: bool = False,
        delay: float = 1.2,
        dry_run: bool = False
    ) -> int:
        """Batch scrape pending products from tatacliq.products collection."""
        if pymongo is None:
            logger.error("pymongo is not installed.")
            return 0

        client = pymongo.MongoClient(self.mongo_uri, serverSelectionTimeoutMS=10000)
        db = client[DEFAULT_DB]
        prod_col = db[DEFAULT_SOURCE_COLLECTION]

        query: Dict[str, Any] = {}
        if not force:
            query["pdp_scraped"] = {"$ne": True}

        pending = list(prod_col.find(query).limit(limit))
        logger.info(f"Starting batch PDP crawl for {len(pending)} Tata CLiQ products (force={force}, dry_run={dry_run})...")

        success_count = 0
        for i, item in enumerate(pending, 1):
            pid = item.get("product_id") or item.get("id")
            url = item.get("url")
            title = item.get("title") or item.get("name") or "Unknown"

            logger.info(f"[{i}/{len(pending)}] Processing: {pid} - '{title[:40]}...'")

            doc = self.extract_pdp(url=url, product_id=pid)
            if doc:
                if not dry_run:
                    self.save_pdp_to_mongodb(doc)
                success_count += 1
                logger.info(
                    f"  ✓ Saved PDP: Brand='{doc.get('brand')}', "
                    f"Top Note='{', '.join(doc.get('pyramid_notes', {}).get('top', [])) or 'N/A'}', "
                    f"Price=₹{doc.get('price')}, Rating={doc.get('rating')}"
                )
            else:
                logger.warning(f"  ✗ Failed to extract PDP for {pid}")

            time.sleep(delay + random.uniform(0.1, 0.4))

        logger.info(f"Finished batch crawl. Successfully processed: {success_count}/{len(pending)} items.")
        return success_count


# ==============================================================================
# CLI Entry Point
# ==============================================================================
def main():
    parser = argparse.ArgumentParser(description="ScentKhoj Tata CLiQ PDP & Catalog Extractor")
    parser.add_argument("--url", type=str, help="Single Tata CLiQ PDP URL to scrape")
    parser.add_argument("--id", type=str, help="Tata CLiQ Product ID (e.g. MP000000007904643)")
    parser.add_argument("--html-file", type=str, help="Path to raw HTML file to parse")
    parser.add_argument("--limit", type=int, default=10, help="Number of pending products to scrape from MongoDB")
    parser.add_argument("--force", action="store_true", help="Re-scrape already processed products")
    parser.add_argument("--delay", type=float, default=1.2, help="Delay between HTTP requests in seconds")
    parser.add_argument("--dry-run", action="store_true", help="Extract and display without writing to MongoDB")
    parser.add_argument("--save-json", type=str, help="Optional file path to export output as JSON")

    args = parser.parse_args()
    crawler = TataCliqPDPCrawler()

    # Case 1: Raw HTML file provided
    if args.html_file:
        logger.info(f"Parsing local HTML file: {args.html_file}")
        with open(args.html_file, "r", encoding="utf-8") as f:
            raw_html = f.read()
        doc = crawler.extract_pdp(url=args.url, product_id=args.id, html_content=raw_html)
        if doc:
            print("\n=== EXTRACTED TATA CLIQ PDP RECORD ===")
            print(json.dumps(doc, indent=2, ensure_ascii=False))
            if not args.dry_run:
                crawler.save_pdp_to_mongodb(doc)
                logger.info("✓ Saved to MongoDB -> tatacliq.product_data")
            if args.save_json:
                with open(args.save_json, "w", encoding="utf-8") as f:
                    json.dump(doc, f, indent=2, ensure_ascii=False)
                logger.info(f"✓ Saved JSON to {args.save_json}")
        else:
            logger.error("Failed to extract data from HTML file.")
        return

    # Case 2: Single URL or ID provided
    if args.url or args.id:
        logger.info(f"Scraping single product: URL={args.url}, ID={args.id}")
        doc = crawler.extract_pdp(url=args.url, product_id=args.id)
        if doc:
            print("\n=== EXTRACTED TATA CLIQ PDP RECORD ===")
            print(json.dumps(doc, indent=2, ensure_ascii=False))
            if not args.dry_run:
                crawler.save_pdp_to_mongodb(doc)
                logger.info("✓ Saved to MongoDB -> tatacliq.product_data")
            if args.save_json:
                with open(args.save_json, "w", encoding="utf-8") as f:
                    json.dump(doc, f, indent=2, ensure_ascii=False)
                logger.info(f"✓ Saved JSON to {args.save_json}")
        else:
            logger.error("Failed to extract product PDP.")
        return

    # Case 3: Batch process pending items from MongoDB
    crawler.run_batch(
        limit=args.limit,
        force=args.force,
        delay=args.delay,
        dry_run=args.dry_run
    )


if __name__ == "__main__":
    main()
