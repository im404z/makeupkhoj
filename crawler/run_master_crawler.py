#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MakeupKhoj Unified Master Crawler CLI - run_master_crawler.py
=============================================================
Unified interactive runner & CLI tool to launch, manage, and monitor
crawlers across all 4 major beauty marketplaces for MakeupKhoj:
  - Amazon    (24 makeup categories) -> makeupkhoj.amazon_makeupkhoj
  - Flipkart  (16 makeup categories) -> makeupkhoj.flipkart_makeupkhoj
  - Myntra    (13 makeup categories) -> makeupkhoj.myntra_makeupkhoj
  - Nykaa     (28 makeup categories) -> makeupkhoj.nykaa_makeupkhoj
  - Tata CLiQ (Optional)             -> makeupkhoj.tatacliq_makeupkhoj

Safety Guarantee:
  Guaranteed zero-touch on existing perfume databases (amazon, flipkart, myntra, nykaa, scentkhoj).
  All writes strictly directed to 'makeupkhoj' database collections.

Usage:
  # Interactive mode:
  python crawler/run_master_crawler.py

  # Quick status check:
  python crawler/run_master_crawler.py --status

  # Run Nykaa 3 pages per category:
  python crawler/run_master_crawler.py --platform nykaa --type listing --max-pages 3

  # Run Flipkart PDP crawler for 50 items:
  python crawler/run_master_crawler.py --platform flipkart --type pdp --limit 50
"""

import os
import sys
import subprocess
import argparse
from typing import Dict, Any
from pymongo import MongoClient
from dotenv import load_dotenv

# Ensure UTF-8 console output on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        pass

# Setup paths and imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..'))

if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from db_config import get_db, COLLECTIONS, DB_NAME, DEFAULT_MONGO_URI, validate_db_safety
from category_mapper import get_marketplace_urls, parse_marketplace_urls


def get_marketplace_stats() -> Dict[str, Any]:
    """Fetch live record counts and PDP enrichment rates from makeupkhoj"""
    try:
        validate_db_safety(DB_NAME)
        client = MongoClient(DEFAULT_MONGO_URI, serverSelectionTimeoutMS=4000)
        db = client[DB_NAME]

        stats = {
            'db_name': DB_NAME,
            'master_products': db['products'].count_documents({}),
            'master_brands': db['brands'].count_documents({}),
            'marketplaces': {}
        }

        for mkt, col_name in COLLECTIONS.items():
            if mkt in ['master_products', 'master_brands']:
                continue
            col = db[col_name]
            total = col.count_documents({})
            pdp_done = col.count_documents({'pdp_scraped': True})
            stats['marketplaces'][mkt] = {
                'collection': col_name,
                'total': total,
                'pdp_scraped': pdp_done,
                'pending_pdp': total - pdp_done,
                'configured_urls': len(get_marketplace_urls(mkt))
            }

        client.close()
        return stats
    except Exception as e:
        return {'error': str(e)}


def print_dashboard():
    """Print an executive status dashboard of the MakeupKhoj catalog"""
    stats = get_marketplace_stats()
    print("\n" + "=" * 78)
    print(f"               MAKEUPKHOJ MULTI-MARKETPLACE CATALOG DASHBOARD")
    print(f"                       Target Database: '{DB_NAME}'")
    print("=" * 78)

    if 'error' in stats:
        print(f"  [ERROR] MongoDB Connection: {stats['error']}")
        print("=" * 78 + "\n")
        return

    print(f"  Unified Master Catalog ({DB_NAME}.products): {stats['master_products']:,} unique products")
    print(f"  Master Brands Directory ({DB_NAME}.brands):   {stats['master_brands']:,} verified brands")
    print("-" * 78)
    print(f"  {'Marketplace':<12} | {'Collection':<22} | {'Config URLs':<11} | {'Total Cards':<11} | {'PDP Done':<9}")
    print("-" * 78)

    total_cards = 0
    total_pdps = 0
    for mkt, data in stats['marketplaces'].items():
        total_cards += data['total']
        total_pdps += data['pdp_scraped']
        print(
            f"  {mkt.capitalize():<12} | "
            f"{data['collection']:<22} | "
            f"{data['configured_urls']:<11} | "
            f"{data['total']:<11,} | "
            f"{data['pdp_scraped']:<9,}"
        )

    print("-" * 78)
    total_urls = len(parse_marketplace_urls())
    print(f"  {'TOTAL':<12} | {'All 5 Collections':<22} | {total_urls:<11} | {total_cards:<11,} | {total_pdps:<9,}")
    print("=" * 78 + "\n")


def execute_subcommand(cmd, desc="Running task"):
    """Execute python subprocess command with live output streaming"""
    print("\n" + "=" * 78)
    print(f" >>> {desc.upper()} <<<")
    print(f" Command: {' '.join(cmd)}")
    print("=" * 78 + "\n")
    try:
        proc = subprocess.run(cmd, cwd=PROJECT_ROOT)
        return proc.returncode == 0
    except KeyboardInterrupt:
        print("\n[!] Process interrupted by user.")
        return False
    except Exception as e:
        print(f"\n[ERROR] Command failed: {e}")
        return False


# --- RUNNER ROUTINES ---

def run_amazon_listing(max_pages=0):
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, 'amazon', 'amazon_crawler.py')]
    if max_pages > 0:
        cmd.extend(['--max-pages', str(max_pages)])
    cmd.append('--now')
    return execute_subcommand(cmd, "Amazon Makeup Listing Crawler (24 Categories)")


def run_amazon_pdp(limit=0):
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, 'amazon', 'amazon_pdp_crawler.py'), '--pending']
    if limit > 0:
        cmd.extend(['--limit', str(limit)])
    else:
        cmd.extend(['--limit', '0'])
    cmd.append('--now')
    return execute_subcommand(cmd, "Amazon Makeup PDP Spec Extractor")


def run_flipkart_listing(max_pages=0, headful=False):
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, 'flipkart', 'flipkart_crawler.py'), '--max-pages', str(max_pages)]
    if headful:
        cmd.append('--headful')
    return execute_subcommand(cmd, "Flipkart Makeup Listing Crawler (16 Categories)")


def run_flipkart_pdp(limit=0, headful=False):
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, 'flipkart', 'flipkart_pdp_crawler.py'), '--pending', '--non-interactive']
    if limit > 0:
        cmd.extend(['--limit', str(limit)])
    return execute_subcommand(cmd, "Flipkart Makeup PDP Spec Extractor")


def run_myntra_listing(max_pages=0, headful=False):
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, 'myntra', 'myntra_crawler.py'), '--pages', str(max_pages), '--non-interactive']
    if headful:
        cmd.extend(['--engine', 'browser'])
    return execute_subcommand(cmd, "Myntra Makeup Listing Crawler (13 Categories)")


def run_myntra_pdp(limit=0, headful=False):
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, 'myntra', 'myntra_pdp_crawler.py'), '--non-interactive']
    if limit > 0:
        cmd.extend(['--limit', str(limit)])
    return execute_subcommand(cmd, "Myntra Makeup PDP Spec Extractor")


def run_nykaa_listing(max_pages=0):
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, 'nykaa', 'nykaa_crawler.py'), '--max-pages', str(max_pages)]
    return execute_subcommand(cmd, "Nykaa Makeup Listing Crawler (28 Categories)")


def run_nykaa_pdp(limit=0):
    cmd = [sys.executable, os.path.join(SCRIPT_DIR, 'nykaa', 'nykaa_pdp_crawler.py'), '--pending']
    if limit > 0:
        cmd.extend(['--limit', str(limit)])
    else:
        cmd.extend(['--limit', '0'])
    return execute_subcommand(cmd, "Nykaa Makeup PDP Spec Extractor")


def run_all_listings(max_pages=0):
    """Run all 4 marketplace listing crawlers sequentially"""
    print("\n" + "#" * 78)
    print("      LAUNCHING ALL 4 MARKETPLACE LISTING CRAWLERS SEQUENTIALLY")
    print(f"      Mode: {'FULL CATALOG (All Pages)' if max_pages == 0 else f'Max {max_pages} pages per category'}")
    print("#" * 78)
    run_nykaa_listing(max_pages=max_pages)
    run_myntra_listing(max_pages=max_pages)
    run_flipkart_listing(max_pages=max_pages)
    run_amazon_listing(max_pages=max_pages)
    print("\n[COMPLETE] All 4 marketplace listing crawls finished.")
    print_dashboard()


def run_all_pdps(limit=0):
    """Run all 4 marketplace PDP detail crawlers sequentially"""
    print("\n" + "#" * 78)
    print("      LAUNCHING ALL 4 MARKETPLACE PDP SPEC EXTRACTORS SEQUENTIALLY")
    print(f"      Mode: {'ALL PENDING PRODUCTS' if limit == 0 else f'Max {limit} products per marketplace'}")
    print("#" * 78)
    run_nykaa_pdp(limit=limit)
    run_myntra_pdp(limit=limit)
    run_flipkart_pdp(limit=limit)
    run_amazon_pdp(limit=limit)
    print("\n[COMPLETE] All PDP extractions finished.")
    print_dashboard()


# --- INTERACTIVE MENU ---

def interactive_menu():
    """Interactive command-line control center"""
    while True:
        print_dashboard()
        print("Select an action to perform:")
        print("  --- FULL LISTING CRAWLERS (ALL Categories & ALL Pages) ---")
        print("  [1] Run Nykaa Makeup Listing Crawler     (28 categories - FULL)")
        print("  [2] Run Myntra Makeup Listing Crawler    (13 categories - FULL)")
        print("  [3] Run Flipkart Makeup Listing Crawler  (16 categories - FULL)")
        print("  [4] Run Amazon Makeup Listing Crawler    (24 categories - FULL)")
        print("  [5] Run ALL 4 Marketplace Listing Crawlers Sequentially (FULL)")
        print()
        print("  --- FULL PDP SPEC EXTRACTORS (Shades, Finish, Formulation, Reviews) ---")
        print("  [6] Run Nykaa PDP Detail Extractor       (ALL pending items)")
        print("  [7] Run Myntra PDP Detail Extractor      (ALL pending items)")
        print("  [8] Run Flipkart PDP Detail Extractor    (ALL pending items)")
        print("  [9] Run Amazon PDP Detail Extractor      (ALL pending items)")
        print("  [10] Run ALL Marketplace PDP Extractor   (ALL pending items)")
        print()
        print("  --- UTILITIES ---")
        print("  [11] Refresh Status Dashboard")
        print("  [q] Exit")
        print("=" * 78)

        choice = input("Enter choice [1-11, q]: ").strip().lower()

        if choice == '1':
            pages_in = input("Max pages per category [0 for ALL / FULL, default: 0]: ").strip()
            pages = int(pages_in) if pages_in.isdigit() else 0
            run_nykaa_listing(max_pages=pages)
        elif choice == '2':
            pages_in = input("Max pages per category [0 for ALL / FULL, default: 0]: ").strip()
            pages = int(pages_in) if pages_in.isdigit() else 0
            run_myntra_listing(max_pages=pages)
        elif choice == '3':
            pages_in = input("Max pages per category [0 for ALL / FULL, default: 0]: ").strip()
            pages = int(pages_in) if pages_in.isdigit() else 0
            run_flipkart_listing(max_pages=pages)
        elif choice == '4':
            pages_in = input("Max pages per category [0 for ALL / FULL, default: 0]: ").strip()
            pages = int(pages_in) if pages_in.isdigit() else 0
            run_amazon_listing(max_pages=pages)
        elif choice == '5':
            pages_in = input("Max pages per category across ALL stores [0 for ALL / FULL, default: 0]: ").strip()
            pages = int(pages_in) if pages_in.isdigit() else 0
            run_all_listings(max_pages=pages)
        elif choice == '6':
            lim_in = input("Max products to scrape [0 for ALL pending, default: 0]: ").strip()
            lim = int(lim_in) if lim_in.isdigit() else 0
            run_nykaa_pdp(limit=lim)
        elif choice == '7':
            lim_in = input("Max products to scrape [0 for ALL pending, default: 0]: ").strip()
            lim = int(lim_in) if lim_in.isdigit() else 0
            run_myntra_pdp(limit=lim)
        elif choice == '8':
            lim_in = input("Max products to scrape [0 for ALL pending, default: 0]: ").strip()
            lim = int(lim_in) if lim_in.isdigit() else 0
            run_flipkart_pdp(limit=lim)
        elif choice == '9':
            lim_in = input("Max products to scrape [0 for ALL pending, default: 0]: ").strip()
            lim = int(lim_in) if lim_in.isdigit() else 0
            run_amazon_pdp(limit=lim)
        elif choice == '10':
            lim_in = input("Max products per store [0 for ALL pending, default: 0]: ").strip()
            lim = int(lim_in) if lim_in.isdigit() else 0
            run_all_pdps(limit=lim)
        elif choice == '11':
            pass  # Re-loops and reprints dashboard
        elif choice in ('q', 'exit', 'quit'):
            print("\nExiting. Good luck with MakeupKhoj!\n")
            break
        else:
            print("\n[!] Invalid choice. Please enter a valid number or 'q'.")


def main():
    parser = argparse.ArgumentParser(description="MakeupKhoj Multi-Marketplace Crawler Control CLI")
    parser.add_argument('--platform', choices=['amazon', 'flipkart', 'myntra', 'nykaa', 'all'], help="Target platform to crawl")
    parser.add_argument('--type', choices=['listing', 'pdp', 'all'], default='listing', help="Crawler type: listing cards or deep PDP specs")
    parser.add_argument('--max-pages', type=int, default=0, help="Max pages per listing URL [default: 0 = ALL / FULL CATALOG]")
    parser.add_argument('--limit', type=int, default=0, help="Max products to scrape for PDP [default: 0 = ALL PENDING]")
    parser.add_argument('--status', action='store_true', help="Print current status dashboard and exit")
    parser.add_argument('--headful', action='store_true', help="Run browser in headful visible mode (Flipkart/Myntra)")

    args = parser.parse_args()

    if args.status:
        print_dashboard()
        return

    if args.platform:
        if args.platform == 'all':
            if args.type in ['listing', 'all']:
                run_all_listings(max_pages=args.max_pages)
            if args.type in ['pdp', 'all']:
                run_all_pdps(limit=args.limit)
        elif args.platform == 'nykaa':
            if args.type in ['listing', 'all']:
                run_nykaa_listing(max_pages=args.max_pages)
            if args.type in ['pdp', 'all']:
                run_nykaa_pdp(limit=args.limit)
        elif args.platform == 'myntra':
            if args.type in ['listing', 'all']:
                run_myntra_listing(max_pages=args.max_pages, headful=args.headful)
            if args.type in ['pdp', 'all']:
                run_myntra_pdp(limit=args.limit, headful=args.headful)
        elif args.platform == 'flipkart':
            if args.type in ['listing', 'all']:
                run_flipkart_listing(max_pages=args.max_pages, headful=args.headful)
            if args.type in ['pdp', 'all']:
                run_flipkart_pdp(limit=args.limit, headful=args.headful)
        elif args.platform == 'amazon':
            if args.type in ['listing', 'all']:
                run_amazon_listing(max_pages=args.max_pages)
            if args.type in ['pdp', 'all']:
                run_amazon_pdp(limit=args.limit)
    else:
        interactive_menu()


if __name__ == '__main__':
    main()
