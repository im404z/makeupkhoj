# ScentKhoj Nykaa Fragrance Crawler Suite

High-speed, Akamai-bypassing listing crawler for the **Nykaa Fragrance Catalog**.
Extracts verified product details, exact pricing, ratings, reviews, tags, and performs high-precision brand extraction from the product title.

---

## 1. Features
- **Akamai Bot Protection Bypass**: Uses TLS JA3/JA4 fingerprint impersonation (`curl_cffi` Chrome 124) to bypass Akamai ghost edge blocking without needing slow headless browsers.
- **Live Price Shift Tracking & Master SKU Sync**: Detects live price changes on every card against previously saved documents, logs `[PRICE DROP]` / `[PRICE HIKE]`, pushes to `price_history`, updates `price_last_checked`, and syncs in real-time to `scentkhoj.products`.
- **Configurable Pagination**: Crawls from page 1 up to page 222 (the full fragrance category catalog).
- **High-Precision Brand Extraction**: Evaluates titles against a reference lexicon of over 1,000+ brands, with longest-match precedence and URL slug verification.
- **MongoDB Upserts**: Upserts in real-time into database `nykaa`, collection `products` using unique key `NYK-{productId}`.
- **Multiple Export Formats**: Supports direct MongoDB upserting, CSV output, and JSON output.

---

## 2. Directory Structure
```
crawler/nykaa/
├── nykaa_crawler.py       # Main listing crawler & brand extractor
├── nykaa_pdp_crawler.py   # Product Details (PDP) catalog & reviews extractor
└── README.md              # Documentation and execution guide
```

---

## 3. Usage & CLI Commands

### A. Listing Crawler (`nykaa_crawler.py`)
```bash
# Crawl 10 pages by default:
python crawler/nykaa/nykaa_crawler.py

# Crawl 5 pages:
python crawler/nykaa/nykaa_crawler.py --max-pages 5

# Full catalog up to 222 pages:
python crawler/nykaa/nykaa_crawler.py --max-pages 222

# Start from page 10:
python crawler/nykaa/nykaa_crawler.py --start-page 10 --max-pages 20

# Export to CSV / JSON:
python crawler/nykaa/nykaa_crawler.py --max-pages 10 --export all
```

### B. Product Details (PDP) Catalog Extractor (`nykaa_pdp_crawler.py`)
```bash
# 1. Scrape all PENDING products only (unscraped products):
python crawler/nykaa/nykaa_pdp_crawler.py --pending --limit 0
# or top 50 pending:
python crawler/nykaa/nykaa_pdp_crawler.py --pending --limit 50

# 2. Re-crawl ALL CATALOG products (detects price changes, records price history, updates reviews & ratings):
python crawler/nykaa/nykaa_pdp_crawler.py --all --limit 0
# or re-crawl top 50:
python crawler/nykaa/nykaa_pdp_crawler.py --all --limit 50

# 3. Scrape a specific product URL directly:
python crawler/nykaa/nykaa_pdp_crawler.py --url "https://www.nykaa.com/moi-by-nykaa-joie-de-vivre-eau-de-parfum-luxury-perfume-for-women/p/17493667"

# 4. Interactive menu (select 1 for Pending, 2 for All Catalog):
python crawler/nykaa/nykaa_pdp_crawler.py
```

---

## 4. Fields Extracted per PDP Document (`nykaa.product_data`)

| Field | Description |
| :--- | :--- |
| `id` | Unique ID (`NYK-{productId}`) |
| `title` | Full untruncated product title |
| `brand` | Verified perfume brand name |
| `size` / `pack_size` | Bottle volume (e.g. `100ml`) |
| `price` / `mrp` / `discount` | Live selling price, MRP, and discount percentage |
| `rating` / `rating_count` | Overall star rating and verified ratings count |
| `rating_breakdown` | 5-star, 4-star, 3-star, 2-star, 1-star counts |
| `breadcrumbs` | Full taxonomy path (e.g. `Home > Fragrance > Womens Fragrance > Perfumes (EDT & EDP)`) |
| `pyramid_notes` | Fragrance notes (Top notes, Heart notes, Base notes, Olfactory family) |
| `images` | High-resolution bottle gallery images |
| `customer_photos` | Photo rail from verified buyers |
| `variants` | Available bottle sizes and shade variants with SKU and pricing |
| `reviews` | Verified customer reviews (author, rating, date, shade, title, text, photos, helpful count) |
| `bestseller_tag` | Best-seller rank and category tag (e.g. `#9 BESTSELLER in Perfumes (EDT & EDP)`) |
| `seller_name` | Official seller name (e.g. `Nykaa E retail limited`) |
| `expiry_date` | Product expiration date |
| `country_of_origin` | Manufacturing origin country (e.g. `India`) |
| `description` | Full text & A+ rich HTML product description |

---

## 5. Master Control Suite Integration (`run_crawler.py`)

All crawlers can be triggered directly via the root control hub:
```bash
# Interactive Menu
python run_crawler.py

# Direct Listings Crawl
python run_crawler.py --nykaa --max-pages 10

# Direct PDP Catalog Scraping
python run_crawler.py --nykaa-pdp --limit 50

# Nykaa Daily Refresh (Listings + PDPs)
python run_crawler.py --daily-update-nykaa --max-pages 3 --limit 50

# View Database Metrics
python run_crawler.py --status
```
