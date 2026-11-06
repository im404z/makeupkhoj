#!/usr/bin/env python3
"""
Amazon Makeup Crawler - Self-Contained Crawler for MongoDB
Crawls Amazon makeup category URLs and stores all products into the single 'amazon_makeupkhoj' MongoDB collection.
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
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from bs4 import BeautifulSoup
from pymongo import MongoClient, UpdateOne
from pymongo.errors import ServerSelectionTimeoutError
from dotenv import load_dotenv

# Load environment variables (from local and root project .env)
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

# Force UTF-8 encoding on Windows console
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

# Setup logging
os.makedirs('logs', exist_ok=True)
_file_handler = logging.FileHandler('logs/amazon_makeup_crawler.log', encoding='utf-8')
_file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))

_stream_handler = logging.StreamHandler(sys.stdout)
_stream_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))

logging.basicConfig(
    level=logging.INFO,
    handlers=[_file_handler, _stream_handler]
)
logger = logging.getLogger("amazon-makeup-crawler")

# Import MakeupKhoj DB config and Category Mapper
_crawler_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _crawler_root not in sys.path:
    sys.path.insert(0, _crawler_root)

from db_config import get_db, COLLECTIONS, DB_NAME, DEFAULT_MONGO_URI, validate_db_safety
from category_mapper import get_marketplace_urls, lookup_category_by_url

# Target MongoDB Database & Collection (Isolated for MakeupKhoj)
TARGET_DB = DB_NAME  # 'makeupkhoj'
TARGET_COLLECTION = COLLECTIONS['amazon']  # 'amazon_makeupkhoj'

# Amazon Site Configurations
AMAZON_SITES = {
    'amazon.in': {'currency': 'INR', 'locale': 'en-IN', 'zip_code': '110037'},
    'amazon.com': {'currency': 'USD', 'locale': 'en-US', 'zip_code': '08609'},
    'amazon.ae': {'currency': 'AED', 'locale': 'en-AE', 'zip_code': None},
    'amazon.co.uk': {'currency': 'GBP', 'locale': 'en-GB', 'zip_code': None},
}


class MongoMakeupManager:
    """Handles MongoDB connection and batch upserts to amazon_makeupkhoj collection in makeupkhoj DB"""

    def __init__(self, mongo_uri=None, db_name=None, collection_name=None):
        self.mongo_uri = mongo_uri or DEFAULT_MONGO_URI
        self.db_name = db_name or TARGET_DB
        self.collection_name = collection_name or TARGET_COLLECTION
        validate_db_safety(self.db_name)
        self.client = None
        self.db = None
        self.collection = None
        self._connect()

    def _connect(self):
        try:
            logger.info(f"[MONGO] Connecting to {self.db_name}.{self.collection_name}...")
            self.client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=6000)
            self.client.admin.command('ping')
            self.db = self.client[self.db_name]
            self.collection = self.db[self.collection_name]

            # Ensure indexes on ASIN, brand, category paths
            self.collection.create_index('asin', unique=True)
            self.collection.create_index('brand', unique=False)
            self.collection.create_index('category_path', unique=False)
            self.collection.create_index('sub_category', unique=False)
            self.collection.create_index('sub_sub_category', unique=False)
            self.collection.create_index('extracted_at', unique=False)
            logger.info(f"[MONGO OK] Connected! Index on 'asin' verified for '{self.db_name}.{self.collection_name}'.")
        except ServerSelectionTimeoutError as e:
            logger.error(f"[MONGO ERROR] Cannot connect to MongoDB: {e}")
            raise

    def save_products(self, products):
        """Batch upsert products into amazon_makeupkhoj collection by ASIN with Price Shift Tracking"""
        if not products:
            return 0, 0, 0

        # Pre-fetch existing documents to detect price shifts
        asins = [p.get('asin') for p in products if p.get('asin')]
        existing_map = {}
        try:
            for doc in self.collection.find(
                {'asin': {'$in': asins}},
                {'asin': 1, 'price': 1, 'mrp': 1, 'price_history': 1, 'lowest_recorded_price': 1, 'highest_recorded_price': 1}
            ):
                existing_map[doc['asin']] = doc
        except Exception as fetch_err:
            logger.warning(f"[MONGO] Could not pre-fetch existing records for price history: {fetch_err}")

        # Master products collection in makeupkhoj
        sk_products_col = None
        try:
            sk_products_col = self.db['products']
        except Exception:
            pass

        now_iso = datetime.now(timezone.utc).isoformat()
        today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        operations = []

        for p in products:
            asin = p.get('asin')
            if not asin:
                continue

            new_price = p.get('price')
            new_mrp = p.get('mrp') or new_price
            set_fields = dict(p)
            set_fields['price_last_checked'] = now_iso
            set_fields['updated_at'] = now_iso

            set_on_insert = {}
            if not set_fields.get('brand'):
                # Don't overwrite an existing verified brand on update; set on insert only
                brand_val = set_fields.pop('brand', None)
                brand_src = set_fields.pop('brand_source', None)
                set_on_insert['brand'] = brand_val
                set_on_insert['brand_source'] = brand_src

            # Check for price changes
            price_changed = False
            diff = 0
            old_price = None
            existing = existing_map.get(asin)

            if existing and existing.get('price') is not None and new_price is not None:
                try:
                    old_price = float(existing.get('price'))
                    new_val = float(new_price)
                    diff = round(new_val - old_price)
                    if abs(diff) >= 1:
                        price_changed = True
                except (ValueError, TypeError):
                    pass

            history_entry = None
            if price_changed and old_price is not None and new_price is not None:
                if diff < 0:
                    logger.info(f"  [PRICE DROP] Amazon ASIN {asin} '{p.get('title', '')[:40]}...': ₹{old_price:g} -> ₹{float(new_price):g} (Save ₹{abs(diff)})")
                else:
                    logger.info(f"  [PRICE HIKE] Amazon ASIN {asin} '{p.get('title', '')[:40]}...': ₹{old_price:g} -> ₹{float(new_price):g} (+₹{diff})")

                history_entry = {
                    'date': today_str,
                    'timestamp': now_iso,
                    'price': float(new_price),
                    'old_price': float(old_price),
                    'mrp': float(new_mrp) if new_mrp else float(new_price),
                    'change': diff,
                    'marketplace': 'amazon'
                }

            update_doc = {'$set': set_fields}
            if set_on_insert:
                update_doc['$setOnInsert'] = set_on_insert

            if price_changed and history_entry:
                update_doc['$push'] = {
                    'price_history': {
                        '$each': [history_entry],
                        '$slice': -20
                    }
                }
                update_doc['$min'] = {'lowest_recorded_price': float(new_price)}
                if new_mrp:
                    update_doc['$max'] = {'highest_recorded_price': float(new_mrp)}

            operations.append(
                UpdateOne(
                    {'asin': asin},
                    update_doc,
                    upsert=True
                )
            )

            # Live synchronization to scentkhoj.products for existing mapped SKUs
            if sk_products_col is not None:
                try:
                    sk_set = {
                        'price': float(new_price) if new_price else None,
                        'lowest_price': float(new_price) if new_price else None,
                        'mappings.amazon.price': float(new_price) if new_price else None,
                        'mappings.amazon.mrp': float(new_mrp) if new_mrp else None,
                        'price_last_checked': now_iso,
                        'updated_at': now_iso
                    }
                    if p.get('rating') and p.get('rating') != 'N/A':
                        try:
                            sk_set['mappings.amazon.rating'] = float(p.get('rating'))
                        except (ValueError, TypeError):
                            pass
                    if p.get('reviews_count') and p.get('reviews_count') != 'N/A':
                        clean_rev = re.sub(r'[^\d]', '', str(p.get('reviews_count')))
                        if clean_rev:
                            sk_set['mappings.amazon.rating_count'] = int(clean_rev)
                    if p.get('url'):
                        sk_set['mappings.amazon.url'] = p.get('url')
                    if p.get('image') and p.get('image') != 'N/A':
                        sk_set['mappings.amazon.image'] = p.get('image')

                    sk_update = {'$set': sk_set}
                    if price_changed and history_entry:
                        sk_update['$push'] = {'price_history': {'$each': [history_entry], '$slice': -20}}
                        if new_price:
                            sk_update['$min'] = {'lowest_recorded_price': float(new_price)}

                    sk_products_col.update_many({'mappings.amazon.asin': asin}, sk_update)
                except Exception as sk_err:
                    logger.debug(f"[SK-SYNC] Notice for ASIN {asin}: {sk_err}")

        if not operations:
            return 0, 0, 0

        try:
            result = self.collection.bulk_write(operations, ordered=False)
            upserted = result.upserted_count
            modified = result.modified_count
            matched = result.matched_count
            logger.info(f"[MONGO SAVED] {len(operations)} records processed -> {upserted} inserted new, {modified} updated ({matched} matched)")
            return upserted, modified, matched
        except Exception as e:
            logger.error(f"[MONGO ERROR] Error writing to {self.collection_name}: {e}")
            return 0, 0, 0

    def get_total_count(self):
        """Return total documents in collection"""
        try:
            return self.collection.count_documents({})
        except Exception:
            return 0

    def get_known_brands(self):
        """Fetch all reference brand names from makeupkhoj.brands and nykaa_makeupkhoj"""
        brands = set()
        try:
            mk_db = self.client[self.db_name]
            if 'brands' in mk_db.list_collection_names():
                for b in mk_db['brands'].find({}, {'name': 1}):
                    if b.get('name'):
                        brands.add(b['name'].strip())
            if 'nykaa_makeupkhoj' in mk_db.list_collection_names():
                for pb in mk_db['nykaa_makeupkhoj'].distinct('brand'):
                    if pb and isinstance(pb, str) and pb.strip():
                        brands.add(pb.strip())
            logger.info(f"[BRANDS] Loaded {len(brands)} reference brands from {self.db_name}")
            return list(brands)
        except Exception as e:
            logger.warning(f"Could not load brands from {self.db_name}: {e}")
            return []



# Curated famous Indian and international makeup brands popular in India
FAMOUS_INDIAN_AND_GLOBAL_BRANDS = [
    # Top Indian & D2C Brands:
    "Lakme", "Lakmé", "Sugar Cosmetics", "SUGAR", "Insight Cosmetics", "Insight",
    "Swiss Beauty", "Colorbar", "Blue Heaven", "Mamaearth", "MyGlamm",
    "Renee Cosmetics", "Renee", "RENEE", "Plum", "Just Herbs", "Disguise Cosmetics",
    "MARS", "MARS Cosmetics", "PAC", "PAC Cosmetics", "Daily Life Forever52", "Forever52",
    "Kay Beauty", "Nykaa Cosmetics", "Nykaa", "Elle 18", "Biotique",
    "Faces Canada", "Faces", "Chambor", "Lotus Herbals", "Lotus Make-Up",
    "Coloressence", "Dazller", "Miss Claire", "Recode", "Recode Studios",
    # Global Drugstore & Mass:
    "Maybelline New York", "Maybelline", "L'Oreal Paris", "L'Oréal Paris", "L'Oreal", "L'Oréal",
    "NYX Professional Makeup", "NYX", "e.l.f. Cosmetics", "e.l.f.", "ELF",
    "Wet n Wild", "Wet N Wild", "Milani", "Essence", "Catrice", "Kiko Milano", "Kiko",
    "Rimmel London", "Rimmel", "Revlon", "Covergirl", "Bourjois",
    "Makeup Revolution", "Revolution Beauty", "Revolution", "I Heart Revolution",
    # Prestigious & Luxury:
    "M.A.C", "MAC", "MAC Cosmetics", "Estee Lauder", "Estée Lauder", "Clinique", "Bobbi Brown",
    "Smashbox", "NARS", "Benefit Cosmetics", "Benefit", "Too Faced", "Urban Decay",
    "Huda Beauty", "Fenty Beauty", "Rare Beauty", "Charlotte Tilbury", "Anastasia Beverly Hills", "ABH",
    "Laura Mercier", "Tarte", "KVD Beauty", "Kat Von D", "Morphe", "Sigma Beauty", "Sigma",
    "Dior", "Christian Dior", "Chanel", "Yves Saint Laurent", "YSL", "Giorgio Armani", "Armani Beauty",
    "Givenchy", "Guerlain", "Tom Ford", "Shiseido", "Lancome", "Lancôme", "Clarins"
]

CANONICAL_BRAND_MAP = {
    "lakme": "Lakmé",
    "sugar": "SUGAR Cosmetics",
    "sugar cosmetics": "SUGAR Cosmetics",
    "l'oreal": "L'Oréal Paris",
    "l'oreal paris": "L'Oréal Paris",
    "maybelline": "Maybelline New York",
    "maybelline new york": "Maybelline New York",
    "nyx": "NYX Professional Makeup",
    "nyx professional makeup": "NYX Professional Makeup",
    "elf": "e.l.f. Cosmetics",
    "e.l.f.": "e.l.f. Cosmetics",
    "e.l.f. cosmetics": "e.l.f. Cosmetics",
    "mac": "M.A.C",
    "m.a.c": "M.A.C",
    "mac cosmetics": "M.A.C",
    "renee": "Renee",
    "renee cosmetics": "Renee",
    "charlotte tilbury": "Charlotte Tilbury",
    "makeup revolution": "Makeup Revolution",
    "swiss beauty": "Swiss Beauty",
    "insight": "Insight Cosmetics",
    "insight cosmetics": "Insight Cosmetics",
    "kay beauty": "Kay Beauty",
    "faces canada": "Faces Canada",
    "pac": "PAC",
    "pac cosmetics": "PAC",
    "mars": "MARS",
    "mars cosmetics": "MARS",
    "forever52": "Daily Life Forever52",
    "daily life forever52": "Daily Life Forever52",
}


class AmazonMakeupCrawler:
    """Headless Playwright Crawler designed specifically to crawl Amazon makeup listings"""

    def __init__(self, base_url="https://www.amazon.in", zip_code="110037", mongo_manager=None):
        self.base_url = base_url
        self.zip_code = zip_code
        self.mongo = mongo_manager
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None

        parsed = urlparse(base_url)
        self.domain = parsed.netloc.replace('www.', '')
        site_cfg = AMAZON_SITES.get(self.domain, {'currency': 'INR', 'locale': 'en-IN', 'zip_code': '110037'})
        self.currency = site_cfg['currency']
        self.locale = site_cfg['locale']
        if not self.zip_code:
            self.zip_code = site_cfg.get('zip_code')

        # Load reference brands from central crawler/brands.json, DB, and dictionary
        file_brands = []
        for json_path in [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'brands.json'),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), 'brands.json'),
            'crawler/brands.json',
            'server/brand.json'
        ]:
            if os.path.isfile(json_path):
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        b_data = json.load(f)
                    for item in b_data:
                        if isinstance(item, dict):
                            name = item.get('brand') or item.get('name')
                            if name:
                                file_brands.append(name.strip())
                        elif isinstance(item, str) and item.strip():
                            file_brands.append(item.strip())
                    logger.info(f"[BRANDS] Loaded {len(file_brands)} brands from {os.path.basename(json_path)}")
                    break
                except Exception as e:
                    logger.warning(f"Error loading {json_path}: {e}")

        db_brands = self.mongo.get_known_brands() if self.mongo else []
        combined_brands = set(file_brands) | set(db_brands) | set(FAMOUS_INDIAN_AND_GLOBAL_BRANDS)
        self.sorted_brands = sorted(list(combined_brands), key=lambda x: len(x), reverse=True)
        logger.info(f"[MATCHER READY] Brand Matcher initialized with {len(self.sorted_brands)} reference brands.")

    def start_browser(self):
        """Start Playwright Chromium browser instance"""
        try:
            logger.info(f"[BROWSER] Starting browser for {self.domain}...")
            self.playwright = sync_playwright().start()
            self.browser = self.playwright.chromium.launch(
                headless=True,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            )
            self.context = self.browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale=self.locale
            )

            # Set currency preference cookie
            try:
                self.context.add_cookies([{
                    'name': 'i18n-prefs',
                    'value': self.currency,
                    'domain': f'.{self.domain}',
                    'path': '/'
                }])
            except Exception:
                pass

            self.page = self.context.new_page()
            logger.info("[BROWSER OK] Headless browser started successfully.")
            return True
        except Exception as e:
            logger.error(f"[BROWSER ERROR] Failed to start browser: {e}")
            return False

    def close_browser(self):
        """Close browser resources cleanly"""
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

    @staticmethod
    def _parse_number(val):
        """Clean and extract integer/float from price string"""
        if not val or val == 'N/A':
            return None
        clean = re.sub(r'[^\d.]', '', str(val))
        try:
            num = float(clean)
            return int(num) if num.is_integer() else num
        except ValueError:
            return None

    def random_delay(self, min_sec=1.5, max_sec=3.0):
        time.sleep(random.uniform(min_sec, max_sec))

    def scroll_page(self):
        """Scroll down to trigger dynamic lazy-loading of product items"""
        try:
            heights = []
            for _ in range(15):
                self.page.evaluate('window.scrollBy(0, 700)')
                time.sleep(0.3)
                curr = self.page.evaluate('document.body.scrollHeight')
                heights.append(curr)
                if len(heights) >= 3 and heights[-1] == heights[-2] == heights[-3]:
                    break
        except Exception:
            pass

    def set_location_zipcode(self):
        """Ensure delivery zip/pin code is set for accurate availability"""
        if not self.zip_code:
            return
        try:
            # Check if already set
            try:
                line2 = self.page.locator('#glow-ingress-line2').text_content(timeout=2500)
                if line2 and self.zip_code in line2:
                    return
            except Exception:
                pass

            # Fast POST API update
            html = self.page.content()
            soup = BeautifulSoup(html, 'html.parser')
            token_input = soup.find('input', {'id': 'glowValidationToken'})
            csrf = token_input.get('value') if token_input else None

            if csrf:
                endpoint = f"{self.base_url}/portal-migration/hz/glow/address-change?actionSource=glow"
                payload = {
                    "locationType": "LOCATION_INPUT",
                    "zipCode": self.zip_code,
                    "deviceType": "web",
                    "pageType": "Search",
                    "actionSource": "glow"
                }
                res = self.page.evaluate("""
                    async ({ endpoint, payload, csrf }) => {
                        try {
                            const resp = await fetch(endpoint, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                    'anti-csrftoken-a2z': csrf,
                                    'x-requested-with': 'XMLHttpRequest'
                                },
                                body: new URLSearchParams(payload).toString()
                            });
                            return await resp.json();
                        } catch(e) { return null; }
                    }
                """, {'endpoint': endpoint, 'payload': payload, 'csrf': csrf})
                if res and (res.get('successful') == 1 or res.get('isAddressUpdated') == 1):
                    logger.info(f"[LOCATION OK] Pincode {self.zip_code} updated via API")
        except Exception:
            pass


    def is_mixed_category_url(self, url, detected_brand):
        """Check if target URL is a mixed-category / broad search rather than a single-brand facet"""
        # If url explicitly targets a category node
        if 'rh=n%3a' in url.lower() or 'rh=n:' in url.lower() or 'node=' in url.lower() or 'bbn=' in url.lower():
            return True
        # If URL does not have brand facet parameter (p_123 or p_89)
        if 'rh=p_123' not in url.lower() and 'rh=p_89' not in url.lower():
            generic = {
                'makeup', 'cosmetics', 'beauty', 'all departments', 'all categories',
                'foundation', 'lipstick', 'mascara', 'eyeliner', 'blush', 'compact',
                'eyeshadow', 'concealer', 'primer', 'nail polish'
            }
            if not detected_brand or detected_brand.lower() in generic:
                return True
        return False

    def detect_brand_from_title(self, title, container=None):
        """Extract brand name directly from listing card or product title"""
        # 1. Check if Amazon provides brand subheader line in the card
        if container:
            brand_header = container.select_one('h5.s-line-clamp-1, span.a-size-base-plus.a-color-base')
            if brand_header:
                txt = brand_header.get_text(strip=True)
                if txt and len(txt) < 40 and not any(g in txt.lower() for g in ('makeup', 'cosmetics', 'sponsored', 'deal', 'bought')):
                    for b in self.sorted_brands:
                        if b.lower() == txt.lower() or (len(b) >= 4 and b.lower() in txt.lower()):
                            return CANONICAL_BRAND_MAP.get(b.lower(), b), 'card_header'

        if not title or title == 'N/A':
            return None, 'pending_pdp'

        # 2. Clean title from Amazon listing badges/prefixes
        cleaned = re.sub(
            r'^(sponsored\s*ad\s*[-:]?\s*|sponsored\s*[-:]?\s*|deal\s+of\s+the\s+day\s*[-:]?\s*|buy\s+)',
            '',
            title,
            flags=re.I
        ).strip()

        # 3. Check if cleaned title starts with a known brand
        for b in self.sorted_brands:
            pattern = r'^' + re.escape(b) + r'(?:|[\s,:|(\-])'
            if re.search(pattern, cleaned, flags=re.I):
                canonical = CANONICAL_BRAND_MAP.get(b.lower(), b)
                return canonical, 'title_extracted'

        # 4. Check if brand is anywhere in title with word boundaries
        for b in self.sorted_brands:
            if len(b) < 4:
                continue
            pattern = r'\b' + re.escape(b) + r'\b'
            if re.search(pattern, cleaned, flags=re.I):
                canonical = CANONICAL_BRAND_MAP.get(b.lower(), b)
                return canonical, 'title_extracted'

        return None, 'pending_pdp'

    def detect_brand_or_category(self, html, url):
        """Auto-detect brand name or category from page HTML"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            ignored = {"all departments", "all", "search in", "all categories", "aps", "makeup", "cosmetics", "beauty"}

            # 1. Refinements summary: "Selected filters: Lakmé"
            ref_summary = soup.find('div', {'id': 's-refinements-a11y-summary'})
            if ref_summary:
                txt = ref_summary.get_text(strip=True)
                if 'selected filters:' in txt.lower():
                    name = txt.split(':', 1)[1].strip()
                    if name and name.lower() not in ignored:
                        return name

            # 2. Selected Brand refinement checkbox in brandsRefinements
            brands_div = soup.find('div', {'id': re.compile(r'brand', re.I)})
            if brands_div:
                selected_item = brands_div.select_one('li.a-checkbox-fancy input[checked], li a.s-navigation-item span.a-text-bold')
                if selected_item:
                    name = selected_item.get_text(strip=True)
                    if name and name.lower() not in ignored:
                        return name

            # 3. Look in departments or filter-n bold text
            dept_bold = soup.select_one('div#departments span.a-text-bold, ul#filter-n span.a-text-bold')
            if dept_bold:
                name = dept_bold.get_text(strip=True)
                if name and name.lower() not in ignored and len(name) < 40:
                    return name

            # 4. Search query state
            query_span = soup.select_one('span.a-color-state.a-text-bold')
            if query_span:
                name = query_span.get_text(strip=True).strip('"\'')
                if name and name.lower() not in ignored and len(name) < 40:
                    return name

            # 5. Page Title: "Amazon.in: Brand Name : Makeup"
            title_elem = soup.find('title')
            if title_elem:
                title_text = title_elem.get_text(strip=True)
                parts = [p.strip() for p in title_text.split(':') if p.strip()]
                for part in parts:
                    if 'amazon' not in part.lower() and part.lower() not in ignored:
                        return part

            # Fallback: check query parameter
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            if 'k' in params and params['k'][0]:
                return params['k'][0].replace('+', ' ').title()
        except Exception as e:
            logger.warning(f"Brand detection warning: {e}")

        return "Makeup"

    def extract_search_metadata(self, html):
        """Extract total results count and total pages"""
        total_results = "N/A"
        total_pages = 1
        try:
            soup = BeautifulSoup(html, 'html.parser')
            # Results count text
            for elem in soup.select('div[data-component-type="s-result-info-bar"], span.a-text-normal, h2.a-size-base'):
                txt = elem.get_text(separator=' ', strip=True)
                if 'result' in txt.lower() and ('of' in txt.lower() or 'over' in txt.lower()):
                    total_results = re.sub(r'\s+', ' ', txt)
                    break

            # Total pages
            pagination = soup.find('div', {'aria-label': 'pagination'}) or soup.select_one('.s-pagination-container, .s-pagination-strip')
            page_numbers = []
            if pagination:
                for item in pagination.select('.s-pagination-item, li span, li a, a.s-pagination-button'):
                    txt = item.get_text(strip=True)
                    if txt.isdigit():
                        page_numbers.append(int(txt))
            if page_numbers:
                total_pages = max(page_numbers)
        except Exception:
            pass

        return total_results, total_pages

    def extract_products(self, html, current_url, brand_name, is_mixed=False, category_meta=None):
        """Extract all product cards from page HTML with multiple selector fallbacks"""
        soup = BeautifulSoup(html, 'html.parser')
        products = []
        seen_asins = set()

        # Try various container selectors used by Amazon search result layouts
        containers = soup.select('div[data-csa-c-type="item"][data-csa-c-item-id^="amzn1.asin"]')
        if not containers:
            containers = soup.select('div[cel_widget_id*="SEARCH_RESULTS"][data-csa-c-item-id^="amzn1.asin"]')
        if not containers:
            containers = soup.select('div.s-result-item[data-asin]')
            containers = [c for c in containers if c.get('data-asin')]
        if not containers:
            containers = soup.select('div.puis-card-container, div[data-component-type="s-search-result"]')

        for container in containers:
            try:
                # 1. ASIN
                asin = container.get('data-asin', '').strip()
                if not asin:
                    csa_id = container.get('data-csa-c-item-id', '')
                    if csa_id:
                        parts = csa_id.split('.')
                        asin = next((p for p in parts if p and len(p) == 10 and (p.startswith('B') or p.startswith('A'))), '')
                if not asin:
                    # Search inside links
                    dp_link = container.select_one('a[href*="/dp/"]')
                    if dp_link:
                        m = re.search(r'/dp/([A-Z0-9]{10})', dp_link['href'])
                        if m:
                            asin = m.group(1)

                if not asin or asin in seen_asins:
                    continue
                seen_asins.add(asin)

                # 2. Title
                title = 'N/A'
                h2 = container.select_one('h2')
                if h2:
                    if h2.get('aria-label'):
                        title = h2.get('aria-label')
                    else:
                        span = h2.select_one('span')
                        title = span.get_text(strip=True) if span else h2.get_text(strip=True)
                if title == 'N/A':
                    link = container.select_one('a.a-link-normal span.a-text-normal')
                    if link:
                        title = link.get_text(strip=True)

                # 3. Product URL with Affiliate Tag
                product_url = f"{self.base_url}/dp/{asin}?tag=scentkhoj-21"
                dp = container.select_one('a[href*="/dp/"]')
                if dp:
                    href = dp.get('href', '')
                    if href and not href.startswith('#'):
                        raw_url = self.base_url + href if href.startswith('/') else href
                        if 'tag=' in raw_url:
                            product_url = re.sub(r'tag=[^&]+', 'tag=scentkhoj-21', raw_url)
                        else:
                            sep = '&' if '?' in raw_url else '?'
                            product_url = f"{raw_url}{sep}tag=scentkhoj-21"

                # 4. Pricing (Selling Price & Strike-through MRP)
                price = None
                selling_span = container.select_one('span.a-price:not(.a-text-price) span.a-offscreen') or container.select_one('span.a-price:not(.a-text-price)')
                if selling_span:
                    price = self._parse_number(selling_span.get_text(strip=True))

                mrp = None
                # Check for explicit M.R.P. or List Price text
                for t in container.find_all(string=re.compile(r'M\.?R\.?P|List Price|was:', re.I)):
                    parent = t.parent
                    off = parent.find_next('span', class_='a-offscreen')
                    if off:
                        parsed = self._parse_number(off.get_text(strip=True))
                        if parsed and (price is None or parsed >= price):
                            mrp = parsed
                            break
                    m = re.search(r'[₹$€£]?\s*([\d,]+(?:\.\d+)?)', t)
                    if m:
                        parsed = self._parse_number(m.group(1))
                        if parsed and (price is None or parsed >= price):
                            mrp = parsed
                            break

                # Fallback for MRP: strike-through price span
                if mrp is None:
                    for strike in container.select('span.a-price.a-text-price, span[data-a-strike="true"]'):
                        parent_text = strike.parent.get_text(strip=True) if strike.parent else ''
                        if '/' in parent_text or 'per' in parent_text.lower():
                            continue
                        off = strike.select_one('span.a-offscreen') or strike
                        parsed = self._parse_number(off.get_text(strip=True))
                        if parsed and (price is None or parsed >= price):
                            mrp = parsed
                            break

                # Fallbacks if only one is present
                if mrp is None and price is not None:
                    mrp = price
                elif price is None and mrp is not None:
                    price = mrp

                # 5. Rating
                rating = 'N/A'
                rating_elem = container.select_one('i.a-icon-star-mini span, i[data-cy="reviews-ratings-slot"] span, span[aria-label*="stars"]')
                if rating_elem:
                    rating_text = rating_elem.get_text(strip=True) or rating_elem.get('aria-label', '')
                    parts = rating_text.split()
                    if parts and parts[0].replace('.', '').isdigit():
                        rating = parts[0]

                # 6. Reviews Count
                reviews_count = 'N/A'
                for link_el in container.select('a'):
                    txt = link_el.get_text(strip=True)
                    if txt.startswith('(') and txt.endswith(')'):
                        inner = txt.strip('()')
                        if any(c.isdigit() for c in inner):
                            reviews_count = txt
                            break

                # 7. Bought in past month
                bought = 'N/A'
                for span in container.select('span.a-color-secondary'):
                    txt = span.get_text(strip=True)
                    if 'bought' in txt.lower() and 'past month' in txt.lower():
                        bought = txt
                        break

                # 8. Badge (Best Seller / Amazon's Choice)
                badge = 'N/A'
                badge_elem = container.select_one('span.a-badge-text, span.a-size-small.a-color-inverse')
                if badge_elem:
                    badge = badge_elem.get_text(strip=True)

                # 9. Thumbnail Image
                image_url = 'N/A'
                img = container.select_one('img.s-image, img[data-image-load], img')
                if img:
                    image_url = img.get('src') or img.get('data-src') or 'N/A'

                if title == 'N/A' and price is None:
                    continue

                if is_mixed:
                    prod_brand, brand_source = self.detect_brand_from_title(title, container)
                else:
                    prod_brand = brand_name
                    brand_source = 'facet_url'

                cat = category_meta or {}
                category = cat.get('category', 'Makeup')
                sub_category = cat.get('sub_category', 'General')
                sub_sub_category = cat.get('sub_sub_category', cat.get('category_name', 'Makeup'))
                category_path = cat.get('category_path', f"Makeup > {sub_category} > {sub_sub_category}")
                category_name = cat.get('category_name', sub_sub_category)

                products.append({
                    'asin': asin,
                    'id': asin,
                    'title': title,
                    'name': title,
                    'brand': prod_brand,
                    'brand_source': brand_source,
                    'mrp': mrp,
                    'price': price,
                    'currency': self.currency,
                    'rating': rating,
                    'reviews_count': reviews_count,
                    'bought_in_past_month': bought,
                    'badge': badge,
                    'url': product_url,
                    'image': image_url,
                    'images': [image_url] if image_url and image_url != 'N/A' else [],
                    'category': category,
                    'sub_category': sub_category,
                    'sub_sub_category': sub_sub_category,
                    'category_path': category_path,
                    'category_name': category_name,
                    'category_url': current_url,
                    'marketplace': 'amazon',
                    'marketplace_name': 'Amazon',
                    'extracted_at': datetime.now(timezone.utc).isoformat()
                })
            except Exception:
                continue

        return products

    def crawl_url(self, target_url, url_index=1, total_urls=1, max_pages_per_url=0, category_meta=None):
        """
        Crawl an Amazon URL across all pages and save directly to MongoDB amazon_makeupkhoj
        max_pages_per_url: 0 for all pages, or positive integer to limit pages
        """
        logger.info(f"\n{'='*70}")
        logger.info(f"[URL {url_index}/{total_urls}] Starting Crawl: {target_url}")
        logger.info(f"{'='*70}")

        # Load page 1
        try:
            self.page.goto(target_url, wait_until='domcontentloaded', timeout=60000)
            self.random_delay(1.5, 3.0)
            self.set_location_zipcode()
        except PlaywrightTimeout:
            logger.error(f"[TIMEOUT] Page 1 took too long to load for: {target_url}")
            return 0

        self.scroll_page()
        page1_html = self.page.content()

        # Auto-detect brand name, url mode, and search stats
        brand_name = self.detect_brand_or_category(page1_html, target_url)
        is_mixed = self.is_mixed_category_url(target_url, brand_name)
        total_results, total_pages = self.extract_search_metadata(page1_html)

        mode_str = "MIXED CATEGORY (Title Brand Detection Enabled)" if is_mixed else f"SINGLE BRAND ('{brand_name}')"
        logger.info(f"[MODE] {mode_str} | Total Results: {total_results} | Total Pages: {total_pages}")

        current_url = target_url
        page_num = 1
        total_brand_products = 0

        while current_url:
            if max_pages_per_url > 0 and page_num > max_pages_per_url:
                logger.info(f"[LIMIT] Reached max page limit ({max_pages_per_url}) for {brand_name}.")
                break

            try:
                logger.info(f"[{brand_name}] Loading Page {page_num}...")
                if page_num > 1:
                    try:
                        self.page.goto(current_url, wait_until='domcontentloaded', timeout=60000)
                        self.random_delay(2.0, 3.5)
                        self.scroll_page()
                    except PlaywrightTimeout:
                        logger.error(f"[TIMEOUT] Failed to load Page {page_num} for {brand_name}")
                        break

                html = self.page.content()
                page_products = self.extract_products(html, current_url, brand_name, is_mixed=is_mixed, category_meta=category_meta)
                logger.info(f"[{brand_name} - Page {page_num}] Extracted {len(page_products)} products.")

                if not page_products or len(page_products) == 0:
                    logger.info(f"[{brand_name} - Page {page_num}] 0 product cards found. Reached end of catalog for this brand.")
                    break

                # Save directly into MongoDB amazon_makeupkhoj in real time!
                if page_products and self.mongo:
                    for p in page_products:
                        p['page'] = page_num
                    self.mongo.save_products(page_products)

                total_brand_products += len(page_products)

                # Look for Next Page
                soup = BeautifulSoup(html, 'html.parser')
                pagination = soup.find('div', {'aria-label': 'pagination'}) or soup.select_one('.s-pagination-container, .s-pagination-strip')
                next_href = None
                if pagination:
                    next_btn = pagination.select_one('a.s-pagination-next:not(.s-pagination-disabled), a[aria-label*="next"]:not([aria-disabled="true"])')
                    if next_btn and next_btn.get('href'):
                        next_href = next_btn['href']

                # Fallback to li.a-last a
                if not next_href:
                    next_li = soup.select_one('li.a-last a')
                    if next_li and next_li.get('href'):
                        next_href = next_li['href']

                if next_href:
                    current_url = self.base_url + next_href if next_href.startswith('/') else next_href
                    page_num += 1
                    self.random_delay(2.0, 4.0)
                else:
                    logger.info(f"[{brand_name}] No further next page link found. Finished crawling brand.")
                    current_url = None

            except Exception as e:
                logger.error(f"[ERROR] Error on page {page_num} of {brand_name}: {e}")
                break

        logger.info(f"[BRAND COMPLETE] {brand_name}: {total_brand_products} products collected and saved to '{TARGET_COLLECTION}'.")
        return total_brand_products


def export_collection_to_csv(output_file="amazon_makeupkhoj_export.csv"):
    """Utility to export the entire amazon_makeupkhoj collection to CSV"""
    mongo = MongoMakeupManager()
    cursor = mongo.collection.find({})
    count = mongo.get_total_count()
    if count == 0:
        print(f"\n  [INFO] The '{TARGET_COLLECTION}' collection is currently empty.")
        return

    fieldnames = ['asin', 'brand', 'title', 'mrp', 'price', 'currency', 'rating', 'reviews_count', 'bought_in_past_month', 'badge', 'url', 'image', 'category', 'sub_category', 'sub_sub_category', 'category_path', 'category_name', 'category_url', 'extracted_at']
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        exported = 0
        for doc in cursor:
            writer.writerow(doc)
            exported += 1
    print(f"\n  [SUCCESS] Exported {exported} records from '{TARGET_COLLECTION}' to {output_file}\n")


def main():
    parser = argparse.ArgumentParser(description=f"Amazon Makeup Crawler - Saves to MongoDB collection '{TARGET_COLLECTION}' in '{TARGET_DB}' DB")
    parser.add_argument('--now', action='store_true', help="Start crawling all URLs immediately without prompt")
    parser.add_argument('--max-pages', type=int, default=0, help="Max pages per category (0 = all pages)")
    parser.add_argument('--start-from', type=int, default=1, help="Start from URL index")
    parser.add_argument('--url', type=str, help="Crawl a single specific Amazon URL")
    parser.add_argument('--file', type=str, help="Path to custom text or json file containing URLs")
    parser.add_argument('--sub-cat', type=str, help="Filter by subcategory (Face, Lips, Eyes, Nails, Tools)")
    parser.add_argument('--export-csv', action='store_true', help=f"Export current '{TARGET_COLLECTION}' collection to CSV")
    args = parser.parse_args()

    # Direct CSV export requested
    if args.export_csv:
        export_collection_to_csv()
        return

    print("\n" + "=" * 75)
    print(f"        AMAZON MAKEUP CRAWLER (MongoDB: {TARGET_DB}.{TARGET_COLLECTION})")
    print("=" * 75)

    # Initialize MongoDB
    try:
        mongo = MongoMakeupManager()
        current_docs = mongo.get_total_count()
        print(f"  [+] MongoDB Status: Connected to '{mongo.db_name}' database")
        print(f"  [+] Target Table/Collection: '{TARGET_COLLECTION}' (Current records: {current_docs})")
    except Exception as e:
        print(f"\n  [FATAL] Failed to connect to MongoDB: {e}")
        print("  Please check your MONGO_URI in .env file.")
        sys.exit(1)

    # Determine URLs to crawl
    all_makeup_urls = get_marketplace_urls('amazon')

    if args.url:
        cat_meta = lookup_category_by_url(args.url.strip()) or {}
        urls = [{'url': args.url.strip(), **cat_meta}]
        print(f"  [+] Crawling single provided URL: {urls[0]['url']}")
    elif args.file and os.path.isfile(args.file):
        with open(args.file, 'r', encoding='utf-8') as f:
            if args.file.endswith('.json'):
                urls = json.load(f)
            else:
                raw_lines = [line.strip() for line in f if line.strip() and not line.startswith('#')]
                urls = [{'url': u, **(lookup_category_by_url(u) or {})} for u in raw_lines]
        print(f"  [+] Loaded {len(urls)} URLs from file: {args.file}")
    elif args.sub_cat:
        sub_filter = args.sub_cat.strip().lower()
        urls = [u for u in all_makeup_urls if u.get('sub_category', '').lower() == sub_filter or sub_filter in u.get('sub_category', '').lower()]
        print(f"  [+] Loaded {len(urls)} Amazon Makeup URLs for Subcategory: '{args.sub_cat}'")
    else:
        urls = all_makeup_urls
        print(f"  [+] Loaded {len(urls)} Amazon Makeup Category URLs from Marketplace Makeup URLS")

    start_idx = max(1, args.start_from)
    if start_idx > 1:
        urls = urls[start_idx - 1:]
        print(f"  [+] Starting from URL #{start_idx} ({len(urls)} remaining)")

    # Prompt if not in auto-mode
    if not args.now:
        print("-" * 75)
        print("  Options:")
        print(f"    [Enter] Start crawling all URLs into MongoDB '{TARGET_DB}.{TARGET_COLLECTION}'")
        print(f"    [c]     Export current MongoDB '{TARGET_COLLECTION}' table to CSV")
        print("    [q]     Exit")
        print("-" * 75)
        choice = input("  Select option [Press Enter to start]: ").strip().lower()
        if choice == 'q':
            print("  Cancelled. Exiting.\n")
            sys.exit(0)
        elif choice == 'c':
            export_collection_to_csv()
            return

    # Start Playwright crawler
    crawler = AmazonMakeupCrawler(base_url="https://www.amazon.in", zip_code="110037", mongo_manager=mongo)
    if not crawler.start_browser():
        print("  [ERROR] Could not start browser. Exiting.")
        sys.exit(1)

    start_time = time.time()
    grand_total = 0

    try:
        for idx, item in enumerate(urls, start=start_idx):
            if isinstance(item, dict):
                target_url = item['url']
                cat_meta = item
            else:
                target_url = str(item)
                cat_meta = lookup_category_by_url(target_url) or {}

            brand_products = crawler.crawl_url(
                target_url=target_url,
                url_index=idx,
                total_urls=len(urls) + start_idx - 1,
                max_pages_per_url=args.max_pages,
                category_meta=cat_meta
            )
            grand_total += brand_products

            # Polite pause between different brand URLs
            if idx < (len(urls) + start_idx - 1):
                pause_time = random.uniform(4, 7)
                logger.info(f"[COOLDOWN] Waiting {pause_time:.1f}s before next brand...")
                time.sleep(pause_time)

    except KeyboardInterrupt:
        print("\n\n  [!] Crawling paused/interrupted by user. All scraped records are safely stored in MongoDB.")
    finally:
        crawler.close_browser()

    elapsed = time.time() - start_time
    total_in_db = mongo.get_total_count()

    print("\n" + "=" * 75)
    print("                     CRAWL SUMMARY")
    print("=" * 75)
    print(f"  Total URLs Processed:    {len(urls)}")
    print(f"  Products Scraped Today:  {grand_total}")
    print(f"  Total in MongoDB Table:  {total_in_db} records in '{TARGET_COLLECTION}'")
    print(f"  Time Elapsed:            {elapsed / 60:.1f} minutes")
    print("=" * 75 + "\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[!] Exit.")
        sys.exit(0)
