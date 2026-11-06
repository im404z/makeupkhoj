#!/usr/bin/env python3
"""
Amazon Makeup Product Data Crawler
Reads ASINs from the 'amazon_makeupkhoj' MongoDB collection, navigates to each product page,
and extracts complete product data using the in-browser DOM extraction engine from amazon-product-extractor-logic.js.
Saves complete product datasets in-place to the 'amazon_makeupkhoj' collection in MongoDB.
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
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from pymongo import MongoClient, UpdateOne
from pymongo.errors import ServerSelectionTimeoutError
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Force UTF-8 encoding on Windows console
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

# Setup logging
os.makedirs('logs', exist_ok=True)
_file_handler = logging.FileHandler('logs/amazon_makeup_product_data.log', encoding='utf-8')
_file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))

_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))

logging.basicConfig(
    level=logging.INFO,
    handlers=[_file_handler, _stream_handler]
)
# Import MakeupKhoj DB config
_crawler_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _crawler_root not in sys.path:
    sys.path.insert(0, _crawler_root)

from db_config import get_db, COLLECTIONS, DB_NAME, DEFAULT_MONGO_URI, validate_db_safety

logger = logging.getLogger("amazon-makeup-pdp")

# Target Database and Collection (Unified listing + PDP data inside 'amazon_makeupkhoj')
TARGET_DB = DB_NAME  # 'makeupkhoj'
TARGET_COLLECTION = COLLECTIONS['amazon']  # 'amazon_makeupkhoj'
SOURCE_COLLECTION = TARGET_COLLECTION

# Default Base URL & Location for Amazon India
DEFAULT_BASE_URL = "https://www.amazon.in"
DEFAULT_ZIP_CODE = "110037"


def get_extractor_js():
    """
    Load the in-browser extraction engine from amazon-product-extractor-logic.js
    """
    js_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "amazon-product-extractor-logic.js")
    if os.path.isfile(js_path):
        try:
            with open(js_path, "r", encoding="utf-8") as f:
                content = f.read()

            start_marker = "const rawData = await page.evaluate("
            start_idx = content.find(start_marker)
            if start_idx != -1:
                fn_start = start_idx + len(start_marker)
                end_marker = "}, {"
                fn_end = content.rfind(end_marker)
                if fn_end != -1:
                    js_code = content[fn_start:fn_end + 1].strip()
                    logger.info(f"[JS ENGINE] Loaded extractor ({len(js_code)} chars) from {os.path.basename(js_path)}")
                    return js_code
        except Exception as e:
            logger.warning(f"Could not load external JS file: {e}. Using fallback.")

    raise RuntimeError(f"Could not load extraction engine from {js_path}")


class MongoProductManager:
    """Manages reading ASINs from amazon_makeupkhoj and enriching them with full product catalog details"""

    def __init__(self, mongo_uri=None, db_name=None):
        self.mongo_uri = mongo_uri or DEFAULT_MONGO_URI
        self.db_name = db_name or TARGET_DB
        validate_db_safety(self.db_name)
        self.client = None
        self.db = None
        self.col = None
        self.brands_col = None
        self.sk_products_col = None
        self._connect()

    def _connect(self):
        try:
            logger.info(f"[MONGO] Connecting to {self.db_name}.{TARGET_COLLECTION}...")
            self.client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=6000)
            self.client.admin.command('ping')
            self.db = self.client[self.db_name]
            self.col = self.db[TARGET_COLLECTION]
            self.source_col = self.col
            self.target_col = self.col
            self.brands_col = self.db['brands']
            self.sk_products_col = self.db['products']

            # Create indexes
            self.target_col.create_index('asin', unique=True)
            self.target_col.create_index('brand', unique=False)
            self.target_col.create_index('category_path', unique=False)
            self.target_col.create_index('sub_category', unique=False)
            self.target_col.create_index('scraped_at', unique=False)
            self.target_col.create_index('price_last_checked', unique=False)
            logger.info(f"[MONGO OK] Connected! Verified '{self.db_name}.{TARGET_COLLECTION}'. Master collections: 'products', 'brands'.")
        except ServerSelectionTimeoutError as e:
            logger.error(f"[MONGO ERROR] Cannot connect to MongoDB: {e}")
            self.target_col.create_index('scraped_at', unique=False)
            self.target_col.create_index('price_last_checked', unique=False)
            logger.info(f"[MONGO OK] Connected! Source: '{SOURCE_COLLECTION}' | Target: '{TARGET_COLLECTION}' | Brands: 'scentkhoj.brands' | Master: 'scentkhoj.products'.")
        except ServerSelectionTimeoutError as e:
            logger.error(f"[MONGO ERROR] Cannot connect to MongoDB: {e}")
            raise

    def get_asins_to_scrape(self, mode='pending', force=False):
        """
        Fetch ASINs from amazon_makeupkhoj.
        - mode='all' or force=True: Returns all catalog ASINs to recheck prices, history, reviews, and counts.
        - mode='pending': Returns only unscraped or incomplete ASINs.
        """
        source_docs = list(self.source_col.find({}, {'asin': 1, 'brand': 1, 'title': 1, 'url': 1, '_id': 0}))
        if not source_docs:
            return []

        if mode == 'all' or force:
            logger.info(f"[ASIN STATUS] Mode: ALL CATALOG | Total in {SOURCE_COLLECTION}: {len(source_docs)} items to re-check.")
            return source_docs

        # Get set of already scraped ASINs that already have valid brand and price
        scraped_asins = set(
            self.target_col.find(
                {
                    'pdp_scraped': True,
                    'price': {'$exists': True, '$ne': None}
                },
                {'asin': 1}
            ).distinct('asin')
        )
        pending = [
            doc for doc in source_docs
            if doc.get('asin') and (
                doc['asin'] not in scraped_asins or
                not doc.get('brand') or
                doc.get('brand') in ('Pending', 'Makeup', 'Cosmetics')
            )
        ]
        logger.info(f"[ASIN STATUS] Mode: PENDING | Total in {SOURCE_COLLECTION}: {len(source_docs)} | Already Scraped: {len(scraped_asins)} | Pending: {len(pending)}")
        return pending

    def save_product_detail(self, product_data):
        """
        Upsert complete product detail into amazon_makeupkhoj.
        Detects price changes, maintains price history, tracks rating & review count changes,
        and synchronizes live changes to makeupkhoj.products master catalog.
        """
        asin = product_data.get('asin')
        if not asin:
            return False

        try:
            now_utc = datetime.now(timezone.utc)
            now_iso = now_utc.isoformat()
            today_str = now_utc.strftime('%Y-%m-%d')

            new_price = product_data.get('price')
            mrp = product_data.get('mrp')
            if mrp is None and new_price is not None:
                mrp = new_price
            elif new_price is None and mrp is not None:
                new_price = mrp

            product_data['price'] = new_price
            product_data['mrp'] = mrp
            product_data['price_last_checked'] = now_iso
            product_data['updated_at'] = now_iso

            # Check existing document in target collection
            existing = self.target_col.find_one({'asin': asin})

            update_ops = {'$set': product_data}
            price_shift_detected = False
            old_price = None

            if existing:
                old_price = existing.get('price') or existing.get('currentPrice')
                existing_history = existing.get('price_history') or []

                # Price Change Detection & Logging
                if new_price is not None and old_price is not None and round(float(old_price)) != round(float(new_price)):
                    price_shift_detected = True
                    shift = round(float(new_price) - float(old_price))
                    history_entry = {
                        'date': today_str,
                        'timestamp': now_iso,
                        'price': new_price,
                        'old_price': old_price,
                        'mrp': mrp or new_price,
                        'change': shift,
                        'marketplace': 'amazon'
                    }
                    if shift < 0:
                        logger.info(f"  [PRICE DROP] ASIN {asin}: ₹{old_price} -> ₹{new_price} (Save ₹{abs(shift)} / Price Drop!)")
                    else:
                        logger.info(f"  [PRICE HIKE] ASIN {asin}: ₹{old_price} -> ₹{new_price} (+₹{shift})")

                    update_ops['$push'] = {
                        'price_history': {
                            '$each': [history_entry],
                            '$slice': -30
                        }
                    }
                    update_ops['$min'] = {'lowest_recorded_price': new_price}
                    update_ops['$max'] = {'highest_recorded_price': max(mrp or new_price, existing.get('highest_recorded_price', 0))}
                elif not existing_history and new_price is not None:
                    # Initialize first price entry
                    history_entry = {
                        'date': today_str,
                        'timestamp': now_iso,
                        'price': new_price,
                        'old_price': new_price,
                        'mrp': mrp or new_price,
                        'change': 0,
                        'marketplace': 'amazon'
                    }
                    update_ops['$push'] = {
                        'price_history': {
                            '$each': [history_entry],
                            '$slice': -30
                        }
                    }
                    update_ops['$min'] = {'lowest_recorded_price': new_price}
                    update_ops['$max'] = {'highest_recorded_price': mrp or new_price}

                # Review / Rating change log
                old_rating = existing.get('averageRating') or existing.get('rating')
                new_rating = product_data.get('averageRating')
                old_rc = existing.get('ratingsCount') or existing.get('review_count')
                new_rc = product_data.get('ratingsCount') or product_data.get('review_count')
                if (new_rating and old_rating and new_rating != old_rating) or (new_rc and old_rc and new_rc != old_rc):
                    logger.info(f"  [REVIEWS UPDATED] ASIN {asin}: Rating {old_rating}★ -> {new_rating}★ | Reviews: {old_rc} -> {new_rc}")

            else:
                # Brand new record in target collection
                product_data['created_at'] = now_iso
                if new_price is not None:
                    history_entry = {
                        'date': today_str,
                        'timestamp': now_iso,
                        'price': new_price,
                        'old_price': new_price,
                        'mrp': mrp or new_price,
                        'change': 0,
                        'marketplace': 'amazon'
                    }
                    update_ops['$push'] = {
                        'price_history': {
                            '$each': [history_entry],
                            '$slice': -30
                        }
                    }
                    product_data['lowest_recorded_price'] = new_price
                    product_data['highest_recorded_price'] = mrp or new_price

            self.target_col.update_one(
                {'asin': asin},
                update_ops,
                upsert=True
            )

            # Mark source document as scraped and back-populate verified brand & price
            brand = product_data.get('brand')
            source_update = {
                'pdp_scraped': True,
                'pdp_scraped_at': now_iso,
                'price_last_checked': now_iso
            }
            if new_price is not None:
                source_update['price'] = new_price
            if brand and brand not in ('Makeup', 'Cosmetics', 'Pending'):
                source_update['brand'] = brand
                source_update['brand_verified'] = True

                # Upsert into makeupkhoj.brands if not exists
                try:
                    brand_slug = re.sub(r'[^a-z0-9]+', '-', brand.lower()).strip('-')
                    if brand_slug:
                        self.brands_col.update_one(
                            {'slug': brand_slug},
                            {
                                '$setOnInsert': {
                                    'name': brand,
                                    'slug': brand_slug,
                                    'createdAt': now_utc
                                }
                            },
                            upsert=True
                        )
                except Exception:
                    pass

            self.source_col.update_one(
                {'asin': asin},
                {'$set': source_update}
            )

            # Propagate updates to scentkhoj.products master catalog
            try:
                sk_update = {
                    'price': new_price,
                    'lowest_price': new_price,
                    'mappings.amazon.price': new_price,
                    'mappings.amazon.mrp': mrp,
                    'mappings.amazon.rating': product_data.get('averageRating'),
                    'mappings.amazon.rating_count': product_data.get('ratingsCount'),
                    'mappings.amazon.updated_at': now_iso,
                    'price_last_checked': now_iso,
                    'updated_at': now_iso
                }
                if product_data.get('inStock') is not None:
                    sk_update['mappings.amazon.in_stock'] = product_data.get('inStock')

                sk_ops = {'$set': sk_update}
                if price_shift_detected and old_price is not None:
                    history_entry = {
                        'date': today_str,
                        'timestamp': now_iso,
                        'price': new_price,
                        'old_price': old_price,
                        'mrp': mrp or new_price,
                        'change': round(float(new_price) - float(old_price)),
                        'marketplace': 'amazon'
                    }
                    sk_ops['$push'] = {
                        'price_history': {
                            '$each': [history_entry],
                            '$slice': -30
                        }
                    }
                    if new_price:
                        sk_ops['$min'] = {'lowest_recorded_price': new_price}

                self.sk_products_col.update_many(
                    {
                        '$or': [
                            {'mappings.amazon.asin': asin},
                            {'asin': asin}
                        ]
                    },
                    sk_ops
                )
            except Exception as sk_e:
                logger.debug(f"Scentkhoj sync note for ASIN {asin}: {sk_e}")

            return True
        except Exception as e:
            logger.error(f"[MONGO SAVE ERROR] Failed to save {asin}: {e}")
            return False

    def get_counts(self):
        """Return counts of source and target collections"""
        try:
            source_count = self.source_col.count_documents({})
            target_count = self.target_col.count_documents({})
            return source_count, target_count
        except Exception:
            return 0, 0


class ProductDetailCrawler:
    """Headless Playwright Crawler for extracting Amazon Product Detail Pages"""

    def __init__(self, base_url=DEFAULT_BASE_URL, zip_code=DEFAULT_ZIP_CODE, extractor_js=None, mongo_manager=None):
        self.base_url = base_url
        self.zip_code = zip_code
        self.extractor_js = extractor_js
        self.mongo = mongo_manager
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None

        parsed = urlparse(base_url)
        self.domain = parsed.netloc.replace('www.', '')

    def start_browser(self):
        """Start Playwright Chromium browser instance with stealth configuration"""
        try:
            logger.info(f"[BROWSER] Launching headless browser for {self.domain}...")
            self.playwright = sync_playwright().start()
            self.browser = self.playwright.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-infobars',
                    '--ignore-certificate-errors'
                ]
            )
            self.context = self.browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale='en-IN'
            )

            # Set currency preference cookie
            try:
                self.context.add_cookies([{
                    'name': 'i18n-prefs',
                    'value': 'INR',
                    'domain': f'.{self.domain}',
                    'path': '/'
                }])
            except Exception:
                pass

            self.page = self.context.new_page()
            logger.info("[BROWSER OK] Headless browser ready.")
            return True
        except Exception as e:
            logger.error(f"[BROWSER ERROR] Failed to start browser: {e}")
            return False

    def close_browser(self):
        """Clean shutdown of browser instance"""
        try:
            if self.page:
                self.page.close()
            if self.context:
                self.context.close()
            if self.browser:
                self.browser.close()
            if self.playwright:
                self.playwright.stop()
            logger.info("[BROWSER] Closed successfully.")
        except Exception as e:
            logger.warning(f"Error while closing browser: {e}")

    def random_delay(self, min_sec=2.0, max_sec=4.0):
        time.sleep(random.uniform(min_sec, max_sec))

    def scroll_product_page(self):
        """Scroll down the product page to load reviews, A+ modules, buybox, and specifications"""
        try:
            self.page.evaluate("""
                async () => {
                    const scrollStep = 800;
                    const maxScrolls = 6;
                    for (let i = 0; i < maxScrolls; i++) {
                        window.scrollBy(0, scrollStep);
                        await new Promise(r => setTimeout(r, 250));
                    }
                    window.scrollTo(0, 0);
                }
            """)
        except Exception:
            pass

    def set_location_zipcode(self):
        """Ensure delivery zip/pin code is set for accurate availability"""
        if not self.zip_code:
            return
        try:
            html = self.page.content()
            token_match = re.search(r'id=["\']glowValidationToken["\']\s+value=["\']([^"\']+)["\']', html)
            csrf = token_match.group(1) if token_match else None

            if csrf:
                endpoint = f"{self.base_url}/portal-migration/hz/glow/address-change?actionSource=glow"
                payload = {
                    "locationType": "LOCATION_INPUT",
                    "zipCode": self.zip_code,
                    "deviceType": "web",
                    "pageType": "Detail",
                    "actionSource": "glow"
                }
                self.page.evaluate("""
                    async ({ endpoint, payload, csrf }) => {
                        try {
                            await fetch(endpoint, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                    'anti-csrftoken-a2z': csrf,
                                    'x-requested-with': 'XMLHttpRequest'
                                },
                                body: new URLSearchParams(payload).toString()
                            });
                        } catch(e) { }
                    }
                """, {'endpoint': endpoint, 'payload': payload, 'csrf': csrf})
        except Exception:
            pass

    def crawl_product(self, asin, target_url=None):
        """
        Navigate to a product page, evaluate the JS extraction engine,
        format clean pricing, and save to MongoDB.
        """
        if not target_url:
            target_url = f"{self.base_url}/dp/{asin}"

        logger.info(f"\n[ASIN {asin}] Loading: {target_url}")
        try:
            self.page.goto(target_url, wait_until='domcontentloaded', timeout=60000)
            self.random_delay(1.5, 2.5)
            self.set_location_zipcode()
            self.scroll_product_page()

            # Execute the pure in-browser JavaScript extraction engine
            raw_data = self.page.evaluate(self.extractor_js, {
                "targetAsin": asin,
                "baseUrl": self.base_url
            })

            if not raw_data or not raw_data.get('title'):
                logger.warning(f"[WARN] No product title found for {asin}. Page may be unavailable.")
                return None

            # Standardize pricing data structure
            current_price = raw_data.get('currentPrice')
            mrp = raw_data.get('mrp')

            # Ensure numeric types
            if mrp is None and current_price is not None:
                mrp = current_price
            elif current_price is None and mrp is not None:
                current_price = mrp

            raw_data['price'] = current_price
            raw_data['mrp'] = mrp
            raw_data['currency'] = "INR"

            # Extract authoritative brand name from brandName or specsTable
            extracted_brand = (raw_data.get('brandName') or '').strip()
            if not extracted_brand or extracted_brand.lower() in ('makeup', 'cosmetics', 'brand'):
                specs = raw_data.get('specsTable') or {}
                extracted_brand = specs.get('Brand') or specs.get('Manufacturer') or ''

            raw_data['brand'] = extracted_brand if (extracted_brand and extracted_brand.lower() not in ('makeup', 'cosmetics')) else None
            affiliate_url = f"{self.base_url}/dp/{asin}?tag=makeupkhoj-21"
            raw_data['source_url'] = affiliate_url
            raw_data['url'] = affiliate_url
            raw_data['scraped_at'] = datetime.now(timezone.utc).isoformat()

            # Save to MongoDB
            if self.mongo:
                self.mongo.save_product_detail(raw_data)
                logger.info(f"[SAVED] ASIN: {asin} | {raw_data.get('brand')} | Price: {current_price} | MRP: {mrp} | Title: {raw_data.get('title')[:45]}...")

            return raw_data

        except PlaywrightTimeout:
            logger.error(f"[TIMEOUT] Page timed out for ASIN: {asin}")
            return None
        except Exception as e:
            logger.error(f"[ERROR] Failed to extract ASIN {asin}: {e}")
            return None


def export_products_to_csv(output_file="amazon_makeupkhoj_products_export.csv"):
    """Export the amazon_makeupkhoj collection to CSV"""
    mongo = MongoProductManager()
    cursor = mongo.target_col.find({})
    count = mongo.target_col.count_documents({})
    if count == 0:
        print(f"\n  [INFO] The '{TARGET_COLLECTION}' collection is currently empty.")
        return

    fieldnames = [
        'asin', 'brand', 'title', 'price', 'mrp', 'currency', 'discount',
        'category', 'sub_category', 'sub_sub_category', 'category_path', 'category_name',
        'shade', 'finish', 'formulation', 'coverage', 'skinType', 'spf', 'netQuantity',
        'averageRating', 'ratingsCount', 'boughtInPastMonth', 'inStock', 'stock',
        'sellerName', 'shipsFrom', 'mainImage', 'source_url', 'scraped_at'
    ]

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        exported = 0
        for doc in cursor:
            writer.writerow(doc)
            exported += 1
    print(f"\n  [SUCCESS] Exported {exported} records from '{TARGET_COLLECTION}' to {output_file}\n")


def main():
    parser = argparse.ArgumentParser(description=f"Amazon Makeup Product Data Crawler - Enriches full PDP datasets into '{TARGET_DB}.{TARGET_COLLECTION}'")
    parser.add_argument('--mode', choices=['all', 'pending'], default=None, help="Crawl mode: 'all' to re-crawl entire catalog (update prices, price history, reviews), 'pending' for unscraped products only")
    parser.add_argument('--all', dest='run_all', action='store_true', help="Re-crawl ALL catalog products (check price changes, record price history, update reviews/ratings)")
    parser.add_argument('--pending', dest='run_pending', action='store_true', help="Crawl ONLY pending / unscraped products")
    parser.add_argument('--now', action='store_true', help="Start crawling immediately without interactive prompt")
    parser.add_argument('--force', action='store_true', help="Force re-scraping of all catalog products (alias for --all)")
    parser.add_argument('--limit', type=int, default=0, help="Limit number of ASINs to scrape (0 = all)")
    parser.add_argument('--asin', type=str, help="Scrape a single specific ASIN")
    parser.add_argument('--export-csv', action='store_true', help=f"Export current '{TARGET_COLLECTION}' collection to CSV")
    args = parser.parse_args()

    # Direct CSV export requested
    if args.export_csv:
        export_products_to_csv()
        return

    print("\n" + "=" * 75)
    print(f"      AMAZON MAKEUP PRODUCT DATA CRAWLER (MongoDB: {TARGET_DB}.{TARGET_COLLECTION})")
    print("=" * 75)

    # Initialize MongoDB
    try:
        mongo = MongoProductManager()
        source_count, target_count = mongo.get_counts()
        print(f"  [+] MongoDB Status: Connected to '{mongo.db_name}' database")
        print(f"  [+] Source Collection: '{SOURCE_COLLECTION}' ({source_count} ASINs listed)")
        print(f"  [+] Target Collection: '{TARGET_COLLECTION}' ({target_count} detailed products stored)")
    except Exception as e:
        print(f"\n  [FATAL] Failed to connect to MongoDB: {e}")
        print("  Please check your MONGO_URI in .env file.")
        sys.exit(1)

    # Load JS Extractor Logic
    try:
        extractor_js = get_extractor_js()
    except Exception as e:
        print(f"\n  [FATAL] Could not initialize JS extractor: {e}")
        sys.exit(1)

    # Determine execution mode: 'all' vs 'pending'
    mode = 'pending'
    if args.run_all or args.force or args.mode == 'all':
        mode = 'all'
    elif args.run_pending or args.mode == 'pending':
        mode = 'pending'
    elif not args.now and not args.asin:
        # Interactive mode selection
        print("-" * 75)
        print("  Select Crawling Mode:")
        print("    [1] Crawl PENDING products only (unscraped ASINs) [DEFAULT]")
        print("    [2] Re-crawl ALL catalog products (check price changes, record price history, update reviews)")
        print("    [c] Export current product table to CSV")
        print("    [q] Exit")
        print("-" * 75)
        choice = input("  Select option [Press Enter for 1, or enter 2 for All Catalog]: ").strip().lower()
        if choice == '2':
            mode = 'all'
        elif choice == 'c':
            export_products_to_csv()
            return
        elif choice == 'q':
            print("  Cancelled. Exiting.\n")
            sys.exit(0)
        else:
            mode = 'pending'

    # Determine ASINs to scrape
    if args.asin:
        asins_to_scrape = [{'asin': args.asin.strip(), 'url': f"{DEFAULT_BASE_URL}/dp/{args.asin.strip()}"}]
        print(f"  [+] Single ASIN target: {args.asin.strip()}")
    else:
        asins_to_scrape = mongo.get_asins_to_scrape(mode=mode, force=(mode == 'all'))

    if not asins_to_scrape:
        print(f"\n  [INFO] No products to scrape in '{mode}' mode.")
        print("  Use --all to re-scrape the entire catalog and update price history.\n")
        return

    if args.limit > 0:
        asins_to_scrape = asins_to_scrape[:args.limit]
        print(f"  [+] Limit applied: Processing next {len(asins_to_scrape)} ASINs (Mode: {mode.upper()})")
    else:
        print(f"  [+] Ready to scrape {len(asins_to_scrape)} ASINs (Mode: {mode.upper()})")

    # Start Crawler
    crawler = ProductDetailCrawler(
        base_url=DEFAULT_BASE_URL,
        zip_code=DEFAULT_ZIP_CODE,
        extractor_js=extractor_js,
        mongo_manager=mongo
    )

    if not crawler.start_browser():
        print("  [ERROR] Could not start browser. Exiting.")
        sys.exit(1)

    start_time = time.time()
    success_count = 0
    total = len(asins_to_scrape)

    try:
        for idx, item in enumerate(asins_to_scrape, 1):
            asin = item.get('asin')
            target_url = item.get('url') or f"{DEFAULT_BASE_URL}/dp/{asin}"

            logger.info(f"\n{'='*70}")
            logger.info(f"[{idx}/{total}] Processing ASIN: {asin}")
            logger.info(f"{'='*70}")

            result = crawler.crawl_product(asin, target_url=target_url)
            if result:
                success_count += 1

            # Polite delay between product pages to prevent rate limits
            if idx < total:
                crawler.random_delay(2.5, 4.5)

    except KeyboardInterrupt:
        print("\n\n  [!] Crawling paused/interrupted by user. All scraped records are safely stored in MongoDB.")
    finally:
        crawler.close_browser()

    elapsed = time.time() - start_time
    _, final_target_count = mongo.get_counts()

    print("\n" + "=" * 75)
    print("                     EXTRACTION SUMMARY")
    print("=" * 75)
    print(f"  ASINs Processed:         {len(asins_to_scrape)}")
    print(f"  Successfully Extracted:  {success_count}")
    print(f"  Total in MongoDB Table:  {final_target_count} records in '{TARGET_COLLECTION}'")
    print(f"  Time Elapsed:            {elapsed / 60:.1f} minutes")
    print("=" * 75 + "\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[!] Exit.")
        sys.exit(0)
