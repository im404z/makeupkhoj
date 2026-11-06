# Amazon Perfume Crawler & Master Catalog Suite for ScentKhoj

A complete, self-contained crawling and catalog ingestion pipeline for Amazon India perfume products. It extracts search listing cards, detects brands from titles across mixed categories using a 980+ brand dictionary, resolves detailed product specifications and verified brands via PDP crawling, and unifies products into the **ScentKhoj Master Catalog** with cross-marketplace matching, taxonomy classification, and SKU generation.

---

## 🌟 Key Architecture & Capabilities

1. **Dual-Mode Search Crawler ([`perfume-crawler.py`](file:///d:/laragon/www/scentkhoj/crawler/amazon/perfume-crawler.py))**:
   - **Mixed Category Mode** ([`fragrance.txt`](file:///d:/laragon/www/scentkhoj/crawler/amazon/fragrance.txt)): Crawls broad categories (`rh=n:1374298031`) containing thousands of mixed-brand products.
   - **Brand Facet Mode** ([`perfume-brand.txt`](file:///d:/laragon/www/scentkhoj/crawler/amazon/perfume-brand.txt)): Crawls individual brand search facets (`rh=p_123:`).
   - **Live Price Shift Tracking & Master SKU Sync**: Detects live price changes on every card against previously saved documents, logs `[PRICE DROP]` / `[PRICE HIKE]`, pushes to `price_history`, updates `price_last_checked`, and synchronizes in real-time to `scentkhoj.products`.
2. **Intelligent Title Brand Matcher ([`crawler/brands.json`](file:///d:/laragon/www/scentkhoj/crawler/brands.json))**:
   - Uses an authoritative dictionary of **980+ brands** (including *Bath & Body Works*, *Bella Vita Luxury*, *Wild Stone*, *Denver*, *Skinn by Titan*, *Plum*, *Renee*, *The Man Company*, *Ajmal*, *Lattafa*, *Armaf*, etc.).
   - Matches titles with greedy longest-first regex.
   - If detected: records `brand = detected_brand` and `brand_source = 'title_extracted'`.
   - If unknown: marks `brand = null` and `brand_source = 'pending_pdp'` so it is never corrupted with generic `"Perfume"`.
3. **Product Detail Page (PDP) Crawler ([`perfume-product-data.py`](file:///d:/laragon/www/scentkhoj/crawler/amazon/perfume-product-data.py))**:
   - Executes the high-speed in-browser engine [`amazon-product-extractor-logic.js`](file:///d:/laragon/www/scentkhoj/crawler/amazon/amazon-product-extractor-logic.js).
   - Extracts complete specifications, high-res gallery images, ratings, seller, and official verified brand from `#bylineInfo` or specification tables.
   - Automatically back-populates verified brands to `amazon_perfume` and registers new brands into `scentkhoj.brands`.
4. **Master SKU & Taxonomy Synchronizer ([`server/scripts/sync_catalog_skus.js`](file:///d:/laragon/www/scentkhoj/server/scripts/sync_catalog_skus.js))**:
   - Matches Amazon products against existing master SKUs across Flipkart and Myntra using `(brand, volume, concentration, variant_similarity)`.
   - Links products into `mappings.amazon`, updates `store_count` (1, 2, or 3 stores), and recalculates `lowest_price` and `lowest_marketplace`.
   - If new, generates a Master SKU (`SK-AMZ-...`), auto-classifies gender, concentration, size categories, and fragrance families, and updates the brand directory.
5. **Interactive Master Runner ([`run_pipeline.py`](file:///d:/laragon/www/scentkhoj/crawler/amazon/run_pipeline.py))**:
   - Single unified command-line and interactive control hub to run any or all steps effortlessly.

---

## 📁 File Structure

```text
crawler/
├── brands.json                          # Centralized dictionary of 981 clean brand names
└── amazon/
    ├── fragrance.txt                    # Mixed-brand Amazon category URLs (rh=n:1374298031)
    ├── perfume-brand.txt                # Brand-specific facet URLs (rh=p_123:...)
    ├── perfume-crawler.py               # Amazon listing crawler (Playwright + Title Matcher)
    ├── perfume-product-data.py          # Amazon PDP crawler (extracts specs & verified brands)
    ├── amazon-product-extractor-logic.js# In-browser DOM extraction engine evaluated on PDPs
    ├── run_pipeline.py                  # All-in-one Master Python Runner (Interactive & CLI)
    └── README.md                        # Documentation & usage guide
```

---

## 🚀 Quick Start (Easiest Way)

### 1. Interactive Master Pipeline Menu
Launch the interactive numbered menu:
```powershell
python crawler/amazon/run_pipeline.py
```

You will see:
```text
===========================================================================
          SCENTKHOJ CRAWLER & CATALOG MASTER RUNNER
===========================================================================
  [1] Crawl Mixed Categories     (fragrance.txt with Title Brand Detection)
  [2] Crawl Brand Listings       (perfume-brand.txt)
  [3] Crawl Product Details/PDP  (Extract PDP specs & fill pending brands)
  [4] Sync Master SKUs & Catalog (Cross-marketplace matching & taxonomy: ALL)
  [5] Sync Amazon SKUs Only      (sync_catalog_skus.js --marketplace=amazon)
  [6] FULL AUTOMATED PIPELINE    (Category Crawl -> PDP Scraper -> Master SKUs)
  [7] View Database Status       (Records & coverage summary)
  [8] Daily Product Details Update (Refresh prices, reviews & track price history)
  [q] Exit
===========================================================================
```
Simply type the number (1–8) and press Enter.

---

## 💻 CLI Commands (Headless / Automated Execution)

### 1. Crawl Mixed Categories (`fragrance.txt`)
Crawl Amazon category listings with automatic title-based brand detection:
```powershell
# Crawl 5 pages:
python crawler/amazon/run_pipeline.py --category --max-pages 5

# Or run the crawler script directly:
python crawler/amazon/perfume-crawler.py --category --max-pages 5 --now
```

### 2. Crawl Brand-Specific Listings (`perfume-brand.txt`)
Crawl brand facet URLs:
```powershell
# Crawl all brand URLs (3 pages per brand):
python crawler/amazon/run_pipeline.py --brands --max-pages 3

# Or directly:
python crawler/amazon/perfume-crawler.py --brands --max-pages 3 --now
```

### 3. Crawl Custom URLs File
```powershell
python crawler/amazon/perfume-crawler.py --file my_urls.txt --max-pages 2 --now
```

### 4. Extract Detailed PDP Product Data & Track Price Shifts
Extract full product pages, track price changes in price history, and update reviews:
```powershell
# Scrape PENDING ASINs only (unscraped products):
python crawler/amazon/perfume-product-data.py --pending --limit 50 --now

# Re-crawl ALL CATALOG ASINs (tracks price drops/hikes in price_history, updates ratings/reviews):
python crawler/amazon/perfume-product-data.py --all --limit 50 --now
# or re-crawl entire catalog:
python crawler/amazon/perfume-product-data.py --all --now

# Scrape a single specific ASIN:
python crawler/amazon/perfume-product-data.py --asin B0G5GKNL74

# Interactive menu (Choose 1 for Pending, 2 for All Catalog):
python crawler/amazon/perfume-product-data.py
```

### 5. Run Master SKU & Taxonomy Synchronization
Ingest newly scraped Amazon products into the ScentKhoj Master Catalog:
```powershell
# Sync Amazon products only:
node server/scripts/sync_catalog_skus.js --marketplace=amazon

# Sync all marketplaces (Amazon + Flipkart + Myntra):
node server/scripts/sync_catalog_skus.js --marketplace=all

# Test without writing to database:
node server/scripts/sync_catalog_skus.js --marketplace=amazon --limit 20 --dry-run
```

### 6. Full Automated Pipeline
Runs Category Crawl $\rightarrow$ PDP Extraction $\rightarrow$ Master SKU & Taxonomy Sync start-to-finish:
```powershell
python crawler/amazon/run_pipeline.py --full --max-pages 5 --limit 100
```

### 8. Daily Product Details Update & Price History Tracker
Run this daily to re-crawl live search listings, refresh prices, ratings, and review counts, and record price changes into `price_history`:
```powershell
# Interactive runner menu option [8]:
python crawler/amazon/run_pipeline.py

# Direct CLI one-liner:
python crawler/amazon/run_pipeline.py --daily-update --max-pages 3
```
- **What it does**:
  1. Crawls the first `N` pages of all category and brand listings.
  2. Updates current price, ratings, and review counts on `amazon_perfume` without overwriting verified brands.
  3. Executes `sync_catalog_skus.js` to compare prices.
  4. If a price change is detected, appends a record `{ date, timestamp, price, mrp, old_price, change, marketplace }` to `price_history`, updates `lowest_recorded_price` / `highest_recorded_price`, and updates `price_last_checked`.
  5. The product page automatically renders the **Price History & Live Trends** card with current, lowest ever, and all-time price drop badges.

---

## ⚙️ CLI Reference Table

### `run_pipeline.py`

| Option | Type | Description |
|---|---|---|
| `--category` | Flag | Crawl mixed categories from `fragrance.txt` |
| `--brands` | Flag | Crawl brand facets from `perfume-brand.txt` |
| `--pdp` | Flag | Crawl PDP specifications & resolve brands |
| `--sync-skus` | Flag | Run `sync_catalog_skus.js` |
| `--marketplace` | String | `all` (default), `amazon`, `flipkart`, `myntra` |
| `--full` | Flag | Run full pipeline (Category $\rightarrow$ PDP $\rightarrow$ Master SKUs) |
| `--daily-update` | Flag | Refresh prices, ratings & log price history shifts |
| `--status` | Flag | Display MongoDB record counts and coverage |
| `--max-pages` | Integer | Max pages per listing URL (0 = all pages) |
| `--limit` | Integer | Limit number of ASINs to scrape/sync (0 = all) |
| `--dry-run` | Flag | Test catalog sync without saving DB changes |

### `perfume-crawler.py`

| Option | Type | Description |
|---|---|---|
| `--category` | Flag | Crawl mixed category URLs from `fragrance.txt` |
| `--brands` | Flag | Crawl brand URLs from `perfume-brand.txt` |
| `--file FILE` | String | Path to custom text file containing URLs |
| `--url URL` | String | Crawl a single specific Amazon URL |
| `--max-pages N` | Integer | Max pages per listing URL (0 = all pages) |
| `--start-from N`| Integer | Start from URL index (1-based) |
| `--now` | Flag | Start crawling immediately without prompt |
| `--export-csv` | Flag | Export `amazon_perfume` to CSV |

### `perfume-product-data.py`

| Option | Type | Description |
|---|---|---|
| `--limit N` | Integer | Limit number of ASINs to scrape (0 = all pending) |
| `--asin ASIN` | String | Scrape a single specific ASIN |
| `--force` | Flag | Force re-scraping of already scraped ASINs |
| `--now` | Flag | Start scraping immediately without prompt |
| `--export-csv` | Flag | Export `amazon_perfume_products` to CSV |

---

## 🗄️ MongoDB Collections & Schema

| Database | Collection | Role | Key Fields |
|---|---|---|---|
| `amazon` | `amazon_perfume` | Raw listing search cards | `asin`, `title`, `brand`, `brand_source`, `price`, `mrp`, `rating`, `url`, `image` |
| `amazon` | `amazon_perfume_products` | Detailed PDP specifications | `asin`, `brand`, `title`, `specsTable`, `bulletPoints`, `highResImages`, `sellerName` |
| `scentkhoj` | `products` | Master multi-store catalog | `id` (`SK-AMZ-...`), `slug`, `brand`, `gender`, `sizeMl`, `concentration`, `fragranceFamily`, `mappings.amazon`, `mappings.flipkart`, `mappings.myntra`, `store_count`, `lowest_price`, `price_history`, `lowest_recorded_price`, `highest_recorded_price`, `price_last_checked` |
| `scentkhoj` | `brands` | Directory of verified brands | `name`, `slug`, `productCount`, `minPrice`, `maxPrice`, `avgRating`, `marketplaces` |
