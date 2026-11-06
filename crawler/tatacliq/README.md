# ScentKhoj Tata CLiQ Fragrance Crawler

High-speed, API-driven crawler and catalog synchronization engine for the Tata CLiQ Fragrance catalog (`tatacliq.com`).

---

## Architecture Overview

Tata CLiQ exposes a high-performance Search BFF REST API (`searchbff.tatacliq.com/products/mpl/search`) returning rich catalog data:
- Exact selling price & MRP (`price.sellingPrice.doubleValue`, `price.mrpPrice.doubleValue`)
- Stock availability flag (`inStockFlag`)
- Accurate ratings and review count (`averageRating`, `ratingCount`, `totalNoOfReviews`)
- High-resolution gallery imagery
- Direct product URLs & category hierarchies
- Variant counts and style codes

---

## Crawler Features

- **Polite Pagination**: Configurable delays and randomized jitter to avoid rate limits (`--delay 1.2`).
- **Resilient Retry Mechanism**: Automatic retries with exponential backoff on HTTP 429 or 5xx.
- **MongoDB Upserting**: Direct batch upsert into `tatacliq.products` by unique product ID.
- **Price History Tracking**: Maintains `price_history`, `lowest_recorded_price`, and `highest_recorded_price`.
- **High-Precision Brand Extraction**: Resolves brands against 2,000+ curated perfume brands.
- **Export Options**: Export crawled data directly to CSV or JSON via `--export all`.
- **Master Catalog Sync**: Syncs Tata CLiQ listings directly into `scentkhoj.products` under `mappings.tatacliq`.

---

## Usage

### 1. Test Crawling (First 3 Pages)
```bash
python crawler/tatacliq/tatacliq_crawler.py --max-pages 50
```

### 2. Full Polite Crawl (All Pages)
```bash
python crawler/tatacliq/tatacliq_crawler.py --delay 1.2
```

### 3. Crawl and Export to JSON / CSV
```bash
python crawler/tatacliq/tatacliq_crawler.py --max-pages 10 --export all
```

### 4. Crawl & Immediately Sync to Master Catalog
```bash
python crawler/tatacliq/tatacliq_crawler.py --sync-catalog
```

### 5. PDP & Catalog Extractor (tatacliq_pdp_crawler.py)
Extracts deep fragrance notes (Top, Middle, Base notes pyramid), specifications, customer aspect scores, verified buyer reviews, and 2000px high-resolution imagery into `tatacliq.product_data`:

```bash
# 1. Scrape single PDP via direct URL or Product ID:
python crawler/tatacliq/tatacliq_pdp_crawler.py --url "https://www.tatacliq.com/tommy-hilfiger-eau-de-toilette-for-men-100-ml/p-mp000000007904643"

# 2. Parse a local raw HTML file:
python crawler/tatacliq/tatacliq_pdp_crawler.py --html-file path/to/pdp.html --id MP000000007904643

# 3. Batch scrape pending un-scraped products from database:
python crawler/tatacliq/tatacliq_pdp_crawler.py --limit 20 --delay 1.2

# 4. Dry run test without database writes:
python crawler/tatacliq/tatacliq_pdp_crawler.py --url "https://www.tatacliq.com/.../p-mp000000007904643" --dry-run
```
