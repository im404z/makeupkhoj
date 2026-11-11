#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ScentKhoj Nykaa Fragrance Listing Crawler - nykaa_crawler.py
===========================================================
High-speed, Akamai-bypassing listing crawler for Nykaa Fragrance Catalog.
Extracts verified product details, exact pricing, ratings, reviews, tags,
and performs high-precision brand extraction from the product title.

Features:
  - Bypasses Akamai Bot Protection using TLS JA3/JA4 impersonation (curl_cffi chrome124)
  - Crawls from page 1 up to page 222 (configurable)
  - Real-time batch upserts into MongoDB (`nykaa.products`)
  - High-precision brand extraction using 1,000+ reference brands
  - Export options: MongoDB, CSV, JSON

Usage:
  # Crawl 5 pages for testing:
  python crawler/nykaa/nykaa_crawler.py --max-pages 5

  # Crawl entire fragrance catalog up to page 222:
  python crawler/nykaa/nykaa_crawler.py --max-pages 222

  # Export to CSV / JSON as well:
  python crawler/nykaa/nykaa_crawler.py --max-pages 10 --export all
"""

import os
import sys
import re
import csv
import json
import time
import random
import logging
import argparse
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

# Ensure UTF-8 console output on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

# Optional curl_cffi for Akamai TLS Impersonation
try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    cffi_requests = None

# Optional BeautifulSoup
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

# Optional PyMongo
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

# Import MakeupKhoj DB config and Category Mapper
_crawler_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _crawler_root not in sys.path:
    sys.path.insert(0, _crawler_root)

from db_config import get_db, COLLECTIONS, DB_NAME, DEFAULT_MONGO_URI, validate_db_safety
from category_mapper import get_marketplace_urls, lookup_category_by_url

DEFAULT_DB = DB_NAME  # 'makeupkhoj'
DEFAULT_COLLECTION = COLLECTIONS['nykaa']  # 'nykaa_makeupkhoj'
DEFAULT_START_URL = "https://www.nykaa.com/makeup/face/face-foundation/c/228"

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("NykaaCrawler")


# --- BRAND MATCHER SYSTEM ---
class NykaaBrandMatcher:
    """High-precision brand extraction engine for Nykaa perfume titles"""

    def __init__(self, brands_file_path=None, mongo_uri=None):
        self.brands_set = set()
        self._load_reference_brands(brands_file_path, mongo_uri)
        # Sort by length descending to match longest brand first (e.g. "Maison Moi" before "Moi")
        self.sorted_brands = sorted(list(self.brands_set), key=lambda x: len(x), reverse=True)
        logger.info(f"[BrandMatcher] Initialized with {len(self.sorted_brands)} reference brands.")

    def _load_reference_brands(self, brands_file_path=None, mongo_uri=None):
        # 1. Base curated fragrance houses
        curated_brands = [
            "Maison Moi", "Moi by Nykaa", "Moi", "Nykaa Perfumes", "Nykaa Cosmetics",
            "Nykaa Naturals", "Nykaa", "Contraband", "Layer'r Wottagirl", "Layer'r",
            "Wottagirl", "LoveChild by Masaba", "LoveChild", "Masaba", "KAYALI",
            "Kay Beauty", "Sol de Janeiro", "Victoria's Secret", "Bath & Body Works",
            "Jo Malone London", "Jo Malone", "Forest Essentials", "Kama Ayurveda",
            "Plum BodyLovin'", "Plum", "MCaffeine", "Bella Vita Luxury", "Bella Vita Organic",
            "Bella Vita", "The Man Company", "Bombay Shaving Company", "Wild Stone",
            "Carlton London", "Denver", "Fogg", "Engage", "Secret Temptation",
            "Yardley London", "Yardley", "Envy", "Park Avenue", "Ajmal", "Lattafa",
            "Armaf", "Afnan", "Rasasi", "Skinn by Titan", "Skinn", "Titan", "Fastrack",
            "Guess", "Police", "Jaguar", "Davidoff", "Calvin Klein", "Nautica",
            "Tommy Hilfiger", "Hugo Boss", "Versace", "Dior", "Chanel", "Gucci",
            "Prada", "Yves Saint Laurent", "YSL", "Burberry", "Bvlgari", "Carolina Herrera",
            "Paco Rabanne", "Dolce & Gabbana", "Jean Paul Gaultier", "Montblanc",
            "Ferragamo", "Coach", "Jimmy Choo", "Ramsons", "Riya", "AdilQadri",
            "Al-Nuaim", "Al Haramain", "Swiss Arabian", "Secret Alchemist", "AND",
            "Lancome", "Estee Lauder", "Clinique", "MAC", "Chopard", "Narciso Rodriguez",
            "Issey Miyake", "Elie Saab", "Mancera", "Montale", "Roja", "Creed",
            "Maison Francis Kurkdjian", "Diptyque", "Byredo", "Amouage", "Oriflame",
            "Avon", "Victoria Secret", "Body Shop", "The Body Shop", "Biotique"
        ]
        for b in curated_brands:
            self.brands_set.add(b.strip())

        # 2. Load from crawler/brands.json if present
        paths_to_check = [
            brands_file_path,
            os.path.join(os.path.dirname(__file__), '..', 'brands.json'),
            os.path.join(os.path.dirname(__file__), 'brands.json'),
            'crawler/brands.json',
            'server/brand.json'
        ]
        for p in paths_to_check:
            if p and os.path.isfile(p):
                try:
                    with open(p, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    for item in data:
                        if isinstance(item, str) and item.strip():
                            self.brands_set.add(item.strip())
                        elif isinstance(item, dict):
                            name = item.get('brand') or item.get('name')
                            if name:
                                self.brands_set.add(name.strip())
                    logger.info(f"[BrandMatcher] Loaded brands from {os.path.basename(p)}")
                    break
                except Exception as e:
                    logger.warning(f"Error loading {p}: {e}")

        # 3. Load from MongoDB makeupkhoj.brands, scentkhoj.brands and products if available
        if pymongo and mongo_uri:
            try:
                client = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=2500)
                for db_name_check in ['makeupkhoj', 'scentkhoj']:
                    if db_name_check in client.list_database_names():
                        db = client[db_name_check]
                        if 'brands' in db.list_collection_names():
                            for doc in db['brands'].find({}, {'name': 1}):
                                if doc.get('name'):
                                    self.brands_set.add(doc['name'].strip())
                        if 'products' in db.list_collection_names():
                            for b in db['products'].distinct('brand'):
                                if b and isinstance(b, str) and b.strip():
                                    self.brands_set.add(b.strip())
                client.close()
            except Exception:
                pass

    def extract_brand(self, title: str, url: str = "") -> str:
        """Extract brand from product title and URL slug with multi-tier matching"""
        if not title:
            return "Unknown"

        t_clean = title.strip()

        # Step 1: Prefix matching (Brand starts the title)
        for b in self.sorted_brands:
            pat = rf'^{re.escape(b)}\b'
            if re.search(pat, t_clean, re.I):
                return b

        # Step 2: Word-boundary matching anywhere in title (length >= 3)
        for b in self.sorted_brands:
            if len(b) >= 3:
                pat = rf'\b{re.escape(b)}\b'
                if re.search(pat, t_clean, re.I):
                    return b

        # Step 3: Check URL slug (e.g. /moi-by-nykaa-joie-de-vivre...)
        if url:
            try:
                path = urlparse(url).path
                slug = path.split('/p/')[0].split('/')[-1]
                for b in self.sorted_brands:
                    b_slug = re.sub(r'[^a-z0-9]+', '-', b.lower()).strip('-')
                    if slug.startswith(b_slug) or f"-{b_slug}-" in slug:
                        return b
            except Exception:
                pass

        # Step 4: Fallback heuristic - First 1-2 capitalized tokens before perfume keywords
        words = t_clean.split()
        if words:
            stop_title_words = {'eau', 'de', 'parfum', 'edt', 'edp', 'perfume', 'for', 'men', 'women', 'body', 'mist', 'spray'}
            if len(words) >= 2 and words[1].istitle() and words[1].lower() not in stop_title_words:
                return f"{words[0]} {words[1]}"
            return words[0]

        return "Unknown"


# --- MONGODB MANAGER ---
def save_nykaa_to_mongodb(
    rows,
    mongo_uri=None,
    db_name=DEFAULT_DB,
    collection_name=DEFAULT_COLLECTION
) -> int:
    """Batch upsert products into makeupkhoj.nykaa_makeupkhoj collection by unique 'id'"""
    if not rows:
        return 0

    if pymongo is None:
        logger.error("pymongo is not installed. Run 'python -m pip install pymongo'.")
        return 0

    uri = mongo_uri or DEFAULT_MONGO_URI
    validate_db_safety(db_name)

    try:
        masked_uri = uri.split("@")[-1] if "@" in uri else uri
        client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=10000)
        db = client[db_name]
        collection = db[collection_name]

        # Ensure index on 'id', 'brand', and category paths
        collection.create_index("id", unique=True)
        collection.create_index("brand", unique=False)
        collection.create_index("category_path", unique=False)
        collection.create_index("sub_category", unique=False)
        collection.create_index("sub_sub_category", unique=False)
        collection.create_index("crawled_at", unique=False)

        # Pre-fetch existing documents to detect price shifts
        row_ids = [str(r.get("id")) for r in rows if r.get("id")]
        existing_map = {}
        try:
            for doc in collection.find(
                {"id": {"$in": row_ids}},
                {"id": 1, "price": 1, "mrp": 1, "price_history": 1, "lowest_recorded_price": 1, "highest_recorded_price": 1}
            ):
                existing_map[doc["id"]] = doc
        except Exception as fetch_err:
            logger.warning(f"  [MONGO] Could not pre-fetch existing Nykaa records for price history: {fetch_err}")

        # Master products collection in makeupkhoj
        sk_products_col = None
        try:
            sk_products_col = db["products"]
        except Exception:
            pass

        now_iso = datetime.now(timezone.utc).isoformat()
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        operations = []

        for row in rows:
            prod_id = str(row.get("id"))
            if not prod_id:
                continue

            raw_pid = str(row.get("product_id") or "").replace("NYK-", "")
            new_price = row.get("price")
            new_mrp = row.get("mrp") or new_price
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
                    logger.info(f"  [PRICE DROP] Nykaa ID {prod_id} '{row.get('title', '')[:40]}...': ₹{old_price:g} -> ₹{float(new_price):g} (Save ₹{abs(diff)})")
                else:
                    logger.info(f"  [PRICE HIKE] Nykaa ID {prod_id} '{row.get('title', '')[:40]}...': ₹{old_price:g} -> ₹{float(new_price):g} (+₹{diff})")

                history_entry = {
                    "date": today_str,
                    "timestamp": now_iso,
                    "price": float(new_price),
                    "old_price": float(old_price),
                    "mrp": float(new_mrp) if new_mrp else float(new_price),
                    "change": diff,
                    "marketplace": "nykaa"
                }

            doc_to_save = {
                **row,
                "crawled_at": now_iso,
                "price_last_checked": now_iso,
                "updated_at": now_iso
            }
            if not doc_to_save.get("image") and existing and existing.get("image"):
                doc_to_save["image"] = existing["image"]
                doc_to_save["high_res_image"] = existing.get("high_res_image") or existing["image"]
                doc_to_save["images"] = existing.get("images") or [existing["image"]]

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
                        "price": float(new_price) if new_price else None,
                        "lowest_price": float(new_price) if new_price else None,
                        "mappings.nykaa.price": float(new_price) if new_price else None,
                        "mappings.nykaa.mrp": float(new_mrp) if new_mrp else None,
                        "price_last_checked": now_iso,
                        "updated_at": now_iso
                    }
                    if row.get("rating") is not None:
                        try:
                            sk_set["mappings.nykaa.rating"] = float(row.get("rating"))
                        except (ValueError, TypeError):
                            pass
                    if row.get("rating_count") is not None:
                        try:
                            sk_set["mappings.nykaa.rating_count"] = int(row.get("rating_count"))
                        except (ValueError, TypeError):
                            pass
                    if row.get("image"):
                        sk_set["mappings.nykaa.image"] = row.get("image")
                    if row.get("url"):
                        sk_set["mappings.nykaa.url"] = row.get("url")

                    sk_update = {"$set": sk_set}
                    if price_changed and history_entry:
                        sk_update["$push"] = {"price_history": {"$each": [history_entry], "$slice": -20}}
                        if new_price:
                            sk_update["$min"] = {"lowest_recorded_price": float(new_price)}

                    query_clauses = [{"mappings.nykaa.id": prod_id}]
                    if raw_pid:
                        query_clauses.append({"mappings.nykaa.product_id": raw_pid})
                        query_clauses.append({"id": f"SK-NYK-{raw_pid}"})

                    sk_products_col.update_many({"$or": query_clauses}, sk_update)
                except Exception as sk_err:
                    logger.debug(f"[SK-SYNC] Notice for Nykaa {prod_id}: {sk_err}")

        result = collection.bulk_write(operations, ordered=False)
        logger.info(
            f"  [MONGO OK] Synced {len(rows)} Nykaa products to '{db_name}.{collection_name}' "
            f"(Matched: {result.matched_count}, Modified: {result.modified_count}, Upserted: {result.upserted_count})"
        )
        client.close()
        return len(rows)
    except Exception as e:
        logger.error(f"  [MONGO ERROR] Failed saving products to MongoDB: {e}")
        return 0


# --- NYKAA CRAWLER ENGINE ---
class NykaaCrawler:
    """Akamai-bypassing Crawler for Nykaa Fragrance Products"""

    def __init__(
        self,
        start_url: str = DEFAULT_START_URL,
        mongo_uri: str = DEFAULT_MONGO_URI,
        delay_range: tuple = (1.0, 2.5)
    ):
        self.start_url = start_url
        self.mongo_uri = mongo_uri
        self.delay_range = delay_range
        self.brand_matcher = NykaaBrandMatcher(mongo_uri=mongo_uri)

        if not cffi_requests:
            raise RuntimeError("curl_cffi is required. Install via 'python -m pip install curl_cffi'.")
        if not BeautifulSoup:
            raise RuntimeError("BeautifulSoup4 is required. Install via 'python -m pip install beautifulsoup4'.")

    def build_page_url(self, page_no: int) -> str:
        """Construct the exact pagination URL for a given page number"""
        parsed = urlparse(self.start_url)
        params = parse_qs(parsed.query)

        # Update or set pagination and sort
        params['page_no'] = [str(page_no)]
        if 'sort' not in params:
            params['sort'] = ['popularity']

        query_str = urlencode(params, doseq=True)
        return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, query_str, parsed.fragment))

    def fetch_page_html(self, url: str, max_retries: int = 3) -> str:
        """Fetch page HTML using curl_cffi Chrome 124 TLS impersonation with retry logic"""
        headers = {
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "accept-language": "en-IN,en-US;q=0.9,en;q=0.8",
            "cache-control": "no-cache",
            "pragma": "no-cache",
            "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "upgrade-insecure-requests": "1",
        }

        for attempt in range(1, max_retries + 1):
            try:
                resp = cffi_requests.get(
                    url,
                    headers=headers,
                    impersonate="chrome124",
                    timeout=25
                )
                if resp.status_code == 200:
                    return resp.text
                elif resp.status_code == 403:
                    logger.warning(f"  [ATTEMPT {attempt}] Received 403 Access Denied from Akamai. Backing off...")
                    time.sleep(2 * attempt)
                else:
                    logger.warning(f"  [ATTEMPT {attempt}] HTTP Status {resp.status_code}. Retrying...")
                    time.sleep(1.5 * attempt)
            except Exception as e:
                logger.warning(f"  [ATTEMPT {attempt}] Network error: {e}")
                time.sleep(2 * attempt)

        return ""

    def parse_products_from_html(self, html: str, page_no: int, category_meta: Optional[Dict[str, Any]] = None) -> list:
        """Parse all .productWrapper product cards from page HTML with full category mapping"""
        if not html:
            return []

        soup = BeautifulSoup(html, 'html.parser')
        cards = soup.select(".productWrapper, div[class*='productWrapper']")
        products = []

        # Build fallback image map from preloaded listing state
        state_images = {}
        for script_match in re.finditer(r'window\.__PRELOADED_STATE__\s*=\s*({.*?});?\s*</script>', html, re.DOTALL):
            try:
                state_data = json.loads(script_match.group(1))
                prods = state_data.get("categoryListing", {}).get("listingData", {}).get("products", [])
                for p in prods:
                    pid = str(p.get("id") or p.get("productId") or p.get("childId") or "")
                    img_url = p.get("imageUrl")
                    if pid and img_url:
                        state_images[pid] = img_url
            except Exception:
                pass

        cat = category_meta or lookup_category_by_url(self.start_url) or {}
        category = cat.get('category', 'Makeup')
        sub_category = cat.get('sub_category', 'General')
        sub_sub_category = cat.get('sub_sub_category', cat.get('category_name', 'Makeup'))
        category_path = cat.get('category_path', f"Makeup > {sub_category} > {sub_sub_category}")
        category_name = cat.get('category_name', sub_sub_category)

        for card in cards:
            try:
                # 1. Product Link & Identifiers
                link_el = card.select_one("a[href*='/p/']") or card.select_one("a")
                href = link_el.get("href", "").strip() if link_el else ""
                if not href:
                    continue

                full_url = f"https://www.nykaa.com{href}" if href.startswith('/') else href

                # Extract Product ID & SKU ID
                pid_m = re.search(r'/p/(\d+)', href) or re.search(r'productId=(\d+)', href)
                raw_pid = pid_m.group(1) if pid_m else ""
                sku_m = re.search(r'skuId=(\d+)', href)
                raw_sku = sku_m.group(1) if sku_m else ""

                if not raw_pid:
                    slug_match = re.search(r'/([^/?]+)/p/', href)
                    raw_pid = slug_match.group(1) if slug_match else str(hash(href))

                unique_id = f"NYK-{raw_pid}" if raw_pid else f"NYK-{hash(href)}"

                # 2. Product Title & Image
                img_el = card.select_one("img.css-11gn9r6") or card.select_one("img[alt]")
                full_title = img_el.get("alt", "").strip() if img_el else ""

                h2_el = card.select_one("h2")
                h2_title = h2_el.text.strip() if h2_el else ""

                product_title = full_title if len(full_title) >= len(h2_title) else h2_title
                if not product_title:
                    continue

                raw_image = img_el.get("src", "").strip() if img_el else ""
                if not raw_image and raw_pid and str(raw_pid) in state_images:
                    raw_image = state_images[str(raw_pid)]
                high_res_image = re.sub(r'tr:[^/]+/', '', raw_image) if raw_image else ""

                # 3. Brand Extraction
                brand = self.brand_matcher.extract_brand(product_title, href)

                # 4. Pricing
                price_el = card.select_one(".css-111z9ua") or card.select_one("span[class*='111z9ua']")
                raw_price = price_el.text.strip() if price_el else ""
                price = float(re.sub(r'[^\d.]', '', raw_price)) if raw_price else None

                mrp_el = card.select_one(".css-17x46n5") or card.select_one("span[class*='17x46n5']")
                raw_mrp = mrp_el.text.strip() if mrp_el else ""
                mrp = float(re.sub(r'[^\d.]', '', raw_mrp)) if raw_mrp else None

                accessible_span = card.select_one(".css-1yjfidh")
                if accessible_span and (price is None or mrp is None):
                    text = accessible_span.text
                    reg_m = re.search(r'Regular price\s*₹?\s*([\d,]+)', text, re.I)
                    disc_m = re.search(r'Discounted price\s*₹?\s*([\d,]+)', text, re.I)
                    if reg_m and mrp is None:
                        mrp = float(reg_m.group(1).replace(',', ''))
                    if disc_m and price is None:
                        price = float(disc_m.group(1).replace(',', ''))

                if mrp is None and price is not None:
                    mrp = price
                elif price is None and mrp is not None:
                    price = mrp

                # 5. Discount
                disc_el = card.select_one(".css-cjd9an")
                raw_disc = disc_el.text.strip() if disc_el else ""
                discount_percentage = None
                if raw_disc:
                    pct_m = re.search(r'(\d+)\s*%', raw_disc)
                    if pct_m:
                        discount_percentage = int(pct_m.group(1))

                if discount_percentage is None and mrp and price and mrp > price:
                    discount_percentage = round(((mrp - price) / mrp) * 100)
                    raw_disc = f"{discount_percentage}% Off"

                # 6. Star Rating & Review Count
                rating = None
                rating_wrap = card.select_one("div[aria-label*='star rating']")
                if rating_wrap:
                    aria_text = rating_wrap.get("aria-label", "")
                    r_m = re.search(r'([\d.]+)\s*out of', aria_text, re.I)
                    if r_m:
                        rating = float(r_m.group(1))

                reviews_count = 0
                reviews_el = card.select_one("span[aria-label*='reviews'], .css-1tbknh0")
                if reviews_el:
                    rev_aria = reviews_el.get("aria-label", "") or reviews_el.text
                    rev_m = re.search(r'([\d,]+)', rev_aria)
                    if rev_m:
                        reviews_count = int(rev_m.group(1).replace(',', ''))

                # 7. Badge & Tag
                tag_el = card.select_one(".custom-tag")
                tag = tag_el.text.strip().upper() if tag_el else ""
                is_ad = "Yes" if tag == "AD" or "sponsored" in href.lower() else "No"

                # 8. Clean Name without Brand
                clean_name = product_title
                if brand and brand != "Unknown" and product_title.lower().startswith(brand.lower()):
                    clean_name = product_title[len(brand):].strip(" -:|")

                product_record = {
                    "id": unique_id,
                    "product_id": raw_pid,
                    "sku_id": raw_sku,
                    "brand": brand,
                    "title": product_title,
                    "name": clean_name or product_title,
                    "currency": "INR",
                    "price": price,
                    "mrp": mrp,
                    "discount": raw_disc,
                    "discount_percentage": discount_percentage,
                    "rating": rating,
                    "rating_count": reviews_count,
                    "reviews_count": reviews_count,
                    "tag": tag,
                    "is_ad": is_ad,
                    "image": raw_image,
                    "high_res_image": high_res_image,
                    "images": [high_res_image] if high_res_image else ([raw_image] if raw_image else []),
                    "category": category,
                    "sub_category": sub_category,
                    "sub_sub_category": sub_sub_category,
                    "category_path": category_path,
                    "category_name": category_name,
                    "category_url": cat.get('url', self.start_url),
                    "url": full_url,
                    "marketplace": "nykaa",
                    "marketplace_name": "Nykaa",
                    "in_stock": True,
                    "page_no": page_no,
                    "crawled_at": datetime.now(timezone.utc).isoformat()
                }

                products.append(product_record)
            except Exception as item_err:
                logger.warning(f"  Error parsing card on page {page_no}: {item_err}")

        return products

    def crawl(
        self,
        start_page: int = 1,
        max_pages: int = 10,
        end_page: Optional[int] = None,
        export_format: str = "mongo",
        dry_run: bool = False,
        category_meta: Optional[Dict[str, Any]] = None
    ) -> int:
        """Run Nykaa makeup catalog crawl across pages"""
        auto_mode = (max_pages <= 0) and (end_page is None)
        if auto_mode:
            target_end_page = 222
        else:
            target_end_page = end_page if end_page is not None else min(222, start_page + max_pages - 1)

        if target_end_page < start_page:
            target_end_page = start_page

        cat = category_meta or lookup_category_by_url(self.start_url) or {}
        cat_path = cat.get('category_path', 'Makeup')

        logger.info("=" * 72)
        logger.info(f"       NYKAA MAKEUP CRAWLER ({DEFAULT_DB}.{DEFAULT_COLLECTION})")
        logger.info("=" * 72)
        logger.info(f"Category: {cat_path}")
        logger.info(f"Target URL: {self.start_url}")
        logger.info(f"Page Range: {start_page} to {target_end_page}")
        logger.info(f"Mode: {'DRY RUN' if dry_run else 'LIVE MONGODB SYNC'}")
        logger.info("-" * 72)

        all_products = {}
        total_upserted = 0

        for page_no in range(start_page, target_end_page + 1):
            page_url = self.build_page_url(page_no)
            logger.info(f"[PAGE {page_no}/{target_end_page}] Fetching: {page_url}")

            html = self.fetch_page_html(page_url)
            if not html:
                logger.warning(f"  Empty response for page {page_no}. Skipping.")
                continue

            cards = self.parse_products_from_html(html, page_no, category_meta=category_meta)
            if not cards:
                logger.info(f"  [STOP] No product cards found on page {page_no}. Reached end of category.")
                break

            logger.info(f"  Extracted {len(cards)} products on page {page_no}")

            for p in cards:
                all_products[p["id"]] = p

            if not dry_run and export_format in ["mongo", "all"]:
                upserted = save_nykaa_to_mongodb(
                    rows=cards,
                    mongo_uri=self.mongo_uri,
                    db_name=DEFAULT_DB,
                    collection_name=DEFAULT_COLLECTION
                )
                total_upserted += upserted

            if page_no < target_end_page:
                delay = random.uniform(*self.delay_range)
                time.sleep(delay)

        total_scraped = len(all_products)
        logger.info("-" * 72)
        logger.info(f"[CRAWL COMPLETE] Finished '{cat_path}'. Unique Products: {total_scraped}")
        return total_scraped

    def export_csv(self, products, filename="nykaa_makeupkhoj.csv"):
        """Export list of products to CSV file"""
        if not products:
            return
        keys = list(products[0].keys())
        out_path = os.path.join(os.path.dirname(__file__), filename)
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=keys)
            writer.writeheader()
            writer.writerows(products)

    def export_json(self, products, filename="nykaa_makeupkhoj.json"):
        """Export list of products to JSON file"""
        if not products:
            return
        out_path = os.path.join(os.path.dirname(__file__), filename)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(products, f, indent=2, ensure_ascii=False)


# --- CLI ENTRYPOINT ---
def main():
    parser = argparse.ArgumentParser(description="MakeupKhoj Nykaa Makeup Listing Crawler")
    parser.add_argument("--url", type=str, default=None, help="Custom starting category URL (if omitted, crawls all Nykaa makeup categories)")
    parser.add_argument("--sub-cat", type=str, default=None, help="Filter categories by subcategory (e.g. Face, Eyes, Lips, Nails, Tools)")
    parser.add_argument("--start-page", type=int, default=1, help="Starting page number [default: 1]")
    parser.add_argument("--max-pages", type=int, default=5, help="Number of pages to crawl per category [default: 5, 0 = all]")
    parser.add_argument("--end-page", type=int, default=None, help="Explicit end page number (overrides --max-pages)")
    parser.add_argument("--export", choices=["mongo", "csv", "json", "all"], default="mongo", help="Export destination")
    parser.add_argument("--mongo-uri", type=str, default=DEFAULT_MONGO_URI, help="MongoDB connection URI")
    parser.add_argument("--dry-run", action="store_true", help="Crawl without saving to MongoDB")

    args = parser.parse_args()

    nykaa_makeup_urls = get_marketplace_urls('nykaa')

    if args.url:
        cat_meta = lookup_category_by_url(args.url.strip()) or {}
        targets = [{'url': args.url.strip(), **cat_meta}]
    elif args.sub_cat:
        sub_filter = args.sub_cat.strip().lower()
        targets = [u for u in nykaa_makeup_urls if sub_filter in u.get('sub_category', '').lower() or sub_filter in u.get('category_name', '').lower()]
    else:
        targets = nykaa_makeup_urls

    logger.info("=" * 75)
    logger.info(f"      NYKAA MAKEUP CRAWLER (Target: {DEFAULT_DB}.{DEFAULT_COLLECTION})")
    logger.info(f"      Total Target Categories to Crawl: {len(targets)}")
    logger.info("=" * 75)

    grand_total = 0
    for idx, target in enumerate(targets, start=1):
        target_url = target['url']
        cat_name = target.get('category_path', target.get('category_name', 'Makeup'))
        logger.info(f"\n[{idx}/{len(targets)}] Processing Category: {cat_name}")
        logger.info(f"      URL: {target_url}")

        crawler = NykaaCrawler(
            start_url=target_url,
            mongo_uri=args.mongo_uri
        )
        scraped = crawler.crawl(
            start_page=args.start_page,
            max_pages=args.max_pages,
            end_page=args.end_page,
            export_format=args.export,
            dry_run=args.dry_run,
            category_meta=target
        )
        grand_total += scraped

    logger.info("\n" + "=" * 75)
    logger.info(f"[NYKAA SUITE COMPLETED] Total unique items parsed across {len(targets)} categories: {grand_total}")
    logger.info("=" * 75)


if __name__ == "__main__":
    main()
