# MakeupKhoj Multi-Marketplace Crawler Suite

High-speed, resilient multi-marketplace web crawler and Product Details Page (PDP) extraction suite tailored for Indian makeup and cosmetic e-commerce platforms.

Supports all **81 category URLs** across the top 4 beauty marketplaces:
* **Nykaa** (28 categories)
* **Amazon India** (24 categories)
* **Flipkart** (16 categories)
* **Myntra** (13 categories)
* *(Optional)* **Tata CLiQ**

---

## 1. Database Architecture & Safety (Option 1)

All makeup crawlers exclusively write to the dedicated **`makeupkhoj`** MongoDB database. Each marketplace stores its full product lifecycle (listing cards + enriched PDP specs in-place) in its own dedicated collection:

| Marketplace | Dedicated Collection | Master Product Catalog | Master Brands Directory |
| :--- | :--- | :--- | :--- |
| **Amazon** | `makeupkhoj.amazon_makeupkhoj` | `makeupkhoj.products` | `makeupkhoj.brands` |
| **Flipkart** | `makeupkhoj.flipkart_makeupkhoj` | `makeupkhoj.products` | `makeupkhoj.brands` |
| **Myntra** | `makeupkhoj.myntra_makeupkhoj` | `makeupkhoj.products` | `makeupkhoj.brands` |
| **Nykaa** | `makeupkhoj.nykaa_makeupkhoj` | `makeupkhoj.products` | `makeupkhoj.brands` |
| **Tata CLiQ** | `makeupkhoj.tatacliq_makeupkhoj` | `makeupkhoj.products` | `makeupkhoj.brands` |

> [!IMPORTANT]
> **Safety Guardrail Enforced (`db_config.py`)**:
> Any write attempt targeting legacy perfume databases (`amazon`, `flipkart`, `myntra`, `nykaa`, `scentkhoj`) or legacy perfume collections (`amazon_perfume`, `flipkart_perfume`, `myntra_perfume`) is strictly blocked and raises a `ValueError`.

---

## 2. Product Schema & Makeup Taxonomy

Every crawled document is enriched with standardized category taxonomy and cosmetic specifications:

### Taxonomy Fields
* `category`: `"Makeup"`
* `sub_category`: `"Face"`, `"Lips"`, `"Eyes"`, `"Nails"`, or `"Tools"`
* `sub_sub_category`: Leaf category (e.g. `"Foundation"`, `"Lipstick"`, `"Eyeliner"`, `"Nail Polish"`)
* `category_path`: Full canonical hierarchy (e.g. `"Makeup > Face > Foundation"`)
* `category_name`: Canonical name matching the leaf node
* `category_url`: Marketplace listing URL from `Marketplace Makeup URLS`

### Makeup Specification Fields (PDP Enrichment)
* `shade`: Specific shade name / code (e.g. `"01 Ivory"`, `"Ruby Woo"`, `"NC25"`)
* `finish`: `"Matte"`, `"Glossy"`, `"Dewy"`, `"Satin"`, `"Shimmer"`, `"Radiant"`, `"Metallic"`, `"Natural"`, `"Velvet"`
* `formulation`: `"Liquid"`, `"Cream"`, `"Powder"`, `"Gel"`, `"Crayon"`, `"Pencil"`, `"Stick"`, `"Loose Powder"`
* `coverage`: `"Full Coverage"`, `"Medium Coverage"`, `"Sheer Coverage"`, `"Buildable"`
* `skin_type`: `"All Skin Types"`, `"Oily Skin"`, `"Dry Skin"`, `"Combination Skin"`, `"Sensitive Skin"`
* `spf`: SPF rating (e.g. `"SPF 20"`, `"SPF 50+"`)
* `price` & `mrp`: Numerical selling price and maximum retail price in INR
* `price_history`: Array tracking 30-day historical price movements, drops, and hikes
* `rating` & `rating_count`: Live consumer review score and count
* `reviews`: Verified buyer review text, ratings, shade purchased, and user photo attachments

---

## 3. Quick Start: Unified Master Runner

The master runner [`crawler/run_master_crawler.py`](file:///z:/laragon/www/makeupkhoj/crawler/run_master_crawler.py) provides a single interactive CLI dashboard to view catalog counts, launch listing crawlers, and run PDP extractors.

### Check Database Status & Record Counts
```powershell
python crawler/run_master_crawler.py --status
```
*Output will display a table showing configured URLs, total listing cards, and PDP enrichment progress per marketplace.*

### Launch Interactive Control Menu
```powershell
python crawler/run_master_crawler.py
```
*Interactive menu allows selecting any store crawler, crawling all 4 stores sequentially, or triggering PDP spec extraction.*

### Command-Line Arguments (Full vs Limited)

> [!TIP]
> **Looking for full catalog crawl without page limits?**
> See **[`crawler/FULL_CATALOG_CRAWL_COMMANDS.md`](file:///z:/laragon/www/makeupkhoj/crawler/FULL_CATALOG_CRAWL_COMMANDS.md)** for complete commands with `--max-pages 0` (unlimited pages until the end of every category).

```powershell
# FULL CATALOG CRAWL (All Pages & All Categories):
python crawler/run_master_crawler.py --platform nykaa --type listing --max-pages 0
python crawler/run_master_crawler.py --platform amazon --type listing --max-pages 0
python crawler/run_master_crawler.py --platform flipkart --type listing --max-pages 0
python crawler/run_master_crawler.py --platform myntra --type listing --max-pages 0

# Crawl ALL 4 platforms sequentially (FULL CATALOG - All 81 Categories):
python crawler/run_master_crawler.py --platform all --type listing --max-pages 0

# Enrich ALL pending PDP specifications across all marketplaces:
python crawler/run_master_crawler.py --platform all --type pdp --limit 0
```

---

## 4. Individual Marketplace Crawlers

You can also run each marketplace's crawlers directly with granular control.

### A. Nykaa Crawler Suite (`crawler/nykaa/`)

Uses `curl_cffi` with Chrome 124 TLS JA3/JA4 fingerprint impersonation to bypass Akamai bot detection.

#### 1. Listing Crawler (`nykaa_crawler.py`)
```powershell
# Crawl all 28 Nykaa makeup categories (5 pages each):
python crawler/nykaa/nykaa_crawler.py --max-pages 5

# Crawl only Face categories:
python crawler/nykaa/nykaa_crawler.py --sub-cat Face --max-pages 3

# Crawl a specific Nykaa URL:
python crawler/nykaa/nykaa_crawler.py --url "https://www.nykaa.com/makeup/face/face-foundation/c/228" --max-pages 2

# Dry run test (no DB write):
python crawler/nykaa/nykaa_crawler.py --dry-run --max-pages 1
```

#### 2. PDP Extractor (`nykaa_pdp_crawler.py`)
```powershell
# Enrich next 50 pending Nykaa products:
python crawler/nykaa/nykaa_pdp_crawler.py --limit 50 --pending

# Scrape a specific Nykaa product URL directly:
python crawler/nykaa/nykaa_pdp_crawler.py --url "https://www.nykaa.com/charlotte-tilbury-aff-foundation/p/20595581"

# Force re-scrape all Nykaa products to update prices and reviews:
python crawler/nykaa/nykaa_pdp_crawler.py --limit 100 --all
```

---

### B. Amazon Crawler Suite (`crawler/amazon/`)

Uses Playwright browser automation + JS DOM extraction to capture all 24 Amazon makeup categories.

#### 1. Listing Crawler (`amazon_crawler.py`)
```powershell
# Crawl all 24 Amazon makeup categories (all pages):
python crawler/amazon/amazon_crawler.py --now

# Crawl all Amazon categories with max 3 pages per category:
python crawler/amazon/amazon_crawler.py --max-pages 3 --now

# Crawl a specific subcategory (e.g. Lips):
python crawler/amazon/amazon_crawler.py --sub-cat Lips --max-pages 3 --now

# Crawl a specific Amazon URL:
python crawler/amazon/amazon_crawler.py --url "https://www.amazon.in/s?k=Foundation+makeup" --max-pages 2 --now

# Export collection to CSV:
python crawler/amazon/amazon_crawler.py --export-csv
```

#### 2. PDP Extractor (`amazon_pdp_crawler.py`)
```powershell
# Scrape next 50 pending Amazon ASINs:
python crawler/amazon/amazon_pdp_crawler.py --pending --limit 50 --now

# Scrape a specific ASIN directly:
python crawler/amazon/amazon_pdp_crawler.py --asin B08XYZ1234

# Force re-scrape all items for price & review update:
python crawler/amazon/amazon_pdp_crawler.py --all --limit 50 --now
```

#### 3. Amazon Interactive Runner (`run_pipeline.py`)
```powershell
python crawler/amazon/run_pipeline.py
```

---

### C. Flipkart Crawler Suite (`crawler/flipkart/`)

Supports Playwright headful/headless mode and BeautifulSoup parsing for 16 makeup categories.

#### 1. Listing Crawler (`flipkart_crawler.py`)
```powershell
# Crawl all 16 Flipkart categories (3 pages each):
python crawler/flipkart/flipkart_crawler.py --max-pages 3

# Crawl only Eye makeup:
python crawler/flipkart/flipkart_crawler.py --sub-cat Eyes --max-pages 3

# Run with visible browser window for debugging:
python crawler/flipkart/flipkart_crawler.py --headful --max-pages 1

# Test HTML parser on static snippet:
python crawler/flipkart/flipkart_crawler.py --test-snippet
```

#### 2. PDP Extractor (`flipkart_pdp_crawler.py`)
```powershell
# Scrape next 50 pending Flipkart products:
python crawler/flipkart/flipkart_pdp_crawler.py --limit 50 --pending --non-interactive

# Re-scrape 100 products to track price shifts:
python crawler/flipkart/flipkart_pdp_crawler.py --limit 100 --all --non-interactive
```

---

### D. Myntra Crawler Suite (`crawler/myntra/`)

Dual-engine crawler supporting both fast direct HTTP JSON API extraction and Playwright DOM emulation.

#### 1. Listing Crawler (`myntra_crawler.py`)
```powershell
# Crawl all 13 Myntra makeup categories (fast HTTP engine, 3 pages each):
python crawler/myntra/myntra_crawler.py --pages 3 --engine http --non-interactive

# Crawl using Playwright browser engine:
python crawler/myntra/myntra_crawler.py --pages 3 --engine browser --non-interactive

# Filter by subcategory (e.g. Lips):
python crawler/myntra/myntra_crawler.py --sub-cat Lips --pages 2 --non-interactive

# Run price refresh and sync to Master Catalog:
python crawler/myntra/myntra_crawler.py --price-update --pages 3 --non-interactive
```

#### 2. PDP Extractor (`myntra_pdp_crawler.py`)
```powershell
# Scrape 50 pending Myntra products:
python crawler/myntra/myntra_pdp_crawler.py --limit 50 --non-interactive

# Force re-scrape with concurrency=4:
python crawler/myntra/myntra_pdp_crawler.py --limit 100 --force --concurrency 4 --non-interactive
```

---

### E. Tata CLiQ Suite (`crawler/tatacliq/`)

```powershell
# Crawl Tata CLiQ listings:
python crawler/tatacliq/tatacliq_crawler.py --max-pages 5

# Enrich Tata CLiQ PDP details:
python crawler/tatacliq/tatacliq_pdp_crawler.py --limit 50
```

---

## 5. URL Registry & Category Mapper

To inspect or re-generate category mapping files:

```powershell
# Re-generate JSON and TXT URL lists for each platform:
python crawler/category_mapper.py
```

Generated files:
* `crawler/makeup_urls.json` (all 81 URLs with canonical categories)
* `crawler/amazon/amazon_makeup_urls.json` & `.txt` (24 categories)
* `crawler/flipkart/flipkart_makeup_urls.json` & `.txt` (16 categories)
* `crawler/myntra/myntra_makeup_urls.json` & `.txt` (13 categories)
* `crawler/nykaa/nykaa_makeup_urls.json` & `.txt` (28 categories)

---

## 6. Environment & Dependencies

### Environment File (`.env`)
Ensure your root `.env` file contains your MongoDB connection string:
```env
MONGODB_URI=mongodb://admin:8ko92AWggrY2%21@38.45.64.201:27017/?authSource=admin
MASTER_DB=makeupkhoj
```

### Python Dependencies
Install required packages:
```powershell
pip install pymongo python-dotenv curl_cffi beautifulsoup4 httpx playwright
playwright install chromium
```

