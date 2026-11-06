#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ScentKhoj Tata CLiQ Fragrance Listing Crawler - tatacliq_crawler.py
==================================================================
High-speed, API-driven listing crawler for the Tata CLiQ Fragrance Catalog.
Extracts verified product details, exact pricing, ratings, reviews, tags,
variant counts, high-resolution imagery, and performs brand & taxonomy extraction.

Features:
  - Direct integration with Tata CLiQ Search BFF endpoint
  - Polite pagination with configurable jitter/delay to avoid rate limits
  - Real-time batch upserts into MongoDB (`tatacliq.products`)
  - Accurate historical price tracking (lowest/highest recorded prices, price history)
  - High-precision brand extraction using 1,000+ reference brands
  - Volume, concentration, and gender parsing
  - Export options: MongoDB, CSV, JSON
  - Optional catalog sync flag (`--sync-catalog`)

Usage:
  # Test with 3 pages:
  python crawler/tatacliq/tatacliq_crawler.py --max-pages 3

  # Crawl all pages slowly and politely:
  python crawler/tatacliq/tatacliq_crawler.py --delay 1.2

  # Crawl and immediately sync into ScentKhoj Master Catalog:
  python crawler/tatacliq/tatacliq_crawler.py --sync-catalog
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
import ssl
import urllib.request
from urllib.error import HTTPError, URLError
from datetime import datetime, timezone
from urllib.parse import urlparse, urlencode

# Ensure UTF-8 console output on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

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

DEFAULT_DB = DB_NAME  # 'makeupkhoj'
DEFAULT_COLLECTION = COLLECTIONS['tatacliq']  # 'tatacliq_makeupkhoj'
API_ENDPOINT = "https://searchbff.tatacliq.com/products/mpl/search"

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("TataCliqCrawler")


# --- BRAND MATCHER SYSTEM ---
class BrandMatcher:
    """High-precision brand extraction engine for Tata CLiQ fragrance titles"""

    def __init__(self, brands_file_path=None, mongo_uri=None):
        self.brands_set = set()
        self._load_reference_brands(brands_file_path, mongo_uri)
        # Sort by length descending to match longest brand first (e.g. "Skinn by Titan" before "Titan")
        self.sorted_brands = sorted(list(self.brands_set), key=lambda x: len(x), reverse=True)
        logger.info(f"[BrandMatcher] Initialized with {len(self.sorted_brands)} reference brands.")

    def _load_reference_brands(self, brands_file_path=None, mongo_uri=None):
        curated_brands = [
            "Skinn by Titan", "Skinn", "Titan", "Fastrack", "Jean Paul Gaultier",
            "Carolina Herrera", "Rabanne", "Paco Rabanne", "Armaf", "Rasasi",
            "Ajmal", "Davidoff", "Calvin Klein", "Nautica", "Tommy Hilfiger",
            "Hugo Boss", "Versace", "Dior", "Chanel", "Gucci", "Prada",
            "Yves Saint Laurent", "YSL", "Burberry", "Bvlgari", "Dolce & Gabbana",
            "Montblanc", "Ferragamo", "Coach", "Jimmy Choo", "Lattafa", "Afnan",
            "Guess", "Police", "Jaguar", "Denver", "Wild Stone", "Bella Vita Luxury",
            "Bella Vita", "The Man Company", "Bombay Shaving Company", "Carlton London",
            "Fogg", "Engage", "Secret Temptation", "Yardley London", "Yardley",
            "Park Avenue", "Ramsons", "Riya", "AdilQadri", "Al-Nuaim", "Al Haramain",
            "Swiss Arabian", "Lancome", "Estee Lauder", "Clinique", "MAC", "Chopard",
            "Narciso Rodriguez", "Issey Miyake", "Elie Saab", "Mancera", "Montale",
            "Roja", "Creed", "Maison Francis Kurkdjian", "Diptyque", "Byredo",
            "Amouage", "Victoria's Secret", "Bath & Body Works", "Jo Malone London",
            "Jo Malone", "Forest Essentials", "Plum BodyLovin'", "Plum", "KAYALI"
        ]
        for b in curated_brands:
            self.brands_set.add(b.strip())

        # Load from crawler/brands.json if present
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

        # Load from MongoDB scentkhoj.brands and products if available
        if pymongo and mongo_uri:
            try:
                client = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=2500)
                db = client['scentkhoj']
                for doc in db['brands'].find({}, {'name': 1}):
                    if doc.get('name'):
                        self.brands_set.add(doc['name'].strip())
                for b in db['products'].distinct('brand'):
                    if b and isinstance(b, str) and b.strip():
                        self.brands_set.add(b.strip())
                client.close()
            except Exception:
                pass

    def clean_brand(self, raw_brand: str, title: str = "") -> str:
        """Clean and normalize brand name from Tata CLiQ raw brand or title"""
        if raw_brand and raw_brand.strip():
            b_cand = raw_brand.strip()
            # Check direct match or alias
            for ref in self.sorted_brands:
                if ref.lower() == b_cand.lower():
                    return ref
            return b_cand

        if not title:
            return "Unknown"

        t_clean = title.strip()
        for b in self.sorted_brands:
            pat = rf'^{re.escape(b)}\b'
            if re.search(pat, t_clean, re.I):
                return b

        for b in self.sorted_brands:
            if len(b) >= 3:
                pat = rf'\b{re.escape(b)}\b'
                if re.search(pat, t_clean, re.I):
                    return b

        return "Unknown"


# --- ATTRIBUTE EXTRACTION HELPERS ---
def extract_volume_ml(text: str) -> int:
    """Extract volume in ml from title or attributes."""
    if not text:
        return 0
    t = text.lower()
    # Direct ml patterns
    m = re.search(r'(\d+(?:\.\d+)?)\s*(?:ml|m\.l\.|milliliter|milli\s*litre)', t)
    if m:
        try:
            return int(float(m.group(1)))
        except (ValueError, TypeError):
            pass

    # Fluid ounce patterns
    m_oz = re.search(r'(\d+(?:\.\d+)?)\s*(?:fl\.?\s*oz|oz)', t)
    if m_oz:
        try:
            oz = float(m_oz.group(1))
            return int(round(oz * 29.5735))
        except (ValueError, TypeError):
            pass

    # Grams for solid perfumes / attars
    m_gm = re.search(r'(\d+(?:\.\d+)?)\s*(?:gm|g|grams)', t)
    if m_gm:
        try:
            return int(float(m_gm.group(1)))
        except (ValueError, TypeError):
            pass

    return 0


def extract_concentration(text: str) -> str:
    """Extract perfume concentration (EDP, EDT, Parfum, Mist, etc.)."""
    if not text:
        return 'Eau De Parfum'
    t = text.lower()
    if re.search(r'\b(extra(it)?\s*de\s*parfum|pure\s*perfume|parfum)\b', t):
        return 'Parfum'
    if re.search(r'\b(eau\s*de\s*parfum|edp)\b', t):
        return 'Eau De Parfum'
    if re.search(r'\b(eau\s*de\s*toilette|edt)\b', t):
        return 'Eau De Toilette'
    if re.search(r'\b(eau\s*de\s*cologne|edc|cologne)\b', t):
        return 'Eau De Cologne'
    if re.search(r'\b(body\s*mist|body\s*spray|fragrance\s*mist|deodorant|deo)\b', t):
        return 'Body Mist & Spray'
    if re.search(r'\b(attar|ittar|perfume\s*oil|roll\s*on)\b', t):
        return 'Attar & Oils'
    return 'Eau De Parfum'


def extract_gender(text: str) -> str:
    """Extract intended gender."""
    if not text:
        return 'Unisex'
    t = text.lower()
    is_women = bool(re.search(r'\b(women|woman|female|pour\s*femme|for\s*her|ladies)\b', t))
    is_men = bool(re.search(r'\b(men|man|male|pour\s*homme|for\s*him)\b', t))
    if is_women and not is_men:
        return 'Women'
    if is_men and not is_women:
        return 'Men'
    return 'Unisex'


# --- MONGODB MANAGER ---
def save_tatacliq_to_mongodb(
    rows,
    mongo_uri=None,
    db_name=DEFAULT_DB,
    collection_name=DEFAULT_COLLECTION
) -> int:
    """Batch upsert products into tatacliq.products collection with price tracking"""
    if not rows:
        return 0

    if pymongo is None:
        logger.error("pymongo is not installed. Please run 'pip install pymongo'.")
        return 0

    uri = mongo_uri or DEFAULT_MONGO_URI

    try:
        validate_db_safety(db_name)
        masked_uri = uri.split("@")[-1] if "@" in uri else uri
        client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=10000)
        db = client[db_name]
        collection = db[collection_name]

        # Ensure indexes
        collection.create_index("id", unique=True)
        collection.create_index("product_id", unique=False)
        collection.create_index("brand", unique=False)
        collection.create_index("crawled_at", unique=False)
        collection.create_index("price", unique=False)

        # Pre-fetch existing docs to track price history & shifts
        row_ids = [str(r.get("id")) for r in rows if r.get("id")]
        existing_map = {}
        try:
            for doc in collection.find(
                {"id": {"$in": row_ids}},
                {"id": 1, "price": 1, "mrp": 1, "price_history": 1, "lowest_recorded_price": 1, "highest_recorded_price": 1}
            ):
                existing_map[str(doc["id"])] = doc
        except Exception as e:
            logger.warning(f"Error prefetching existing documents: {e}")

        now_iso = datetime.now(timezone.utc).isoformat()
        operations = []

        for row in rows:
            doc_id = str(row.get("id"))
            current_price = row.get("price")
            existing = existing_map.get(doc_id)

            if existing and current_price is not None:
                old_price = existing.get("price")
                history = existing.get("price_history") or []
                lowest = existing.get("lowest_recorded_price", current_price)
                highest = existing.get("highest_recorded_price", current_price)

                if old_price is not None and old_price != current_price:
                    logger.info(
                        f"[PriceShift] Tata CLiQ Product {doc_id} ('{row.get('title')[:30]}...'): "
                        f"₹{old_price} -> ₹{current_price}"
                    )
                    history.append({
                        "price": current_price,
                        "timestamp": now_iso
                    })

                lowest = min(lowest, current_price) if lowest else current_price
                highest = max(highest, current_price) if highest else current_price

                row["price_history"] = history
                row["lowest_recorded_price"] = lowest
                row["highest_recorded_price"] = highest
            else:
                if current_price is not None:
                    row["price_history"] = [{"price": current_price, "timestamp": now_iso}]
                    row["lowest_recorded_price"] = current_price
                    row["highest_recorded_price"] = current_price

            row["price_last_checked"] = now_iso
            row["updated_at"] = now_iso

            operations.append(
                UpdateOne(
                    {"id": doc_id},
                    {"$set": row},
                    upsert=True
                )
            )

        result = collection.bulk_write(operations, ordered=False)
        logger.info(
            f"SUCCESS: Synced {len(rows)} products to MongoDB -> "
            f"Database: '{db_name}', Collection: '{collection_name}' "
            f"(Matched: {result.matched_count}, Modified: {result.modified_count}, Upserted: {result.upserted_count})"
        )
        client.close()
        return len(rows)
    except Exception as e:
        logger.error(f"Failed to save products to MongoDB: {e}")
        return 0


# --- TATA CLIQ CRAWLER CLASS ---
class TataCliqCrawler:
    """Polite, robust listing crawler for Tata CLiQ fragrance API"""

    def __init__(
        self,
        mongo_uri=DEFAULT_MONGO_URI,
        db_name=DEFAULT_DB,
        collection_name=DEFAULT_COLLECTION,
        delay=1.2,
        search_text="fragrances:relevance:inStockFlag:true",
        page_size=40,
        ssl_verify=False
    ):
        self.mongo_uri = mongo_uri
        self.db_name = db_name
        self.collection_name = collection_name
        self.delay = delay
        self.search_text = search_text
        self.page_size = page_size
        self.ssl_verify = ssl_verify

        # SSL context
        self.ctx = ssl.create_default_context()
        if not ssl_verify:
            self.ctx.check_hostname = False
            self.ctx.verify_mode = ssl.CERT_NONE

        # Initialize BrandMatcher
        self.brand_matcher = BrandMatcher(mongo_uri=mongo_uri)

        # Standard browser headers
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Origin': 'https://www.tatacliq.com',
            'Referer': 'https://www.tatacliq.com/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site'
        }

    def fetch_page(self, page_no: int, retries: int = 4) -> dict:
        """Fetch JSON payload for a given page index with exponential backoff"""
        params = {
            'searchText': self.search_text,
            'isKeywordRedirect': 'false',
            'isKeywordRedirectEnabled': 'true',
            'channel': 'WEB',
            'isMDE': 'true',
            'isTextSearch': 'false',
            'isFilter': 'false',
            'qc': 'false',
            'page': str(page_no),
            'pageSize': str(self.page_size),
            'typeID': 'all',
            'isPwa': 'true',
            'isFilterDataRequired': 'true' if page_no == 0 else 'false'
        }

        query_str = urlencode(params)
        req_url = f"{API_ENDPOINT}?{query_str}"

        for attempt in range(1, retries + 1):
            try:
                req = urllib.request.Request(req_url, headers=self.headers)
                with urllib.request.urlopen(req, context=self.ctx, timeout=20) as resp:
                    if resp.status == 200:
                        raw_body = resp.read().decode('utf-8')
                        return json.loads(raw_body)
                    logger.warning(f"Unexpected status {resp.status} on page {page_no} (attempt {attempt}/{retries})")
            except HTTPError as e:
                logger.warning(f"HTTPError {e.code} on page {page_no} (attempt {attempt}/{retries}): {e.reason}")
                if e.code == 429:
                    sleep_time = 3.0 * attempt + random.uniform(1.0, 3.0)
                    logger.info(f"Rate limited (429). Sleeping for {sleep_time:.1f}s before retry...")
                    time.sleep(sleep_time)
            except URLError as e:
                logger.warning(f"URLError on page {page_no} (attempt {attempt}/{retries}): {e.reason}")
            except Exception as e:
                logger.warning(f"General error on page {page_no} (attempt {attempt}/{retries}): {e}")

            time.sleep(1.5 * attempt + random.uniform(0.5, 1.5))

        logger.error(f"Failed to fetch page {page_no} after {retries} attempts.")
        return {}

    def parse_item(self, item: dict, page_no: int) -> dict:
        """Parse raw product JSON from Tata CLiQ API into normalized schema"""
        raw_id = str(item.get("productId") or item.get("orgProductCode") or item.get("ussid") or "")
        if not raw_id:
            return None

        # Clean title & brand
        raw_title = item.get("productTitle") or item.get("productname") or ""
        raw_brand = item.get("brandname") or ""
        brand = self.brand_matcher.clean_brand(raw_brand, raw_title)

        # Price parsing
        price_obj = item.get("price") or {}
        selling_obj = price_obj.get("sellingPrice") or {}
        mrp_obj = price_obj.get("mrpPrice") or {}

        price = float(selling_obj.get("doubleValue") or 0)
        mrp = float(mrp_obj.get("doubleValue") or price)
        if mrp <= 0 and price > 0:
            mrp = price

        discount_pct_val = item.get("discountPercent")
        try:
            discount_pct = int(float(discount_pct_val)) if discount_pct_val is not None else 0
        except (ValueError, TypeError):
            discount_pct = 0

        if discount_pct <= 0 and mrp > price and price > 0:
            discount_pct = int(round(((mrp - price) / mrp) * 100))

        discount_str = f"{discount_pct}% OFF" if discount_pct > 0 else ""

        # Image URLs (prepending https: to scheme-relative URLs)
        raw_img = item.get("imageURL") or ""
        if raw_img.startswith("//"):
            img_url = "https:" + raw_img
        elif raw_img.startswith("/"):
            img_url = "https://img.tatacliq.com" + raw_img
        else:
            img_url = raw_img

        images = []
        raw_images_list = item.get("productImages") or []
        for p_img in raw_images_list:
            if isinstance(p_img, str) and p_img.strip():
                clean_img = ("https:" + p_img) if p_img.startswith("//") else p_img
                if clean_img not in images:
                    images.append(clean_img)

        if img_url and img_url not in images:
            images.insert(0, img_url)

        # Product URL
        web_url = item.get("webURL") or ""
        if web_url.startswith("/"):
            full_url = f"https://www.tatacliq.com{web_url}"
        elif web_url.startswith("http"):
            full_url = web_url
        else:
            full_url = f"https://www.tatacliq.com/p-{raw_id.lower()}"

        # Ratings & reviews
        rating = float(item.get("averageRating") or 0.0)
        rating_count = int(item.get("ratingCount") or 0)
        review_count = int(item.get("totalNoOfReviews") or 0)

        # Taxonomy attributes
        vol_ml = extract_volume_ml(raw_title)
        concentration = extract_concentration(raw_title)
        gender = extract_gender(raw_title)

        now_iso = datetime.now(timezone.utc).isoformat()

        return {
            "id": raw_id,
            "product_id": raw_id,
            "brand": brand,
            "title": raw_title,
            "name": raw_title,
            "price": price,
            "mrp": mrp,
            "discount": discount_str,
            "discount_percentage": discount_pct,
            "url": full_url,
            "image": img_url,
            "images": images,
            "rating": rating,
            "rating_count": rating_count,
            "review_count": review_count,
            "in_stock": bool(item.get("inStockFlag", True)),
            "currency": "INR",
            "marketplace": "tatacliq",
            "marketplace_name": "Tata CLiQ",
            "style_code": item.get("styleCode") or "",
            "base_product_id": item.get("baseProductId") or "",
            "variant_count": item.get("variantCount") or "",
            "category_hierarchy": item.get("categoryHierarchy") or [],
            "volume_ml": vol_ml,
            "concentration": concentration,
            "gender": gender,
            "page_no": page_no,
            "crawled_at": now_iso
        }

    def crawl(self, max_pages: int = None, start_page: int = 0) -> list:
        """Execute the crawling process across Tata CLiQ fragrance catalog"""
        logger.info("=" * 65)
        logger.info("Starting Tata CLiQ Fragrance Crawler")
        logger.info(f"Search Query: {self.search_text}")
        logger.info(f"Start Page: {start_page} | Max Pages: {max_pages or 'ALL'}")
        logger.info(f"Polite Delay: {self.delay}s per page")
        logger.info("=" * 65)

        all_products = []
        current_page = start_page
        total_pages = None
        consecutive_empty = 0

        while True:
            if max_pages and (current_page - start_page) >= max_pages:
                logger.info(f"Reached configured limit of {max_pages} pages.")
                break

            logger.info(f"--> Requesting Page {current_page}" + (f" of {total_pages}" if total_pages else "") + "...")
            data = self.fetch_page(current_page)

            if not data:
                consecutive_empty += 1
                if consecutive_empty >= 3:
                    logger.warning("3 consecutive empty/failed responses received. Halting crawl.")
                    break
                current_page += 1
                continue

            consecutive_empty = 0

            # Inspect pagination metadata on page 0
            if total_pages is None and "pagination" in data:
                pagination = data["pagination"]
                total_pages = pagination.get("totalPages", 1)
                total_results = pagination.get("totalResults", 0)
                logger.info(f"[Meta] Discovered {total_results} total products across {total_pages} pages.")

            search_results = data.get("searchresult") or []
            if not search_results:
                logger.info(f"No products found on page {current_page}. Reached end of catalog.")
                break

            parsed_page_products = []
            for item in search_results:
                parsed = self.parse_item(item, current_page)
                if parsed and parsed.get("id"):
                    parsed_page_products.append(parsed)

            logger.info(f"Page {current_page}: Parsed {len(parsed_page_products)} products.")

            # Save page products directly to MongoDB
            if parsed_page_products:
                save_tatacliq_to_mongodb(
                    parsed_page_products,
                    mongo_uri=self.mongo_uri,
                    db_name=self.db_name,
                    collection_name=self.collection_name
                )
                all_products.extend(parsed_page_products)

            # Check if we reached the final page
            if total_pages is not None and current_page >= (total_pages - 1):
                logger.info(f"Successfully reached final catalog page ({current_page} / {total_pages - 1}).")
                break

            current_page += 1

            # Polite randomized sleep to respect Tata CLiQ servers
            sleep_duration = self.delay + random.uniform(0.2, 0.6)
            time.sleep(sleep_duration)

        logger.info("=" * 65)
        logger.info(f"Crawl Completed: Collected {len(all_products)} products across {current_page - start_page} pages.")
        logger.info("=" * 65)
        return all_products


# --- CLI INTERFACE ---
def main():
    parser = argparse.ArgumentParser(description="ScentKhoj Tata CLiQ Fragrance Crawler")
    parser.add_argument("--max-pages", type=int, default=None, help="Maximum number of pages to crawl (default: all)")
    parser.add_argument("--start-page", type=int, default=0, help="Starting page index (default: 0)")
    parser.add_argument("--delay", type=float, default=1.2, help="Polite delay in seconds between page requests (default: 1.2)")
    parser.add_argument("--page-size", type=int, default=40, help="Page size (default: 40)")
    parser.add_argument("--mongo-uri", type=str, default=DEFAULT_MONGO_URI, help="MongoDB connection URI")
    parser.add_argument("--db", type=str, default=DEFAULT_DB, help="Target database name (default: tatacliq)")
    parser.add_argument("--collection", type=str, default=DEFAULT_COLLECTION, help="Target collection name (default: products)")
    parser.add_argument("--export", choices=["csv", "json", "all"], help="Export scraped products to file")
    parser.add_argument("--sync-catalog", action="store_true", help="Automatically trigger Master Catalog SKU sync after crawling")

    args = parser.parse_args()

    crawler = TataCliqCrawler(
        mongo_uri=args.mongo_uri,
        db_name=args.db,
        collection_name=args.collection,
        delay=args.delay,
        page_size=args.page_size
    )

    products = crawler.crawl(max_pages=args.max_pages, start_page=args.start_page)

    # Optional file exports
    if args.export and products:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        export_dir = os.path.join(os.path.dirname(__file__), "exports")
        os.makedirs(export_dir, exist_ok=True)

        if args.export in ["json", "all"]:
            json_file = os.path.join(export_dir, f"tatacliq_products_{timestamp}.json")
            with open(json_file, "w", encoding="utf-8") as f:
                json.dump(products, f, indent=2, ensure_ascii=False)
            logger.info(f"Exported JSON to {json_file}")

        if args.export in ["csv", "all"]:
            csv_file = os.path.join(export_dir, f"tatacliq_products_{timestamp}.csv")
            fieldnames = [
                "id", "brand", "title", "price", "mrp", "discount", "discount_percentage",
                "rating", "rating_count", "in_stock", "volume_ml", "concentration",
                "gender", "url", "image", "crawled_at"
            ]
            with open(csv_file, "w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
                writer.writeheader()
                writer.writerows(products)
            logger.info(f"Exported CSV to {csv_file}")

    # Optional Catalog Sync Trigger
    if args.sync_catalog:
        logger.info("\nTriggering ScentKhoj Master Catalog SKU Sync for Tata CLiQ...")
        sync_script = os.path.join(os.path.dirname(__file__), "..", "..", "server", "scripts", "sync_tatacliq_skus.py")
        if os.path.isfile(sync_script):
            os.system(f'python "{sync_script}"')
        else:
            logger.warning(f"Sync script not found at {sync_script}")


if __name__ == "__main__":
    main()
