#!/usr/bin/env python3
"""
Flipkart Makeup Crawler - MakeupKhoj
Crawls Flipkart makeup category listings across pages, parses product metadata,
and upserts directly into MongoDB (Database: 'makeupkhoj', Collection: 'flipkart_makeupkhoj').

Compatible with MakeupKhoj's marketplace architecture alongside Nykaa, Amazon and Myntra.
"""

import os
import sys
import re
import csv
import json
import random
import logging
import argparse
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

# Force UTF-8 encoding on Windows console
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

# Setup Logging
os.makedirs('logs', exist_ok=True)
_file_handler = logging.FileHandler('logs/flipkart_crawler.log', encoding='utf-8')
_file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s'))

logging.basicConfig(
    level=logging.INFO,
    handlers=[_file_handler, _stream_handler]
)
logger = logging.getLogger("flipkart-crawler")

# Playwright & Mongo
try:
    from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    logger.error("Playwright is required. Please run: pip install playwright && python -m playwright install")

try:
    import pymongo
    from pymongo import UpdateOne
    from pymongo.errors import ServerSelectionTimeoutError
except ImportError:
    pymongo = None
    UpdateOne = None

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    from dotenv import load_dotenv
    # Load .env from project root or current working dir
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env'))
    load_dotenv()
except ImportError:
    pass

# Import MakeupKhoj DB config and Category Mapper
_crawler_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _crawler_root not in sys.path:
    sys.path.insert(0, _crawler_root)

from db_config import get_db, COLLECTIONS, DB_NAME, DEFAULT_MONGO_URI, validate_db_safety
from category_mapper import get_marketplace_urls, lookup_category_by_url

# Default Configuration (makeupkhoj.flipkart_makeupkhoj)
DEFAULT_START_URL = "https://www.flipkart.com/beauty-and-grooming/makeup/pr?sid=g9b%2Cffi&p%5B%5D=facets.fulfilled_by%255B%255D%3DF-Assured&param=345678&BU=BGM"
DEFAULT_DB = DB_NAME  # 'makeupkhoj'
DEFAULT_COLLECTION = COLLECTIONS['flipkart']  # 'flipkart_makeupkhoj'

# Load reference brands from central dictionary
BRANDS_PATH = os.path.join(_crawler_root, "brands.json")
KNOWN_BRANDS = []
if os.path.isfile(BRANDS_PATH):
    try:
        with open(BRANDS_PATH, "r", encoding="utf-8") as bf:
            KNOWN_BRANDS = json.load(bf)
    except Exception:
        pass
if not KNOWN_BRANDS:
    KNOWN_BRANDS = [
        "Maybelline", "Lakme", "Lakmé", "L'Oreal", "L'Oreal Paris", "Sugar", "Sugar Cosmetics",
        "Swiss Beauty", "Nykaa", "Kay Beauty", "Faces Canada", "Colorbar", "Mamaearth", "Plum",
        "Renee", "Insight", "Mars", "Recode", "Elle 18", "Wet n Wild", "Blue Heaven", "MyGlamm",
        "Biotique", "Lotus Herbals", "PAC", "Revlon", "Chambor", "MAC", "Huda Beauty", "Forever52"
    ]


# ==============================================================================
# Helper Parsing Functions
# ==============================================================================
def clean_text(val: Any) -> str:
    """Clean string values, stripping excess whitespace and linebreaks."""
    if val is None:
        return ""
    s = str(val).replace("\r", "").replace("\n", " ").strip()
    return re.sub(r"\s+", " ", s).strip()


def parse_number(val: Any) -> Optional[Any]:
    """Extract clean float or int from string or number, safely handling multi-line/token texts."""
    if val is None or val == "" or val == "N/A":
        return None
    if isinstance(val, (int, float)):
        return val
    text = str(val).strip()
    # If string contains multiple tokens or lines, inspect each token and take the first valid number
    tokens = [t.strip() for t in re.split(r"[\r\n\s]+", text) if t.strip()]
    for token in tokens:
        clean_tok = token.replace(",", "").replace("₹", "").strip()
        match = re.search(r"[-+]?\d*\.?\d+", clean_tok)
        if match:
            num = float(match.group(0))
            return int(num) if num.is_integer() else num
    return None



def parse_size_from_title(title: str) -> Optional[str]:
    """Extract volume/size from title (e.g. '80 ml', '20ml x 4', '100 ml')."""
    if not title:
        return None
    # Check for trailing explicit size e.g. " - 80 ml" or ", 100 ml"
    trailing = re.search(r'[-–,]\s*(\d+\s*(?:ml|ML|gm|GM|g|oz))\s*$', title.strip(), re.IGNORECASE)
    if trailing:
        return trailing.group(1).strip().upper()

    matches = re.findall(r'(\d+\s*(?:ml|ML|gm|GM|g|oz)(?:\s*[xX]\s*\d+)?)', title, re.IGNORECASE)
    if matches:
        return matches[-1].strip().upper()
    return None



def extract_brand_from_title(title: str, existing_brand: Optional[str] = None) -> str:
    """Smart brand detection from title prefix or known brand dictionary."""
    if existing_brand and existing_brand.strip() and existing_brand.upper() not in ('N/A', 'NA', 'NONE', 'MAKEUP', 'COSMETICS'):
        return clean_text(existing_brand)

    clean_t = clean_text(title)
    if not clean_t:
        return "Makeup"

    # Match against known brands
    clean_t_lower = clean_t.lower()
    for kb in KNOWN_BRANDS:
        if clean_t_lower.startswith(kb.lower()):
            return kb

    # Fallback: take first word if it looks like a brand name
    first_token = clean_t.split()[0]
    first_clean = re.sub(r'[^a-zA-Z0-9]', '', first_token)
    if first_clean and len(first_clean) >= 2:
        return first_clean

    return "Makeup"


def extract_gender(subtitle: str, title: str) -> str:
    """Extract gender classification (Men / Women / Unisex)."""
    combined = f"{subtitle} {title}".lower()
    if "women" in combined or "for women" in combined or "femme" in combined:
        return "Women"
    elif "men" in combined or "for men" in combined or "homme" in combined:
        return "Men"
    elif "unisex" in combined:
        return "Unisex"
    return "Unisex"


def clean_flipkart_url(raw_url: str) -> str:
    """Normalize and clean Flipkart product URL, ensuring absolute path."""
    if not raw_url:
        return ""
    if raw_url.startswith("/"):
        raw_url = f"https://www.flipkart.com{raw_url}"
    elif not raw_url.startswith("http"):
        raw_url = f"https://www.flipkart.com/{raw_url.lstrip('/')}"

    try:
        parsed = urlparse(raw_url)
        qs = parse_qs(parsed.query)
        # Keep essential parameters (pid, lid) and strip heavy tracking
        essential = {}
        if 'pid' in qs:
            essential['pid'] = qs['pid'][0]
        if 'lid' in qs:
            essential['lid'] = qs['lid'][0]

        new_query = urlencode(essential) if essential else parsed.query
        return urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', new_query, ''))
    except Exception:
        return raw_url


# ==============================================================================
# In-Browser JavaScript DOM Extractor
# ==============================================================================
JS_FLIPKART_EXTRACT = """
() => {
  const cards = document.querySelectorAll('div[data-id]');
  return [...cards].map(card => {
    const getText = (selector) => {
      const el = card.querySelector(selector);
      return el ? el.innerText.trim() : null;
    };

    const getAttr = (selector, attr) => {
      const el = card.querySelector(selector);
      return el ? (el.getAttribute(attr) || null) : null;
    };

    const pid = card.getAttribute('data-id') || null;

    // Title & Links
    const titleLink = card.querySelector('a.pIpigb, a[title]');
    const imgEl = card.querySelector('img.UCc1lI, .lWX0_T img, img');
    
    const fullTitle = (titleLink && titleLink.getAttribute('title')) ||
                      (imgEl && imgEl.getAttribute('alt')) ||
                      (titleLink ? titleLink.innerText.trim() : null);

    const relativeUrl = (titleLink && titleLink.getAttribute('href')) ||
                        getAttr('a.GnxRXv', 'href') ||
                        getAttr('a.fb4uj3', 'href') ||
                        getAttr('a', 'href');

    const imgSrc = (imgEl && (imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('src'))) || null;

    // Subtitle / Gender Info
    const subtitle = getText('.U_GKRr');

    // Rating & Rating Count
    const ratingText = getText('.MKiFS6, .CjyrHS, [id*="productRating"]');
    const ratingCountText = getText('.PvbNMB, span[class*="PvbNMB"]');

    // F-Assured
    const isFAssured = !!card.querySelector('.FIdGa1, img[src*="fa_"]');

    // Pricing (Select leaf price divs directly; never select parent .QiMO5r container)
    const priceText = getText('.hZ3P6w, .QiMO5r > div:nth-child(1), .Nx9bqj, div[class*="hZ3P6w"]');
    const mrpText = getText('.kRYCnD, .QiMO5r > div:nth-child(2), .yRaY8j, div[class*="kRYCnD"]');
    const discountText = getText('.HQe8jr, .QiMO5r > div:nth-child(3), .UkUFwK, div[class*="HQe8jr"]');

    // Offer / Tag Badge
    const badgeText = getText('.MaiFhH .HZ0E6r, .HZ0E6r');

    return {
      pid: pid,
      title: fullTitle,
      url: relativeUrl,
      image: imgSrc,
      subtitle: subtitle,
      rating: ratingText,
      rating_count: ratingCountText,
      price: priceText,
      mrp: mrpText,
      discount: discountText,
      is_f_assured: isFAssured,
      badge: badgeText
    };
  });
}
"""


# ==============================================================================
# MongoDB Manager for Flipkart
# ==============================================================================
class MongoFlipkartManager:
    """Manages connection and batch upserts to the Flipkart MongoDB collection."""

    def __init__(self, mongo_uri: Optional[str] = None, db_name: Optional[str] = None, collection_name: Optional[str] = None):
        self.mongo_uri = mongo_uri or DEFAULT_MONGO_URI
        self.db_name = db_name or DEFAULT_DB
        self.collection_name = collection_name or DEFAULT_COLLECTION
        validate_db_safety(self.db_name)
        self.client = None
        self.db = None
        self.collection = None
        self._connect()

    def _connect(self):
        if pymongo is None:
            logger.error("pymongo is not installed. Please run: pip install pymongo")
            return

        try:
            masked = self.mongo_uri.split("@")[-1] if "@" in self.mongo_uri else self.mongo_uri
            logger.info(f"[MONGO] Connecting to MongoDB ({masked}) -> Database: '{self.db_name}', Collection: '{self.collection_name}'...")
            self.client = pymongo.MongoClient(self.mongo_uri, serverSelectionTimeoutMS=8000)
            self.client.admin.command('ping')
            self.db = self.client[self.db_name]
            self.collection = self.db[self.collection_name]

            # Setup indexes on unique product identifier, categories, and filter fields
            self.collection.create_index("id", unique=True)
            self.collection.create_index("pid", unique=False)
            self.collection.create_index("brand", unique=False)
            self.collection.create_index("category_path", unique=False)
            self.collection.create_index("sub_category", unique=False)
            self.collection.create_index("sub_sub_category", unique=False)
            self.collection.create_index("price", unique=False)
            self.collection.create_index("crawled_at", unique=False)
            logger.info(f"[MONGO OK] Connected! Index verified for '{self.db_name}.{self.collection_name}'.")
        except Exception as e:
            logger.error(f"[MONGO ERROR] Failed to connect to MongoDB: {e}")
            self.client = None

    def save_products(self, products: List[Dict[str, Any]]) -> int:
        """Batch upsert products into flipkart_makeupkhoj collection by 'id' with Price Shift Tracking."""
        if not products or self.collection is None or UpdateOne is None:
            return 0

        # Pre-fetch existing documents to detect price shifts
        prod_ids = [str(p.get("id") or p.get("pid")) for p in products if (p.get("id") or p.get("pid"))]
        existing_map = {}
        try:
            for doc in self.collection.find(
                {"id": {"$in": prod_ids}},
                {"id": 1, "price": 1, "mrp": 1, "price_history": 1, "lowest_recorded_price": 1, "highest_recorded_price": 1}
            ):
                existing_map[doc["id"]] = doc
        except Exception as fetch_err:
            logger.warning(f"[MONGO] Could not pre-fetch existing Flipkart records for price history: {fetch_err}")

        # Master products collection in makeupkhoj
        sk_products_col = None
        if self.db is not None:
            try:
                sk_products_col = self.db["products"]
            except Exception:
                pass

        now_iso = datetime.now(timezone.utc).isoformat()
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        operations = []

        for p in products:
            prod_id = str(p.get("id") or p.get("pid"))
            if not prod_id:
                continue

            new_price = p.get("price")
            new_mrp = p.get("mrp") or new_price
            existing = existing_map.get(prod_id)

            # Check for price changes
            price_changed = False
            diff = 0
            old_price = None

            if existing and existing.get("price") is not None and new_price is not None:
                try:
                    old_price = float(existing.get("price"))
                    new_val = float(new_price)
                    diff = round(new_val - old_price)
                    if abs(diff) >= 1:
                        price_changed = True
                except (ValueError, TypeError):
                    pass

            history_entry = None
            if price_changed and old_price is not None and new_price is not None:
                if diff < 0:
                    logger.info(f"  [PRICE DROP] Flipkart PID {prod_id} '{p.get('title', '')[:40]}...': ₹{old_price:g} -> ₹{float(new_price):g} (Save ₹{abs(diff)})")
                else:
                    logger.info(f"  [PRICE HIKE] Flipkart PID {prod_id} '{p.get('title', '')[:40]}...': ₹{old_price:g} -> ₹{float(new_price):g} (+₹{diff})")

                history_entry = {
                    "date": today_str,
                    "timestamp": now_iso,
                    "price": float(new_price),
                    "old_price": float(old_price),
                    "mrp": float(new_mrp) if new_mrp else float(new_price),
                    "change": diff,
                    "marketplace": "flipkart"
                }

            doc_to_save = {
                **p,
                "crawled_at": p.get("crawled_at") or now_iso,
                "price_last_checked": now_iso,
                "updated_at": now_iso
            }

            update_op = {"$set": doc_to_save}

            if price_changed and history_entry:
                update_op["$push"] = {
                    "price_history": {
                        "$each": [history_entry],
                        "$slice": -20
                    }
                }
                update_op["$min"] = {"lowest_recorded_price": float(new_price)}
                if new_mrp:
                    update_op["$max"] = {"highest_recorded_price": float(new_mrp)}

            operations.append(
                UpdateOne(
                    {"id": prod_id},
                    update_op,
                    upsert=True
                )
            )

            # Live synchronization to scentkhoj.products for existing mapped SKUs
            if sk_products_col is not None:
                try:
                    sk_set = {
                        "mappings.flipkart.price": float(new_price) if new_price else None,
                        "mappings.flipkart.mrp": float(new_mrp) if new_mrp else None,
                        "price_last_checked": now_iso,
                        "updated_at": now_iso
                    }
                    if p.get("rating") is not None:
                        try:
                            sk_set["mappings.flipkart.rating"] = float(p.get("rating"))
                        except (ValueError, TypeError):
                            pass
                    if p.get("rating_count") is not None:
                        try:
                            sk_set["mappings.flipkart.rating_count"] = int(p.get("rating_count"))
                        except (ValueError, TypeError):
                            pass
                    if p.get("image"):
                        sk_set["mappings.flipkart.image"] = p.get("image")
                    if p.get("url"):
                        sk_set["mappings.flipkart.url"] = p.get("url")

                    sk_update = {"$set": sk_set}
                    if price_changed and history_entry:
                        sk_update["$push"] = {"price_history": {"$each": [history_entry], "$slice": -20}}
                        if new_price:
                            sk_update["$min"] = {"lowest_recorded_price": float(new_price)}

                    sk_products_col.update_many({
                        "$or": [
                            {"mappings.flipkart.id": prod_id},
                            {"mappings.flipkart.product_id": prod_id},
                            {"id": f"SK-FK-{prod_id}"}
                        ]
                    }, sk_update)
                except Exception as sk_err:
                    logger.debug(f"[SK-SYNC] Notice for Flipkart {prod_id}: {sk_err}")

        if not operations:
            return 0

        try:
            result = self.collection.bulk_write(operations, ordered=False)
            logger.info(
                f"[MONGO SUCCESS] Synced {len(operations)} products to '{self.db_name}.{self.collection_name}' "
                f"(Matched: {result.matched_count}, Modified: {result.modified_count}, Upserted: {result.upserted_count})"
            )
            return len(operations)
        except Exception as e:
            logger.error(f"[MONGO ERROR] Failed during bulk_write: {e}")
            return 0

    def get_total_count(self) -> int:
        if self.collection is None:
            return 0
        try:
            return self.collection.count_documents({})
        except Exception:
            return 0


# ==============================================================================
# Flipkart Product Normalization
# ==============================================================================
def normalize_raw_item(raw: Dict[str, Any], page_no: int = 1, category_meta: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Transform raw DOM extracted dictionary into unified MakeupKhoj schema."""
    pid = clean_text(raw.get("pid"))
    if not pid:
        return None

    full_title = clean_text(raw.get("title") or "Makeup")
    subtitle = clean_text(raw.get("subtitle") or "")
    brand = extract_brand_from_title(full_title)
    gender = extract_gender(subtitle, full_title)
    size = parse_size_from_title(full_title) or "Standard"

    # Price & MRP
    price = parse_number(raw.get("price"))
    mrp = parse_number(raw.get("mrp"))
    if mrp is None and price is not None:
        mrp = price

    # Discount
    raw_discount = clean_text(raw.get("discount") or "")
    if raw_discount:
        discount = raw_discount.upper()
        if not discount.endswith("OFF"):
            discount = f"{discount} OFF"
        disc_num = parse_number(discount)
        discount_percentage = int(disc_num) if disc_num else 0
    elif mrp and price and mrp > price:
        pct = round(((mrp - price) / mrp) * 100)
        discount = f"{pct}% OFF"
        discount_percentage = pct
    else:
        discount = ""
        discount_percentage = 0

    # Rating & Reviews
    rating = parse_number(raw.get("rating"))
    rating_count = int(parse_number(raw.get("rating_count")) or 0)

    # URL
    product_url = clean_flipkart_url(clean_text(raw.get("url") or ""))

    # Image
    raw_img = clean_text(raw.get("image") or "")
    if raw_img.startswith("//"):
        raw_img = f"https:{raw_img}"

    badge = clean_text(raw.get("badge") or "")
    is_f_assured = bool(raw.get("is_f_assured"))

    now_iso = datetime.now(timezone.utc).isoformat()

    cat = category_meta or {}
    category = cat.get('category', 'Makeup')
    sub_category = cat.get('sub_category', 'General')
    sub_sub_category = cat.get('sub_sub_category', cat.get('category_name', 'Makeup'))
    category_path = cat.get('category_path', f"Makeup > {sub_category} > {sub_sub_category}")
    category_name = cat.get('category_name', sub_sub_category)

    return {
        "id": pid,
        "pid": pid,
        "brand": brand,
        "name": full_title,
        "title": full_title,
        "subtitle": subtitle,
        "gender": gender,
        "size": size,
        "sizes": size,
        "currency": "INR",
        "price": price,
        "mrp": mrp,
        "discount": discount,
        "discount_percentage": discount_percentage,
        "rating": rating,
        "rating_count": rating_count,
        "reviews_count": rating_count,
        "is_f_assured": is_f_assured,
        "badge": badge if badge else None,
        "url": product_url,
        "image": raw_img,
        "images": [raw_img] if raw_img else [],
        "category": category,
        "sub_category": sub_category,
        "sub_sub_category": sub_sub_category,
        "category_path": category_path,
        "category_name": category_name,
        "category_url": cat.get('url', ''),
        "marketplace": "flipkart",
        "marketplace_name": "Flipkart",
        "page": page_no,
        "crawled_at": now_iso,
    }


def parse_html_with_soup(html_content: str, page_no: int = 1, category_meta: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Fallback parser using BeautifulSoup when JavaScript evaluation is not available."""
    if not BeautifulSoup or not html_content:
        return []

    soup = BeautifulSoup(html_content, "html.parser")
    cards = soup.select("div[data-id]")
    products = []

    for card in cards:
        pid = card.get("data-id")
        if not pid:
            continue

        title_el = card.select_one("a.pIpigb, a[title]")
        img_el = card.select_one("img.UCc1lI, .lWX0_T img, img")

        title = ""
        if title_el and title_el.get("title"):
            title = title_el.get("title")
        elif img_el and img_el.get("alt"):
            title = img_el.get("alt")
        elif title_el:
            title = title_el.text.strip()

        href = ""
        if title_el and title_el.get("href"):
            href = title_el.get("href")
        elif card.select_one("a[href]"):
            href = card.select_one("a[href]").get("href")

        img_src = ""
        if img_el:
            img_src = img_el.get("src") or img_el.get("data-src") or ""

        subtitle_el = card.select_one(".U_GKRr")
        subtitle = subtitle_el.text.strip() if subtitle_el else ""

        rating_el = card.select_one(".MKiFS6, .CjyrHS, [id*='productRating']")
        rating_text = rating_el.text.strip() if rating_el else ""

        rc_el = card.select_one(".PvbNMB, span[class*='PvbNMB']")
        rc_text = rc_el.text.strip() if rc_el else ""

        price_el = card.select_one(".hZ3P6w, .QiMO5r > div:nth-of-type(1), .Nx9bqj")
        price_text = price_el.text.strip() if price_el else ""

        mrp_el = card.select_one(".kRYCnD, .QiMO5r > div:nth-of-type(2), .yRaY8j")
        mrp_text = mrp_el.text.strip() if mrp_el else ""

        discount_el = card.select_one(".HQe8jr, .QiMO5r > div:nth-of-type(3), .UkUFwK")
        discount_text = discount_el.text.strip() if discount_el else ""

        badge_el = card.select_one(".MaiFhH .HZ0E6r, .HZ0E6r")
        badge_text = badge_el.text.strip() if badge_el else ""

        f_assured = bool(card.select_one(".FIdGa1, img[src*='fa_']"))

        raw_item = {
            "pid": pid,
            "title": title,
            "url": href,
            "image": img_src,
            "subtitle": subtitle,
            "rating": rating_text,
            "rating_count": rc_text,
            "price": price_text,
            "mrp": mrp_text,
            "discount": discount_text,
            "is_f_assured": f_assured,
            "badge": badge_text
        }

        normalized = normalize_raw_item(raw_item, page_no, category_meta=category_meta)
        if normalized:
            products.append(normalized)

    return products


# ==============================================================================
# Async Playwright Crawler Core
# ==============================================================================
async def crawl_flipkart(
    query: Optional[str] = None,
    start_url: Optional[str] = None,
    category_meta: Optional[Dict[str, Any]] = None,
    max_pages: int = 5,
    start_page: int = 1,
    headless: bool = True,
    delay: float = 3.0,
    export_csv: bool = False,
    csv_filename: str = "flipkart_makeupkhoj.csv",
    mongo_uri: Optional[str] = None,
    mongo_db: Optional[str] = None,
    mongo_collection: Optional[str] = None
):
    """Main crawler loop utilizing stealth Playwright browser automation."""
    mongo = MongoFlipkartManager(mongo_uri=mongo_uri, db_name=mongo_db, collection_name=mongo_collection)
    all_products: Dict[str, Dict[str, Any]] = {}

    base_url = start_url or (f"https://www.flipkart.com/search?q={query}&otracker=search&otracker1=search&marketplace=FLIPKART&as-show=on&as=off" if query else DEFAULT_START_URL)

    async with async_playwright() as p:
        logger.info(f"Launching Chromium browser (Headless: {headless})...")
        browser = await p.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-infobars",
                "--window-position=0,0",
                "--ignore-certificate-errors",
                "--disable-extensions",
            ]
        )

        context = await browser.new_context(
            viewport={"width": 1400, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            locale="en-IN",
            timezone_id="Asia/Kolkata",
            extra_http_headers={
                "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "Upgrade-Insecure-Requests": "1"
            }
        )

        page = await context.new_page()

        current_page_no = start_page
        end_page = (start_page + max_pages - 1) if max_pages > 0 else 9999

        while current_page_no <= end_page:
            # Construct target URL with pagination parameter
            if current_page_no == 1 and not start_url:
                page_url = base_url
            else:
                sep = "&" if "?" in base_url else "?"
                # Replace existing &page= if present
                clean_base = re.sub(r'[?&]page=\d+', '', base_url)
                sep = "&" if "?" in clean_base else "?"
                page_url = f"{clean_base}{sep}page={current_page_no}"

            logger.info(f"\n[PAGE {current_page_no}] Navigating to: {page_url}")

            try:
                await page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
            except Exception as e:
                logger.warning(f"[PAGE {current_page_no}] Navigation timeout or error: {e}. Retrying with load...")
                try:
                    await page.goto(page_url, wait_until="load", timeout=20000)
                except Exception as e2:
                    logger.error(f"[PAGE {current_page_no}] Failed to load page: {e2}")
                    break

            # Handle possible login modal or popup
            try:
                close_btn = page.locator("button._2KpZ6l._2doB4z, span[role='button']:has-text('✕'), button:has-text('✕')")
                if await close_btn.count() > 0 and await close_btn.first.is_visible():
                    await close_btn.first.click()
                    logger.info("Closed Flipkart login overlay popup.")
            except Exception:
                pass

            # Wait for product cards to appear
            try:
                await page.wait_for_selector("div[data-id]", timeout=12000)
            except PlaywrightTimeout:
                logger.warning(f"[PAGE {current_page_no}] No 'div[data-id]' found within timeout. Checking if end of search results.")
                # Fallback: check if zero results page
                zero_res = await page.locator("text='No results found'").count()
                if zero_res > 0:
                    logger.info("No more search results found on Flipkart. Stopping pagination.")
                    break

            # Smooth scroll down to trigger lazy loading of product images
            logger.info("Scrolling down page to trigger lazy loaded product cards & images...")
            for _ in range(8):
                await page.mouse.wheel(0, 700)
                await page.wait_for_timeout(250)

            await page.wait_for_timeout(1000)

            # 1. Primary: Evaluate JS in-browser for speed
            page_products = []
            try:
                raw_items = await page.evaluate(JS_FLIPKART_EXTRACT)
                logger.info(f"[PAGE {current_page_no}] In-browser JS extracted {len(raw_items)} product cards.")
                for r in raw_items:
                    norm = normalize_raw_item(r, current_page_no, category_meta=category_meta)
                    if norm and norm.get("id"):
                        page_products.append(norm)
            except Exception as e:
                logger.warning(f"In-browser JS evaluation encountered error: {e}. Falling back to BeautifulSoup...")
                content = await page.content()
                page_products = parse_html_with_soup(content, current_page_no, category_meta=category_meta)

            # 2. Fallback check: if JS extraction was empty, parse HTML via BeautifulSoup
            if not page_products:
                logger.info("JS extract returned 0 items. Falling back to BeautifulSoup HTML parse...")
                content = await page.content()
                page_products = parse_html_with_soup(content, current_page_no, category_meta=category_meta)

            logger.info(f"[PAGE {current_page_no}] Extracted {len(page_products)} valid makeup items.")

            if not page_products or len(page_products) == 0:
                logger.info(f"[PAGE {current_page_no}] 0 product cards found. Reached end of Flipkart search catalog.")
                break

            # Deduplicate and add to memory map
            new_in_page = 0
            for item in page_products:
                pid = item["id"]
                if pid not in all_products:
                    all_products[pid] = item
                    new_in_page += 1

            # Realtime batch save to MongoDB
            saved_count = mongo.save_products(page_products)
            logger.info(
                f"[PAGE {current_page_no} SUMMARY] +{new_in_page} new unique items (Total crawled: {len(all_products)}). "
                f"Saved to Mongo: {saved_count}."
            )

            # Check next page condition
            current_page_no += 1
            if max_pages > 0 and current_page_no > end_page:
                logger.info(f"Reached configured max pages limit ({max_pages}).")
                break

            # Check if Next button exists when running auto mode
            if max_pages <= 0 and current_page_no > 2:
                try:
                    next_btn_count = await page.locator("a._1LKTO3, nav a:has-text('Next'), a:has-text('Next'), span:has-text('Next')").count()
                    if next_btn_count == 0:
                        logger.info(f"[PAGE {current_page_no}] No 'Next' page link found. Finished all available listing pages.")
                        break
                except Exception:
                    pass

            # Polite randomized delay between pages
            sleep_time = delay + random.uniform(0.5, 2.0)
            logger.info(f"Waiting {sleep_time:.2f}s before fetching page {current_page_no}...")
            await asyncio.sleep(sleep_time)

        await browser.close()

    # Optional CSV Export
    if export_csv and all_products:
        export_to_csv(list(all_products.values()), csv_filename)

    logger.info(f"\n==========================================")
    logger.info(f"FLIPKART CRAWL FINISHED!")
    logger.info(f"Total Unique Products: {len(all_products)}")
    logger.info(f"Total in MongoDB: {mongo.get_total_count()}")
    logger.info(f"==========================================\n")


def export_to_csv(products: List[Dict[str, Any]], filename: str):
    """Export crawled products to CSV file."""
    if not products:
        return
    fieldnames = [
        "id", "pid", "brand", "title", "subtitle", "gender", "size",
        "price", "mrp", "discount", "discount_percentage", "rating",
        "rating_count", "is_f_assured", "badge", "url", "image",
        "category_name", "marketplace", "crawled_at"
    ]
    try:
        with open(filename, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for p in products:
                writer.writerow(p)
        logger.info(f"[CSV EXPORT] Exported {len(products)} records to '{filename}'.")
    except Exception as e:
        logger.error(f"[CSV ERROR] Failed to export CSV: {e}")


# ==============================================================================
# Standalone Testing Mode (Uses user-provided snippet)
# ==============================================================================
def run_snippet_test():
    """Verify parsing logic directly on the user's provided Flipkart HTML snippet."""
    sample_html = """
    <div data-id="PERGT2RWAXHBU6N6" style="width: 25%;"><div class="RGLWAk" data-tkid="854b043e-7517-4c53-b88c-356d9cbe0e40.PERGT2RWAXHBU6N6.SEARCH"><a class="GnxRXv" target="_blank" rel="noopener noreferrer" href="/denver-hamilton-edp-srk-s-favorite-luxury-gift-pack-20ml-x-4-perfume-eau-de-parfum-80-ml/p/itm3363524a5d613?pid=PERGT2RWAXHBU6N6&amp;lid=LSTPERGT2RWAXHBU6N64AE3BS&amp;marketplace=FLIPKART&amp;q=perfume&amp;store=g9b%2F0yh%2Fjhz&amp;srno=s_1_3&amp;otracker=search&amp;otracker1=search&amp;fm=Search&amp;iid=854b043e-7517-4c53-b88c-356d9cbe0e40.PERGT2RWAXHBU6N6.SEARCH&amp;ppt=sp&amp;ppn=sp&amp;ssid=z410ujnwz40000001792814902365&amp;qH=96ddd40095934cd7&amp;ov_redirect=true&amp;ov_redirect=true"><div><div><div class="lWX0_T" style="height: 280px; width: 200px;"><img loading="eager" class="UCc1lI" alt="DENVER Hamilton EDP- SRK's Favorite Luxury Gift Pack (20ml x 4) Perfume Eau de Parfum  -  80 ml" src="https://rukminim2.flixcart.com/image/612/612/xif0q/perfume/c/d/e/80-hamilton-edp-srk-s-favorite-luxury-gift-pack-20ml-x-4-perfume-original-imahmczn3hhz8u5f.jpeg?q=70"></div></div></div><div class="SJekt1 bEnCjh"><div class="JiknFv"><svg xmlns="http://www.w3.org/2000/svg" class="rE8OAo" width="16" height="16" viewBox="0 0 20 16"><path d="M8.695 16.682C4.06 12.382 1 9.536 1 6.065 1 3.219 3.178 1 5.95 1c1.566 0 3.069.746 4.05 1.915C10.981 1.745 12.484 1 14.05 1 16.822 1 19 3.22 19 6.065c0 3.471-3.06 6.316-7.695 10.617L10 17.897l-1.305-1.215z" fill="#2874F0" class="JX9D2X" stroke="#FFF" fill-rule="evenodd" opacity=".9"></path></svg></div></div></a><a class="pIpigb" title="DENVER Hamilton EDP- SRK's Favorite Luxury Gift Pack (20ml x 4) Perfume Eau de Parfum  -  80 ml" target="_blank" rel="noopener noreferrer" href="/denver-hamilton-edp-srk-s-favorite-luxury-gift-pack-20ml-x-4-perfume-eau-de-parfum-80-ml/p/itm3363524a5d613?pid=PERGT2RWAXHBU6N6&amp;lid=LSTPERGT2RWAXHBU6N64AE3BS&amp;marketplace=FLIPKART&amp;q=perfume&amp;store=g9b%2F0yh%2Fjhz&amp;srno=s_1_3&amp;otracker=search&amp;otracker1=search&amp;fm=Search&amp;iid=854b043e-7517-4c53-b88c-356d9cbe0e40.PERGT2RWAXHBU6N6.SEARCH&amp;ppt=sp&amp;ppn=sp&amp;ssid=z410ujnwz40000001792814902365&amp;qH=96ddd40095934cd7&amp;ov_redirect=true&amp;ov_redirect=true">DENVER Hamilton EDP- SRK's Favorite Luxury Gift Pack (2...</a><div class="U_GKRr">For Men</div><div class="a7saXW WDsrYC"><span id="productRating_LSTPERGT2RWAXHBU6N64AE3BS_PERGT2RWAXHBU6N6_" class="CjyrHS"><div class="MKiFS6">4.4<img src="data:image/svg+xml;base64,..." class="PZfbSE"></div></span><span class="PvbNMB">(1,20,364)</span></div><div class="FIdGa1"><img height="21" src="//static-assets-web.flixcart.com/fk-p-linchpin-web/fk-cp-zion/img/fa_9e47c1.png"></div><a class="fb4uj3" target="_blank" rel="noopener noreferrer" href="/denver-hamilton-edp-srk-s-favorite-luxury-gift-pack-20ml-x-4-perfume-eau-de-parfum-80-ml/p/itm3363524a5d613?pid=PERGT2RWAXHBU6N6&amp;lid=LSTPERGT2RWAXHBU6N64AE3BS&amp;marketplace=FLIPKART&amp;q=perfume&amp;store=g9b%2F0yh%2Fjhz&amp;srno=s_1_3&amp;otracker=search&amp;otracker1=search&amp;fm=Search&amp;iid=854b043e-7517-4c53-b88c-356d9cbe0e40.PERGT2RWAXHBU6N6.SEARCH&amp;ppt=sp&amp;ppn=sp&amp;ssid=z410ujnwz40000001792814902365&amp;qH=96ddd40095934cd7&amp;ov_redirect=true&amp;ov_redirect=true"><div class="QiMO5r"><div class="hZ3P6w">₹275</div><div class="kRYCnD">₹799</div><div class="HQe8jr"><span>65% off</span></div></div></a><div class="MaiFhH"><div class="hx1EGN" style="padding: 4px; border-radius: 2px; background-color: rgb(244, 242, 255);"><div class="HZ0E6r Rm9_cy" style="color: rgb(82, 9, 219); font-size: 12px; font-style: normal; font-weight: 500;">Top Discount of the Sale</div></div></div></div></div>
    """
    logger.info("Running standalone parser test on provided Flipkart snippet...")
    parsed = parse_html_with_soup(sample_html)
    print("\n--- TEST SNIPPET EXTRACTION RESULT ---")
    print(json.dumps(parsed, indent=2, ensure_ascii=False))
    print("---------------------------------------\n")
    if parsed:
        item = parsed[0]
        assert item["id"] == "PERGT2RWAXHBU6N6", "ID check failed"
        assert item["brand"] == "Denver", f"Brand check failed: {item['brand']}"
        assert item["price"] == 275, "Price check failed"
        assert item["mrp"] == 799, "MRP check failed"
        assert item["rating"] == 4.4, "Rating check failed"
        assert item["rating_count"] == 120364, "Rating count check failed"
        assert item["discount"] == "65% OFF", "Discount check failed"
        assert item["is_f_assured"] is True, "F-Assured check failed"
        assert item["gender"] == "Men", "Gender check failed"
        assert item["size"] == "80 ML", "Size check failed"
        logger.info("[TEST PASSED] All extracted fields match expectations!")


# ==============================================================================
# CLI Entrypoint
# ==============================================================================
def main():
    parser = argparse.ArgumentParser(description=f"Flipkart Makeup Crawler - Saves to MongoDB '{DEFAULT_DB}.{DEFAULT_COLLECTION}'")
    parser.add_argument("--query", type=str, help="Search query (e.g. 'lipstick', 'foundation')")
    parser.add_argument("--url", type=str, help="Custom Flipkart start URL")
    parser.add_argument("--sub-cat", type=str, help="Filter by subcategory (Face, Lips, Eyes, Nails, Tools)")
    parser.add_argument("--max-pages", type=int, default=5, help="Number of pages to crawl per category (default: 5, 0 = unlimited)")
    parser.add_argument("--start-page", type=int, default=1, help="Page to start crawling from (default: 1)")
    parser.add_argument("--headful", action="store_true", help="Launch headful browser window for debugging")
    parser.add_argument("--delay", type=float, default=2.5, help="Delay in seconds between pages (default: 2.5)")
    parser.add_argument("--export-csv", action="store_true", help="Also export crawled data to CSV")
    parser.add_argument("--csv-file", type=str, default="flipkart_makeupkhoj.csv", help="CSV export filename")
    parser.add_argument("--mongo-uri", type=str, help="Custom MongoDB connection string")
    parser.add_argument("--mongo-db", type=str, default=DEFAULT_DB, help=f"Target MongoDB database (default: '{DEFAULT_DB}')")
    parser.add_argument("--mongo-collection", type=str, default=DEFAULT_COLLECTION, help=f"Target MongoDB collection (default: '{DEFAULT_COLLECTION}')")
    parser.add_argument("--test-snippet", action="store_true", help="Test extraction on sample snippet and exit")

    args = parser.parse_args()

    if args.test_snippet:
        run_snippet_test()
        return

    # Determine targets
    flipkart_makeup_urls = get_marketplace_urls('flipkart')

    if args.url:
        cat_meta = lookup_category_by_url(args.url.strip()) or {}
        targets = [{'url': args.url.strip(), **cat_meta}]
    elif args.query:
        targets = [{'url': f"https://www.flipkart.com/search?q={args.query}&otracker=search&marketplace=FLIPKART", 'category_name': args.query, 'category_path': f"Makeup > {args.query}"}]
    elif args.sub_cat:
        sub_filter = args.sub_cat.strip().lower()
        targets = [u for u in flipkart_makeup_urls if u.get('sub_category', '').lower() == sub_filter or sub_filter in u.get('sub_category', '').lower()]
    else:
        targets = flipkart_makeup_urls

    print("\n" + "=" * 75)
    print(f"      FLIPKART MAKEUP CRAWLER (MongoDB: {args.mongo_db}.{args.mongo_collection})")
    print(f"      Total Target URLs to Crawl: {len(targets)}")
    print("=" * 75)

    async def _run_all():
        for idx, item in enumerate(targets, start=1):
            url = item['url']
            print(f"\n[TARGET {idx}/{len(targets)}] {item.get('category_path', 'Makeup')} -> {url}")
            await crawl_flipkart(
                start_url=url,
                category_meta=item,
                max_pages=args.max_pages,
                start_page=args.start_page,
                headless=not args.headful,
                delay=args.delay,
                export_csv=args.export_csv,
                csv_filename=args.csv_file,
                mongo_uri=args.mongo_uri,
                mongo_db=args.mongo_db,
                mongo_collection=args.mongo_collection
            )

    asyncio.run(_run_all())


if __name__ == "__main__":
    main()
