#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ScentKhoj Master Pipeline Runner - run_pipeline.py
===================================================
A unified command-line and interactive runner to execute all crawling,
PDP extraction, and Master SKU catalog synchronization tasks.

Capabilities:
1. Mixed-Brand Category Crawler (fragrance.txt) with Title Brand Detection
2. Brand-Specific Facet Crawler (perfume-brand.txt)
3. Product Detail (PDP) Crawler (perfume-product-data.py) to resolve specifications & pending brands
4. Master SKU & Taxonomy Synchronizer (sync_catalog_skus.js) across Amazon, Flipkart, & Myntra
5. Full End-to-End Automated Pipeline
6. Real-time Database Status & Coverage Dashboard
"""

import os
import sys
import subprocess
import argparse
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

# Ensure UTF-8 console output on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

load_dotenv()
load_dotenv(dotenv_path='../.env')
load_dotenv(dotenv_path='../../.env')

_crawler_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _crawler_root not in sys.path:
    sys.path.insert(0, _crawler_root)

from db_config import get_db, COLLECTIONS, DB_NAME, DEFAULT_MONGO_URI, validate_db_safety

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))


def get_mongo_counts():
    """Fetch current record counts from MongoDB across collections in makeupkhoj"""
    try:
        client = MongoClient(DEFAULT_MONGO_URI, serverSelectionTimeoutMS=4000)
        db = client[DB_NAME]
        amz_col = db[COLLECTIONS['amazon']]
        return {
            'products': db['products'].count_documents({}),
            'brands': db['brands'].count_documents({}),
            'amazon_total': amz_col.count_documents({}),
            'amazon_pdps': amz_col.count_documents({'pdp_scraped': True}),
            'pending_pdps': amz_col.count_documents({'$or': [{'pdp_scraped': {'$ne': True}}, {'pdp_scraped': {'$exists': False}}]}),
            'multi_store': db['products'].count_documents({'store_count': {'$gt': 1}})
        }
    except Exception as e:
        return {'error': str(e)}


def print_status_dashboard():
    """Print database counts and coverage dashboard"""
    counts = get_mongo_counts()
    print("\n" + "=" * 75)
    print(f"                 MAKEUPKHOJ DATABASE STATUS ({DB_NAME})")
    print("=" * 75)
    if 'error' in counts:
        print(f"  [ERROR] Could not connect to MongoDB: {counts['error']}")
    else:
        print(f"  • Master Products ({DB_NAME}.products):              {counts['products']:,}")
        print(f"  • Multi-Store Products (>= 2 stores):                 {counts['multi_store']:,}")
        print(f"  • Active Brands ({DB_NAME}.brands):                   {counts['brands']:,}")
        print(f"  • Amazon Total Listings ({COLLECTIONS['amazon']}):      {counts['amazon_total']:,}")
        print(f"  • Amazon PDP Enriched ({COLLECTIONS['amazon']}):        {counts['amazon_pdps']:,}")
        print(f"  • Amazon Pending PDP Listings:                        {counts['pending_pdps']:,}")
    print("=" * 75 + "\n")


def run_command(cmd, cwd=PROJECT_ROOT):
    """Execute a subprocess command with live output streaming"""
    print(f"\n[RUNNING] {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    print("-" * 75)
    try:
        proc = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str))
        return proc.returncode == 0
    except KeyboardInterrupt:
        print("\n[!] Process interrupted by user.")
        return False
    except Exception as e:
        print(f"\n[ERROR] Command failed to execute: {e}")
        return False


def step_crawl_category(max_pages=0, now=True):
    """Run amazon_crawler.py on amazon makeup URLs"""
    print("\n>>> STEP: CRAWLING AMAZON MAKEUP LISTINGS <<<")
    cmd = [
        sys.executable,
        os.path.join(SCRIPT_DIR, 'amazon_crawler.py')
    ]
    if max_pages > 0:
        cmd.extend(['--max-pages', str(max_pages)])
    if now:
        cmd.append('--now')
    return run_command(cmd)


def step_crawl_brands(max_pages=0, now=True):
    """Run amazon_crawler.py on specific subcategory or brand URLs"""
    print("\n>>> STEP: CRAWLING AMAZON MAKEUP CATEGORIES <<<")
    cmd = [
        sys.executable,
        os.path.join(SCRIPT_DIR, 'amazon_crawler.py')
    ]
    if max_pages > 0:
        cmd.extend(['--max-pages', str(max_pages)])
    if now:
        cmd.append('--now')
    return run_command(cmd)


def step_crawl_pdp(limit=0, now=True):
    """Run amazon_pdp_crawler.py to extract PDP details and backfill verified brands"""
    print("\n>>> STEP: EXTRACTING PRODUCT DETAILS / PDP (amazon_pdp_crawler.py) <<<")
    cmd = [
        sys.executable,
        os.path.join(SCRIPT_DIR, 'amazon_pdp_crawler.py')
    ]
    if limit > 0:
        cmd.extend(['--limit', str(limit)])
    if now:
        cmd.append('--now')
    return run_command(cmd)


def step_sync_catalog(marketplace='all', limit=0, dry_run=False):
    """Run sync_catalog_skus.js to generate Master SKUs and classify taxonomy"""
    print(f"\n>>> STEP: RUNNING MASTER SKU & CATALOG SYNC ({marketplace.upper()}) <<<")
    cmd = [
        'node',
        os.path.join(PROJECT_ROOT, 'server', 'scripts', 'sync_catalog_skus.js'),
        f'--marketplace={marketplace}'
    ]
    if limit > 0:
        cmd.append(f'--limit={limit}')
    if dry_run:
        cmd.append('--dry-run')
    return run_command(cmd)


def run_full_pipeline(max_pages=0, pdp_limit=0):
    """Execute end-to-end pipeline: Category Crawl -> PDP Extraction -> Master SKU Sync"""
    print("\n" + "#" * 75)
    print("            STARTING FULL AUTOMATED END-TO-END PIPELINE")
    print("#" * 75)

    # 1. Category Crawl
    ok1 = step_crawl_category(max_pages=max_pages, now=True)
    if not ok1:
        print("[!] Category crawl encountered issues or was stopped. Continuing to PDP...")

    # 2. PDP Crawl
    ok2 = step_crawl_pdp(limit=pdp_limit, now=True)
    if not ok2:
        print("[!] PDP crawl encountered issues or was stopped. Continuing to SKU sync...")

    # 3. Master SKU & Catalog Sync
    ok3 = step_sync_catalog(marketplace='all')

    print("\n" + "#" * 75)
    print("            FULL PIPELINE EXECUTION COMPLETED")
    print("#" * 75)
    print_status_dashboard()


def step_daily_update(max_pages=3):
    """
    Daily Product Details Update:
    Crawls search listings to refresh current prices, ratings, and reviews,
    then updates scentkhoj.products and logs price history shifts.
    """
    print("\n" + "=" * 75)
    print("      DAILY PRODUCT DETAILS UPDATE & PRICE HISTORY TRACKER")
    print("=" * 75)
    print("  1. Refreshing Amazon search listings & live prices...")
    step_crawl_category(max_pages=max_pages, now=True)
    step_crawl_brands(max_pages=max_pages, now=True)

    print("\n  2. Syncing updated prices to Master Catalog & recording price shifts...")
    step_sync_catalog(marketplace='all')

    print("\n" + "=" * 75)
    print("      DAILY PRODUCT DETAILS & PRICE HISTORY UPDATE COMPLETE")
    print("=" * 75)
    print_status_dashboard()


def interactive_menu():
    """Interactive console menu for user selection"""
    while True:
        print("\n" + "=" * 75)
        print(f"       MAKEUPKHOJ AMAZON CRAWLER & CATALOG RUNNER ({DB_NAME})")
        print("=" * 75)
        print("  [1] Crawl Makeup Categories    (amazon_makeup_urls.json - 24 categories)")
        print("  [2] Crawl Brand Listings       (perfume-brand.txt / makeup brands)")
        print("  [3] Crawl Product Details/PDP  (Extract PDP specs: shade, finish, ingredients)")
        print("  [4] Sync Master SKUs & Catalog (Cross-marketplace matching: ALL)")
        print("  [5] Sync Amazon SKUs Only      (sync_catalog_skus.js --marketplace=amazon)")
        print("  [6] FULL AUTOMATED PIPELINE    (Category Crawl -> PDP Scraper -> Master SKUs)")
        print("  [7] View Database Status       (Records & coverage summary)")
        print("  [8] Daily Product Details Update (Refresh prices, reviews & track price history)")
        print("  [q] Exit")
        print("=" * 75)

        choice = input("  Select an option [1-8, q]: ").strip().lower()

        if choice == '1':
            pages_in = input("  Enter max pages per URL (0 for all pages) [0]: ").strip()
            max_p = int(pages_in) if pages_in.isdigit() else 0
            step_crawl_category(max_pages=max_p, now=True)
        elif choice == '2':
            pages_in = input("  Enter max pages per URL (0 for all pages) [0]: ").strip()
            max_p = int(pages_in) if pages_in.isdigit() else 0
            step_crawl_brands(max_pages=max_p, now=True)
        elif choice == '3':
            lim_in = input("  Enter limit of ASINs to scrape (0 for all pending) [0]: ").strip()
            lim = int(lim_in) if lim_in.isdigit() else 0
            step_crawl_pdp(limit=lim, now=True)
        elif choice == '4':
            step_sync_catalog(marketplace='all')
        elif choice == '5':
            step_sync_catalog(marketplace='amazon')
        elif choice == '6':
            pages_in = input("  Enter max pages per category URL (0 for all pages) [0]: ").strip()
            max_p = int(pages_in) if pages_in.isdigit() else 0
            lim_in = input("  Enter PDP scrape limit (0 for all pending) [0]: ").strip()
            lim = int(lim_in) if lim_in.isdigit() else 0
            run_full_pipeline(max_pages=max_p, pdp_limit=lim)
        elif choice == '7':
            print_status_dashboard()
        elif choice == '8':
            pages_in = input("  Enter max pages per URL to refresh [3]: ").strip()
            max_p = int(pages_in) if pages_in.isdigit() and int(pages_in) > 0 else 3
            step_daily_update(max_pages=max_p)
        elif choice in ('q', 'exit', 'quit'):
            print("\n  Exiting. Have a great day!\n")
            break
        else:
            print("\n  [!] Invalid selection. Please enter 1-8 or q.")


def main():
    parser = argparse.ArgumentParser(description="ScentKhoj Master Pipeline Runner")
    parser.add_argument('--category', action='store_true', help="Crawl mixed category URLs from fragrance.txt")
    parser.add_argument('--brands', action='store_true', help="Crawl brand URLs from perfume-brand.txt")
    parser.add_argument('--pdp', action='store_true', help="Crawl product PDP details and fill pending brands")
    parser.add_argument('--sync-skus', action='store_true', help="Run Master SKU & Catalog Sync (sync_catalog_skus.js)")
    parser.add_argument('--marketplace', type=str, default='all', choices=['all', 'amazon', 'flipkart', 'myntra'], help="Marketplace for SKU sync")
    parser.add_argument('--full', action='store_true', help="Run full automated pipeline (Category -> PDP -> SKUs)")
    parser.add_argument('--daily-update', action='store_true', help="Run daily refresh of product prices, reviews & track price history")
    parser.add_argument('--status', action='store_true', help="Display current MongoDB database status and exit")
    parser.add_argument('--max-pages', type=int, default=0, help="Max pages per listing URL (0 = all)")
    parser.add_argument('--limit', type=int, default=0, help="Limit number of items to scrape/sync (0 = all)")
    parser.add_argument('--dry-run', action='store_true', help="Perform dry-run without writing to DB")

    args = parser.parse_args()

    # If status flag requested
    if args.status:
        print_status_dashboard()
        return

    # Direct CLI actions
    if args.daily_update:
        step_daily_update(max_pages=args.max_pages if args.max_pages > 0 else 3)
    elif args.category:
        step_crawl_category(max_pages=args.max_pages, now=True)
    elif args.brands:
        step_crawl_brands(max_pages=args.max_pages, now=True)
    elif args.pdp:
        step_crawl_pdp(limit=args.limit, now=True)
    elif args.sync_skus:
        step_sync_catalog(marketplace=args.marketplace, limit=args.limit, dry_run=args.dry_run)
    elif args.full:
        run_full_pipeline(max_pages=args.max_pages, pdp_limit=args.limit)
    else:
        # Default to interactive menu
        interactive_menu()


if __name__ == '__main__':
    main()
