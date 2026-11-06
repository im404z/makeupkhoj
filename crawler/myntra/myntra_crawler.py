import argparse
import asyncio
import csv
import json
import logging
import os
import random
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, Exception):
        pass

try:
    from playwright.async_api import async_playwright
except ImportError:
    async_playwright = None

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
DEFAULT_COLLECTION = COLLECTIONS['myntra']  # 'myntra_makeupkhoj'
DEFAULT_START_URL = "https://www.myntra.com/makeup"

try:
    import pymongo
    from pymongo import UpdateOne
except ImportError:
    pymongo = None
    UpdateOne = None

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

def save_to_mongodb(
    rows: List[Dict[str, Any]],
    mongo_uri: Optional[str] = None,
    db_name: Optional[str] = None,
    collection_name: Optional[str] = None
) -> int:
    """Save products to MongoDB makeupkhoj.myntra_makeupkhoj with upsert on 'id'."""
    if not rows:
        return 0

    if pymongo is None:
        logging.error("pymongo is not installed. Please run 'pip install pymongo'.")
        return 0

    uri = mongo_uri or DEFAULT_MONGO_URI
    target_db = db_name or DEFAULT_DB
    target_coll = collection_name or DEFAULT_COLLECTION
    validate_db_safety(target_db)

    try:
        masked_uri = uri.split("@")[-1] if "@" in uri else uri
        logging.info(f"Connecting to MongoDB at {masked_uri} -> {target_db}.{target_coll}...")
        client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=10000)
        db = client[target_db]
        collection = db[target_coll]

        collection.create_index("id", unique=True)
        collection.create_index("brand", unique=False)
        collection.create_index("category_path", unique=False)
        collection.create_index("sub_category", unique=False)
        collection.create_index("crawled_at", unique=False)

        now_iso = datetime.now(timezone.utc).isoformat()
        operations = [
            UpdateOne(
                {"id": row["id"]},
                {"$set": {**row, "crawled_at": now_iso}},
                upsert=True
            )
            for row in rows
        ]

        result = collection.bulk_write(operations, ordered=False)
        logging.info(
            f"SUCCESS: Synced {len(rows)} products to MongoDB -> "
            f"Database: '{target_db}', Collection: '{target_coll}' "
            f"(Matched: {result.matched_count}, Modified: {result.modified_count}, Upserted: {result.upserted_count})"
        )
        client.close()
        return len(rows)
    except Exception as e:
        logging.error(f"Failed to save products to MongoDB: {e}")
        return 0


def init_price_update_stats() -> Dict[str, Any]:
    """Initialize performance and change tracking counters for Price Update."""
    return {
        "crawled_count": 0,
        "myntra_products_upserted": 0,
        "myntra_pdp_updated": 0,
        "master_matched": 0,
        "master_updated": 0,
        "price_drops": 0,
        "price_hikes": 0,
        "price_unchanged": 0,
        "sample_drops": [],
        "sample_hikes": []
    }


def update_prices_in_mongodb(
    rows: List[Dict[str, Any]],
    mongo_uri: Optional[str] = None,
    stats: Optional[Dict[str, Any]] = None
) -> int:
    """
    High-performance price updater for Myntra:
    1. Upserts crawled items in `myntra.products` with latest prices and timestamps.
    2. Updates prices & ratings in `myntra.product_data` for all matched items.
    3. Updates `scentkhoj.products` (Master Catalog):
       - Refreshes `mappings.myntra.price`, mrp, discount, ratings
       - Recalculates `lowest_price` and `lowest_marketplace`
       - Detects price drops / hikes and logs them to console
       - Records price history entry in `price_history`
       - Updates `price_last_checked`
    """
    if not rows:
        return 0

    if pymongo is None:
        logging.error("pymongo is not installed. Please run 'pip install pymongo'.")
        return 0

    uri = mongo_uri or os.getenv("MONGO") or os.getenv("MONGO_URI") or os.getenv("MONGODB_URI") or DEFAULT_MONGO_URI

    try:
        client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=10000)
        target_db_name = os.getenv("MONGO_DB", DEFAULT_DB)
        validate_db_safety(target_db_name)
        myntra_db = client[target_db_name]
        coll_products = myntra_db[DEFAULT_COLLECTION]
        coll_pdp = coll_products
        coll_master = myntra_db["products"]

        now_iso = datetime.now(timezone.utc).isoformat()
        today_str = datetime.now().strftime("%Y-%m-%d")

        prod_ids = [str(r["id"]) for r in rows if r.get("id")]
        int_ids = [int(p) for p in prod_ids if p.isdigit()]
        id_candidates = prod_ids + int_ids
        sk_ids = [f"SK-MYN-{p}" for p in prod_ids]

        # Batch lookup matching master products in scentkhoj.products
        master_docs = list(coll_master.find({
            "$or": [
                {"mappings.myntra.id": {"$in": id_candidates}},
                {"id": {"$in": sk_ids}}
            ]
        }))

        master_by_myn_id = {}
        for doc in master_docs:
            myn_id = doc.get("mappings", {}).get("myntra", {}).get("id")
            if myn_id is not None:
                master_by_myn_id[str(myn_id)] = doc
            if doc.get("id", "").startswith("SK-MYN-"):
                clean_id = doc["id"].replace("SK-MYN-", "")
                master_by_myn_id[clean_id] = doc

        # Batch lookup existing IDs in myntra.product_data
        existing_pdp_ids = set()
        pdp_matches = coll_pdp.find({"id": {"$in": id_candidates}}, {"id": 1})
        for d in pdp_matches:
            if d.get("id") is not None:
                existing_pdp_ids.add(str(d.get("id")))

        products_ops = []
        pdp_ops = []
        master_ops = []

        for row in rows:
            prod_id = str(row.get("id") or "")
            if not prod_id:
                continue

            price = row.get("price")
            mrp = row.get("mrp") or price
            discount = row.get("discount") or ""
            rating = row.get("rating")
            if rating is not None:
                try:
                    rating = round(float(rating), 1)
                    row["rating"] = rating
                except Exception:
                    pass
            rating_count = row.get("rating_count")
            url = row.get("url")
            image = row.get("image")

            # 1. Update in myntra.products
            products_ops.append(
                UpdateOne(
                    {"id": prod_id},
                    {"$set": {
                        **row,
                        "price_last_checked": now_iso,
                        "crawled_at": now_iso
                    }},
                    upsert=True
                )
            )

            # 2. Update in myntra.product_data (if already scraped)
            if prod_id in existing_pdp_ids:
                pdp_update = {
                    "price": price,
                    "mrp": mrp,
                    "discount": discount,
                    "price_last_checked": now_iso,
                    "updated_at": now_iso
                }
                if rating is not None:
                    pdp_update["rating"] = rating
                if rating_count is not None:
                    pdp_update["rating_count"] = rating_count

                pdp_ops.append(
                    UpdateOne(
                        {"id": prod_id},
                        {"$set": pdp_update}
                    )
                )
                if stats is not None:
                    stats["myntra_pdp_updated"] += 1

            # 3. Update in scentkhoj.products (Master Catalog)
            master_doc = master_by_myn_id.get(prod_id)
            if master_doc and price is not None and price > 0:
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
                    "lowest_price": lowest_price,
                    "lowest_marketplace": lowest_marketplace,
                    "price_last_checked": now_iso,
                    "updated_at": now_iso
                }

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

                master_ops.append(
                    UpdateOne(
                        {"_id": master_doc["_id"]},
                        master_update_op
                    )
                )

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

        if products_ops:
            res_p = coll_products.bulk_write(products_ops, ordered=False)
            if stats is not None:
                stats["myntra_products_upserted"] += (res_p.upserted_count + res_p.modified_count)

        if pdp_ops:
            coll_pdp.bulk_write(pdp_ops, ordered=False)

        if master_ops:
            coll_master.bulk_write(master_ops, ordered=False)

        logging.info(
            f"[PRICE UPDATE BATCH] Synced {len(rows)} items -> "
            f"myntra.products: {len(products_ops)}, myntra.product_data: {len(pdp_ops)}, "
            f"scentkhoj.products: {len(master_ops)}"
        )
        client.close()
        return len(rows)
    except Exception as e:
        logging.error(f"Failed to update prices in MongoDB: {e}")
        return 0


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


def print_price_update_summary(stats: Dict[str, Any], max_pages: int, duration_secs: float):
    """Print clean executive summary table of price update results."""
    mins, secs = divmod(int(duration_secs), 60)
    dur_str = f"{mins}m {secs}s" if mins > 0 else f"{secs}s"
    page_label = "ALL (Until catalog end)" if max_pages == 0 else str(max_pages)

    print("\n" + "=" * 78)
    print("          MYNTRA PRICE UPDATE & CATALOG VERIFICATION SUMMARY")
    print("=" * 78)
    print(f"  Finished At:                       {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Duration:                          {dur_str}")
    print(f"  Listing Pages Crawled:             {page_label}")
    print(f"  Total Unique Items Crawled:        {stats.get('crawled_count', 0):,}")
    print(f"  Synced to `myntra.products`:        {stats.get('myntra_products_upserted', 0):,}")
    print(f"  Refreshed in `myntra.product_data`:    {stats.get('myntra_pdp_updated', 0):,}")
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


# Improved JS Extractor with precise rating_count clean extraction
JS_EXTRACT = """
() => [...document.querySelectorAll('li.product-base')].map(li => {
  const t = s => li.querySelector(s)?.innerText.trim() || null;
  const img = li.querySelector('img');
  
  const getRatingCount = () => {
    const el = li.querySelector('.product-ratingsCount');
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.product-separator').forEach(s => s.remove());
    return clone.textContent.replace(/[|\\n\\r]/g, '').trim() || null;
  };

  const getRating = () => {
    const el = li.querySelector('.product-ratingsContainer span');
    return el ? el.innerText.trim() : null;
  };

  return {
    id: li.id ? li.id.replace('product-', '').trim() : null,
    brand: t('.product-brand'),
    name: t('.product-product'),
    sizes: t('.product-sizes'),
    price: t('.product-discountedPrice'),
    mrp: t('.product-strike'),
    discount: t('.product-discountPercentage'),
    rating: getRating(),
    rating_count: getRatingCount(),
    is_ad: !!li.querySelector('.product-waterMark'),
    url: li.querySelector('a')?.href || null,
    image: img ? (img.src || img.getAttribute('data-src') || img.srcset || null) : null,
  };
})
"""

def clean_text(val: Any) -> str:
    """Clean string values, stripping leading pipes, newlines, and excess spaces."""
    if val is None:
        return ""
    s = str(val).replace("\r", "").replace("\n", " ").strip()
    s = re.sub(r"^[|\s]+", "", s).strip()
    return s

def parse_number(val: Any) -> Optional[Any]:
    """Extract clean float or int from string or number."""
    if val is None or val == "" or val == "N/A":
        return None
    if isinstance(val, (int, float)):
        return val
    s = str(val).replace(",", "")
    match = re.search(r"[-+]?\d*\.?\d+", s)
    if match:
        num = float(match.group(0))
        return int(num) if num.is_integer() else num
    return None

def parse_discount(val: Any, mrp: Optional[float] = None, price: Optional[float] = None) -> str:
    """Format clean discount string, e.g. '25% OFF'."""
    if val:
        return str(val).replace("(", "").replace(")", "").strip()
    if mrp and price and mrp > price:
        pct = round(((mrp - price) / mrp) * 100)
        return f"{pct}% OFF"
    return ""

async def scroll_to_bottom_and_find_next(page):
    """Gradually scroll down the page to trigger lazy loading and find the next button."""
    logging.info("Scrolling down page to load lazy products and pagination...")
    next_loc = page.locator("li.pagination-next, ul.pagination-container li.pagination-next, .pagination-next")

    for _ in range(22):
        await page.mouse.wheel(0, 900)
        await page.wait_for_timeout(100)
        if await next_loc.count() > 0 and await next_loc.first.is_visible():
            return next_loc.first

    await page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
    await page.wait_for_timeout(1000)

    if await next_loc.count() > 0:
        return next_loc.first

    fallback = page.locator(".pagination-container li:has-text('Next')")
    if await fallback.count() > 0:
        return fallback.first

    return None

async def extract_page_products(page, page_no: int) -> List[Dict[str, Any]]:
    """Extract product list from DOM with rich metadata and optional __myx enrichment."""
    dom_items = []
    try:
        dom_items = await page.evaluate(JS_EXTRACT)
    except Exception as e:
        logging.warning(f"DOM extraction error on page {page_no}: {e}")
        dom_items = []

    # On page 1 only, window.__myx is fresh from initial HTML
    myx_map = {}
    if page_no == 1:
        try:
            myx_products = await page.evaluate(
                "() => window.__myx?.searchData?.results?.products || []"
            )
            for p in myx_products:
                pid = clean_text(p.get("productId") or p.get("id"))
                if pid:
                    myx_map[pid] = p
        except Exception:
            pass

    enriched_items = []
    processed_ids = set()

    for d in dom_items:
        prod_id = clean_text(d.get("id"))
        if not prod_id or prod_id in processed_ids:
            continue
        processed_ids.add(prod_id)

        p = myx_map.get(prod_id, {})
        brand = clean_text(d.get("brand") or p.get("brand") or "N/A")
        name = clean_text(d.get("name") or p.get("product") or p.get("productName") or "N/A")
        num_price = parse_number(d.get("price") or p.get("price"))
        num_mrp = parse_number(d.get("mrp") or p.get("mrp"))
        discount = parse_discount(d.get("discount") or p.get("discountDisplayLabel") or p.get("discount"), num_mrp, num_price)
        raw_rating = parse_number(d.get("rating") or p.get("rating"))
        rating = round(float(raw_rating), 1) if raw_rating is not None else None
        rating_count = int(parse_number(d.get("rating_count") or p.get("ratingCount")) or 0)

        raw_url = d.get("url") or (f"https://www.myntra.com/{p.get('landingPageUrl')}" if p.get("landingPageUrl") else "N/A")
        raw_img = d.get("image") or p.get("searchImage") or "N/A"

        enriched_items.append({
            "id": prod_id,
            "brand": brand,
            "name": name,
            "currency": "INR",
            "price": num_price,
            "mrp": num_mrp,
            "discount": discount,
            "rating": rating,
            "rating_count": rating_count,
            "sizes": clean_text(d.get("sizes") or p.get("sizes") or "N/A"),
            "is_ad": "Yes" if (d.get("is_ad") or p.get("isPLA")) else "No",
            "url": clean_text(raw_url),
            "image": clean_text(raw_img),
            "page": page_no
        })

    return enriched_items

def crawl_myntra_via_httpx(
    start_url: str,
    export_format: str = "mongo",
    base_filename: str = "myntra_products",
    max_pages: int = 10,
    mongo_uri: Optional[str] = None,
    mongo_db: Optional[str] = None,
    mongo_collection: Optional[str] = None,
    is_price_update: bool = False,
    sync_catalog: bool = True,
    category_meta: Optional[Dict[str, Any]] = None
) -> int:
    """
    High-speed HTTP direct extractor for Myntra listings:
    Parses `window.__myx` JSON directly from search HTML.
    Eliminates ERR_HTTP2_PROTOCOL_ERROR and runs in seconds.
    Supports Price Update mode with real-time multi-collection DB updates.
    """
    import httpx
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
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

    start_time = time.time()
    if export_format == "price_update":
        is_price_update = True

    stats = init_price_update_stats() if is_price_update else None
    products_dict: Dict[str, Dict[str, Any]] = {}

    limit_pages = max_pages if max_pages > 0 else 500
    page_label = "ALL (Until catalog ends)" if max_pages == 0 else str(max_pages)
    mode_text = "PRICE UPDATE" if is_price_update else "LISTING CRAWL"
    logging.info(f"[MYNTRA HTTP] Starting high-speed {mode_text} for up to {page_label} pages...")

    def fetch_myntra_html(url):
        # 1. Try curl_cffi first for TLS fingerprint bypass on datacenter/cloud IPs
        try:
            from curl_cffi import requests as cffi_requests
            r = cffi_requests.get(url, impersonate="chrome124", headers=headers, timeout=15)
            if r.status_code == 200 and "__myx" in r.text:
                return r.text
        except Exception:
            pass

        # 2. Fallback to httpx
        try:
            import httpx
            with httpx.Client(headers=headers, timeout=15.0, follow_redirects=True) as client:
                r = client.get(url)
                if r.status_code == 200:
                    return r.text
        except Exception as e:
            logging.warning(f"[MYNTRA HTTP] Network error: {e}")
        return None

    consecutive_empty = 0
    actual_pages_crawled = 0

    for page_no in range(1, limit_pages + 1):
        actual_pages_crawled += 1
        sep = "&" if "?" in start_url else "?"
        page_url = f"{start_url}{sep}p={page_no}"
        logging.info(f"[MYNTRA HTTP] Page {page_no}/{page_label}: Fetching {page_url}...")

        html_text = fetch_myntra_html(page_url)
        if not html_text:
            logging.warning(f"[MYNTRA HTTP] Page {page_no} failed to fetch HTML")
            consecutive_empty += 1
            if max_pages == 0 and consecutive_empty >= 2:
                logging.info("[MYNTRA HTTP] Reached catalog end (consecutive network/empty responses).")
                break
            continue

        # Extract window.__myx with DOTALL regex
        myx_products = []
        match = re.search(r'window\.__myx\s*=\s*(\{.*?\})\s*;?\s*</script>', html_text, re.DOTALL)
        if match:
            try:
                data = json.loads(match.group(1))
                myx_products = data.get("searchData", {}).get("results", {}).get("products", [])
            except Exception:
                pass

        # Substring fallback if regex missed trailing script
        if not myx_products and "window.__myx" in html_text:
            idx = html_text.find("window.__myx")
            start_brace = html_text.find("{", idx)
            end_script = html_text.find("</script>", start_brace)
            if start_brace != -1 and end_script != -1:
                candidate = html_text[start_brace:end_script].rstrip().rstrip(";")
                try:
                    data = json.loads(candidate)
                    myx_products = data.get("searchData", {}).get("results", {}).get("products", [])
                except Exception:
                    pass

        if not myx_products:
            if page_no >= 12:
                logging.warning(f"[MYNTRA HTTP] Page {page_no} returned 0 products (Myntra Code 1010 Bad Request).")
                logging.warning(f"[MYNTRA HTTP] Myntra blocks direct HTTP URL pagination (?p={page_no}) past page 11.")
                logging.warning("[MYNTRA HTTP] Use Browser Automation mode (Clicks 'Next' button) to crawl up to 700+ pages.")
            else:
                logging.warning(f"[MYNTRA HTTP] window.__myx not found or 0 products on page {page_no}")
            consecutive_empty += 1
            if consecutive_empty >= 2:
                logging.info(f"[MYNTRA HTTP] Stopping HTTP crawl after {consecutive_empty} consecutive empty pages.")
                break
            continue

        consecutive_empty = 0
        new_items_on_page = []
        for p in myx_products:
            prod_id = clean_text(p.get("productId") or p.get("id"))
            if not prod_id:
                continue

            num_price = parse_number(p.get("price"))
            num_mrp = parse_number(p.get("mrp"))
            discount = parse_discount(p.get("discountDisplayLabel") or p.get("discount"), num_mrp, num_price)
            rating = parse_number(p.get("rating"))
            rating_count = int(parse_number(p.get("ratingCount")) or 0)
            raw_url = f"https://www.myntra.com/{p.get('landingPageUrl')}" if p.get("landingPageUrl") else ""
            images_list = p.get("images") or []
            first_img = images_list[0].get("src") if images_list and isinstance(images_list[0], dict) else ""
            raw_img = p.get("searchImage") or first_img

            cat = category_meta or lookup_category_by_url(start_url) or {}
            category = cat.get('category', 'Makeup')
            sub_category = cat.get('sub_category', 'General')
            sub_sub_category = cat.get('sub_sub_category', cat.get('category_name', 'Makeup'))
            category_path = cat.get('category_path', f"Makeup > {sub_category} > {sub_sub_category}")
            category_name = cat.get('category_name', sub_sub_category)

            record = {
                "id": prod_id,
                "brand": clean_text(p.get("brand") or "N/A"),
                "name": clean_text(p.get("product") or p.get("productName") or "N/A"),
                "title": clean_text(p.get("product") or p.get("productName") or "N/A"),
                "currency": "INR",
                "price": num_price,
                "mrp": num_mrp,
                "discount": discount,
                "rating": rating,
                "rating_count": rating_count,
                "reviews_count": rating_count,
                "sizes": clean_text(p.get("sizes") or "N/A"),
                "is_ad": "Yes" if p.get("isPLA") else "No",
                "url": clean_text(raw_url),
                "image": clean_text(raw_img),
                "images": [clean_text(raw_img)] if raw_img else [],
                "category": category,
                "sub_category": sub_category,
                "sub_sub_category": sub_sub_category,
                "category_path": category_path,
                "category_name": category_name,
                "category_url": cat.get('url', start_url),
                "marketplace": "myntra",
                "marketplace_name": "Myntra",
                "page": page_no
            }

            if prod_id not in products_dict:
                products_dict[prod_id] = record
                new_items_on_page.append(record)

        logging.info(f"[MYNTRA HTTP] Page {page_no}: Extracted {len(myx_products)} items ({len(new_items_on_page)} new, total unique: {len(products_dict)})")

        if is_price_update and new_items_on_page:
            update_prices_in_mongodb(
                rows=new_items_on_page,
                mongo_uri=mongo_uri,
                stats=stats
            )
        elif export_format in ["mongo", "mongodb", "all"] and new_items_on_page:
            save_to_mongodb(
                rows=new_items_on_page,
                mongo_uri=mongo_uri,
                db_name=mongo_db,
                collection_name=mongo_collection
            )

    elapsed_time = time.time() - start_time
    logging.info(f"[MYNTRA HTTP COMPLETE] Successfully processed {len(products_dict)} products across {actual_pages_crawled} pages in {elapsed_time:.1f}s.")

    if is_price_update and stats is not None:
        stats["crawled_count"] = len(products_dict)
        if sync_catalog:
            run_master_catalog_sync()
        print_price_update_summary(stats, max_pages, elapsed_time)

    return len(products_dict)

async def crawl_myntra(
    start_url: str,
    export_format: str = "csv",
    base_filename: str = "myntra_products",
    max_pages: int = 10,
    mongo_uri: Optional[str] = None,
    mongo_db: Optional[str] = None,
    mongo_collection: Optional[str] = None,
    is_price_update: bool = False,
    sync_catalog: bool = True
):
    products_dict: Dict[str, Dict[str, Any]] = {}
    start_time = time.time()
    if export_format == "price_update":
        is_price_update = True
    stats = init_price_update_stats() if is_price_update else None

    if async_playwright is None:
        logging.error("Playwright is not installed. To use browser automation, install with: pip install playwright && playwright install chromium")
        return

    user_data_dir = tempfile.mkdtemp(prefix="myntra_browser_")
    async with async_playwright() as p:
        logging.info("Launching Chrome Browser for Interactive Automation (Next-Button Click Mode)...")
        try:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                channel="chrome",
                headless=False,
                viewport={"width": 1366, "height": 900},
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-infobars"
                ]
            )
        except Exception as e:
            logging.info(f"Using default Chromium: {e}")
            context = await p.chromium.launch_persistent_context(
                user_data_dir=user_data_dir,
                headless=False,
                viewport={"width": 1366, "height": 900},
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--disable-infobars"
                ]
            )

        page = context.pages[0] if context.pages else await context.new_page()
        logging.info(f"Navigating to URL: {start_url}")

        try:
            res = await page.goto(start_url, wait_until="domcontentloaded", timeout=40000)
            logging.info(f"Initial Page HTTP Status: {res.status if res else 'Unknown'}")
        except Exception as err:
            logging.error(f"Navigation error: {err}")
            await context.close()
            return

        try:
            await page.wait_for_selector("li.product-base", timeout=30000)
        except Exception:
            logging.warning("Timeout waiting for 'li.product-base'. Checking available content.")

        page_no = 1
        limit_pages = max_pages if max_pages > 0 else 720
        while page_no <= limit_pages:
            next_btn = await scroll_to_bottom_and_find_next(page)

            items = await extract_page_products(page, page_no)
            new_items_on_page = []
            for item in items:
                item_id = item["id"]
                if item_id not in products_dict:
                    products_dict[item_id] = item
                    new_items_on_page.append(item)

            meta_text = "N/A"
            try:
                meta_loc = page.locator("li.pagination-paginationMeta")
                if await meta_loc.count() > 0:
                    meta_text = (await meta_loc.inner_text()).strip().replace("\n", " ")
            except Exception:
                pass

            logging.info(f"Page {page_no} [{meta_text}]: {len(items)} items extracted on page ({len(new_items_on_page)} new, {len(products_dict)} total unique).")

            # Real-time sync / price update
            if is_price_update and new_items_on_page:
                update_prices_in_mongodb(
                    rows=new_items_on_page,
                    mongo_uri=mongo_uri,
                    stats=stats
                )
            elif export_format in ["mongo", "mongodb", "all"] and new_items_on_page:
                save_to_mongodb(
                    rows=new_items_on_page,
                    mongo_uri=mongo_uri,
                    db_name=mongo_db,
                    collection_name=mongo_collection
                )

            if max_pages > 0 and page_no >= max_pages:
                logging.info(f"Reached requested max pages limit ({max_pages}).")
                break

            if not next_btn:
                logging.info("Next page button not found. Final page reached.")
                break

            cls = await next_btn.get_attribute("class") or ""
            if "disabled" in cls or "pagination-disabled" in cls:
                logging.info("Next page button is disabled. Final page reached.")
                break

            logging.info(f"Clicking Next page button to load Page {page_no + 1}...")
            try:
                await next_btn.scroll_into_view_if_needed()
                await page.wait_for_timeout(600)
                await next_btn.click(force=True)
                try:
                    await page.wait_for_function(
                        "old => { const el = document.querySelector('li.pagination-paginationMeta'); return el && el.innerText.trim() !== old; }",
                        arg=meta_text,
                        timeout=15000
                    )
                except Exception:
                    pass
                await page.wait_for_timeout(1500)
            except Exception as e:
                logging.warning(f"Error clicking Next page button: {e}")

            page_no += 1
            delay = random.uniform(1.2, 2.5)
            await page.wait_for_timeout(int(delay * 1000))

        await context.close()

    elapsed_time = time.time() - start_time

    # Save output data
    if products_dict:
        rows = list(products_dict.values())
        fieldnames = [
            "id", "brand", "name", "currency", "price", "mrp", "discount",
            "rating", "rating_count", "sizes", "is_ad", "url", "image", "page"
        ]

        if export_format in ["csv", "both", "all"]:
            csv_filename = f"{base_filename}.csv" if not base_filename.endswith(".csv") else base_filename
            with open(csv_filename, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(rows)
            logging.info(f"SUCCESS: Saved {len(rows)} products to CSV -> '{csv_filename}'")

        if export_format in ["json", "both", "all"]:
            json_filename = f"{base_filename}.json" if not base_filename.endswith(".json") else base_filename
            with open(json_filename, "w", encoding="utf-8") as f:
                json.dump(rows, f, indent=2, ensure_ascii=False)
            logging.info(f"SUCCESS: Saved {len(rows)} products to JSON -> '{json_filename}'")

        if is_price_update and stats is not None:
            stats["crawled_count"] = len(products_dict)
            if sync_catalog:
                run_master_catalog_sync()
            print_price_update_summary(stats, max_pages, elapsed_time)

        elif export_format in ["mongo", "mongodb", "all"]:
            save_to_mongodb(
                rows=rows,
                mongo_uri=mongo_uri,
                db_name=mongo_db,
                collection_name=mongo_collection
            )

    else:
        logging.warning("No product data extracted.")

def get_interactive_inputs():
    print("\n" + "=" * 68)
    print("      MYNTRA PERFUME CRAWLER & PRICE UPDATER (INTERACTIVE)")
    print("=" * 68)
    print("1. Select Mode:")
    print("   [1] Price Update (Recommended - Fast listing crawl & update all prices properly)")
    print("   [2] Standard Crawl (Crawl listings and export to CSV / JSON / MongoDB)")
    mode_in = input("   Choice (1/2) [Default: 1]: ").strip()

    is_price_update = (mode_in != "2")

    print("\n2. Select Crawling Engine:")
    print("   [1] Browser Automation (Playwright - Clicks 'Next' button, crawls full catalog up to 700+ pages) [Recommended]")
    print("   [2] Fast Direct HTTP (Fast, but limited to first 11 pages by Myntra)")
    engine_in = input("   Choice (1/2) [Default: 1]: ").strip()
    use_browser = (engine_in != "2")

    if is_price_update:
        raw_url = input(f"\n3. Enter Myntra URL\n   [Press Enter for default perfume URL]: ").strip()
        url = raw_url if raw_url else DEFAULT_START_URL

        pages_in = input("\n4. Enter Max Pages to Crawl [Default: 10, or 'all'/0 for full catalog]: ").strip().lower()
        if pages_in in ["all", "0"]:
            max_pages = 0
        elif pages_in.isdigit():
            max_pages = int(pages_in)
        else:
            max_pages = 10

        sync_in = input("\n5. Run Master Catalog Sync (sync_catalog_skus.js)? (Y/n) [Default: Y]: ").strip().lower()
        sync_catalog = (sync_in != "n")

        export_format = "price_update"
        out_name = "myntra_products"
        mongo_collection = "products"

        print("\n" + "-" * 68)
        print("Starting Price Update with configurations:")
        print(f" - URL: {url}")
        print(f" - Engine: {'Browser Automation (Clicks Next Button)' if use_browser else 'Direct HTTP (Max 11 pages)'}")
        print(f" - Mode: PRICE UPDATE (MongoDB + Master Catalog)")
        print(f" - Max Pages: {'FULL CATALOG (All available)' if max_pages == 0 else max_pages}")
        print(f" - Master Catalog Sync: {'YES' if sync_catalog else 'NO'}")
        print("-" * 68 + "\n")

        return url, export_format, out_name, max_pages, mongo_collection, is_price_update, sync_catalog, use_browser

    else:
        raw_url = input(f"\n3. Enter Myntra URL\n   [Press Enter for default perfume URL]: ").strip()
        url = raw_url if raw_url else DEFAULT_START_URL

        print("\n4. Select Export Destination / Format:")
        print("   [1] CSV (default)")
        print("   [2] JSON")
        print("   [3] BOTH (CSV + JSON)")
        print("   [4] MongoDB")
        print("   [5] ALL (CSV + JSON + MongoDB)")
        print("   [6] Price Update (MongoDB + Master Catalog)")
        fmt_choice = input("   Choice (1/2/3/4/5/6): ").strip()
        if fmt_choice == "2":
            export_format = "json"
        elif fmt_choice == "3":
            export_format = "both"
        elif fmt_choice == "4":
            export_format = "mongo"
        elif fmt_choice == "5":
            export_format = "all"
        elif fmt_choice == "6":
            export_format = "price_update"
        else:
            export_format = "csv"

        out_name = "myntra_products"
        if export_format in ["csv", "json", "both", "all"]:
            out_name = input("\n5. Enter Output Base Filename [Default: myntra_products]: ").strip()
            if not out_name:
                out_name = "myntra_products"

        mongo_collection = None
        if export_format in ["mongo", "all"]:
            default_coll = os.getenv("MONGO_COLLECTION", "products")
            coll_in = input(f"\n   Enter MongoDB Collection [Default: {default_coll}]: ").strip()
            mongo_collection = coll_in if coll_in else default_coll

        pages_in = input("\n6. Enter Max Pages to Crawl [Default: 5, or 'all'/0]: ").strip().lower()
        if pages_in in ["all", "0"]:
            max_pages = 0
        elif pages_in.isdigit():
            max_pages = int(pages_in)
        else:
            max_pages = 5

        is_price_up = (export_format == "price_update")
        sync_catalog = is_price_up

        print("\n" + "-" * 68)
        print("Starting crawl with configurations:")
        print(f" - URL: {url}")
        print(f" - Engine: {'Browser Automation (Clicks Next Button)' if use_browser else 'Direct HTTP (Max 11 pages)'}")
        print(f" - Format/Destination: {export_format.upper()}")
        if export_format in ["csv", "json", "both", "all"]:
            print(f" - Output File: {out_name}")
        if export_format in ["mongo", "all"]:
            print(f" - MongoDB Database: {os.getenv('MONGO_DB', 'myntra')}")
            print(f" - MongoDB Collection: {mongo_collection or os.getenv('MONGO_COLLECTION', 'products')}")
        print(f" - Max Pages: {'FULL CATALOG (All available)' if max_pages == 0 else max_pages}")
        print("-" * 68 + "\n")

        return url, export_format, out_name, max_pages, mongo_collection, is_price_up, sync_catalog, use_browser


def main():
    parser = argparse.ArgumentParser(description=f"Myntra Makeup Crawler - Saves to MongoDB '{DEFAULT_DB}.{DEFAULT_COLLECTION}'")
    parser.add_argument("--url", type=str, help="Start URL to crawl")
    parser.add_argument("--sub-cat", type=str, help="Filter by subcategory (Face, Lips, Eyes, Nails)")
    parser.add_argument("--format", type=str, default="mongo", choices=["csv", "json", "both", "mongo", "mongodb", "all", "price_update"], help="Export format (default: mongo)")
    parser.add_argument("--price-update", action="store_true", help="Run listing crawl and update all prices properly across MongoDB and Master Catalog")
    parser.add_argument("--sync-catalog", action="store_true", default=True, help="Synchronize with Master Catalog (makeupkhoj.products)")
    parser.add_argument("--no-sync-catalog", dest="sync_catalog", action="store_false", help="Skip synchronizing with Master Catalog")
    parser.add_argument("--output", type=str, default="myntra_makeupkhoj", help="Base output filename (without extension)")
    parser.add_argument("--pages", type=int, default=5, help="Max pages to crawl per category (default: 5)")
    parser.add_argument("--mongo-uri", type=str, default=DEFAULT_MONGO_URI, help="MongoDB connection URI")
    parser.add_argument("--mongo-db", type=str, default=DEFAULT_DB, help=f"MongoDB database name (default: '{DEFAULT_DB}')")
    parser.add_argument("--mongo-collection", type=str, default=DEFAULT_COLLECTION, help=f"MongoDB collection name (default: '{DEFAULT_COLLECTION}')")
    parser.add_argument("--engine", type=str, choices=["browser", "http"], default="http", help="Crawl engine: 'http' (Fast direct JSON extraction) or 'browser'")
    parser.add_argument("--non-interactive", action="store_true", default=True, help="Run non-interactively with defaults")

    args = parser.parse_args()

    mongo_collection = args.mongo_collection or DEFAULT_COLLECTION
    mongo_db = args.mongo_db or DEFAULT_DB
    sync_catalog = args.sync_catalog
    is_price_update = args.price_update or (args.format == "price_update")
    export_format = "price_update" if is_price_update else (args.format or "mongo")

    # Determine URLs
    myntra_makeup_urls = get_marketplace_urls('myntra')

    if args.url:
        cat_meta = lookup_category_by_url(args.url.strip()) or {}
        targets = [{'url': args.url.strip(), **cat_meta}]
    elif args.sub_cat:
        sub_filter = args.sub_cat.strip().lower()
        targets = [u for u in myntra_makeup_urls if u.get('sub_category', '').lower() == sub_filter or sub_filter in u.get('sub_category', '').lower()]
    else:
        targets = myntra_makeup_urls

    print("\n" + "=" * 75)
    print(f"      MYNTRA MAKEUP CRAWLER (MongoDB: {mongo_db}.{mongo_collection})")
    print(f"      Total Target URLs to Crawl: {len(targets)}")
    print("=" * 75)

    if args.engine == "browser":
        async def _run_all_browser():
            for idx, item in enumerate(targets, start=1):
                target_url = item['url']
                print(f"\n[TARGET {idx}/{len(targets)}] {item.get('category_path', 'Makeup')} -> {target_url}")
                await crawl_myntra(
                    start_url=target_url,
                    export_format=export_format,
                    base_filename=args.output,
                    max_pages=args.pages,
                    mongo_uri=args.mongo_uri,
                    mongo_db=mongo_db,
                    mongo_collection=mongo_collection,
                    is_price_update=is_price_update,
                    sync_catalog=sync_catalog,
                    category_meta=item
                )
        asyncio.run(_run_all_browser())
    else:
        for idx, item in enumerate(targets, start=1):
            target_url = item['url']
            print(f"\n[TARGET {idx}/{len(targets)}] {item.get('category_path', 'Makeup')} -> {target_url}")
            crawl_myntra_via_httpx(
                start_url=target_url,
                export_format=export_format,
                base_filename=args.output,
                max_pages=args.pages,
                mongo_uri=args.mongo_uri,
                mongo_db=mongo_db,
                mongo_collection=mongo_collection,
                is_price_update=is_price_update,
                sync_catalog=sync_catalog,
                category_meta=item
            )


if __name__ == "__main__":
    main()

