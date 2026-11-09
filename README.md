# MakeupKhoj

## Daily usage commands

Run from the project root: `D:\laragon\www\makeupkhoj`. Run one crawler command at a time; do not start these alongside an existing crawler run.

### Daily price update from all marketplace listings

```sh
node crawler/price-update.mjs
```

This scans all configured listing categories and their available pages for Amazon, Flipkart, Myntra and Nykaa. It updates observed prices, MRP, ratings and rating/review counts where listing cards expose them, and discovers new listings. It records actual price changes for the Price Drops page. It does not visit product detail pages or download full customer review text. Existing PDP details and reviews are preserved when absent from listing results. Products not encountered in the listing scan are not refreshed.

The default `--engine auto` uses a browser for Amazon listings and HTTP requests for Flipkart, Myntra and Nykaa. It reads category URLs directly from `crawler/amazon/amazon_makeup_urls.json`, `crawler/flipkart/flipkart_makeup_urls.json`, `crawler/myntra/myntra_makeup_urls.json`, and `crawler/nykaa/nykaa_makeup_urls.json`.

Run all four together:

```sh
node crawler/price-update.mjs --parallel-stores 4 --concurrency 2 --rate 30
```

Myntra can return duplicate or blocked pages over HTTP. The crawler reports these as incomplete, not as a completed category. To opt into browser pagination for Myntra as well as Amazon, add `--browser-stores myntra`. Other stores remain on HTTP. On Windows, Amazon uses installed Chrome when available; set `CRAWLER_BROWSER_CHANNEL=bundled` in `crawler/node/.env` to explicitly use the bundled browser instead.

Individual marketplaces:

```sh
node crawler/price-update.mjs amazon
node crawler/price-update.mjs flipkart
node crawler/price-update.mjs myntra
node crawler/price-update.mjs nykaa
```

Preview without crawling, or try a smaller listing run:

```sh
node crawler/price-update.mjs --plan
node crawler/price-update.mjs amazon --pages 3
```

Explicit listing-only mode and optional proxy/concurrency settings:

```sh
node crawler/refresh.mjs all --mode price-update
node crawler/price-update.mjs --concurrency 3 --rate 30 --parallel-stores 1 --proxy
```

Connections are direct by default. Add `--proxy` to use the configured proxy. `--pages 0` (the default) scans all available pages; `--pages 3` limits each category to three pages. Requests and store parallelism remain configurable. Keep the initial values modest while checking marketplace response quality.

### Update full product details and available reviews

Use PDP refresh separately when you need full review content, product images and specifications:

```sh
node crawler/refresh.mjs amazon --mode pdp
node crawler/refresh.mjs flipkart --mode pdp
node crawler/refresh.mjs myntra --mode pdp
node crawler/refresh.mjs nykaa --mode pdp
node crawler/refresh.mjs all --mode pdp
```

Each command revisits existing products, including already enriched records. Add `--limit 100` for a limited batch per store. The default limit of zero means all stored products.

### Check or stop a crawler

Run these in another terminal while the crawl is active:

```sh
node crawler/node/src/cli.js --status
node crawler/node/src/cli.js --stop
```

Stop requests apply to the Node runner. Wait for its status to stop before launching a different run.

### Website commands

```sh
pm2 start ecosystem.config.js
pm2 status
pm2 logs makeupkhoj-web --lines 100
pm2 restart ecosystem.config.js --only makeupkhoj-web --update-env
pm2 stop makeupkhoj-web
pm2 save
```

The PM2 website uses port **7857**. After changing website code, stop the website, run `npm --prefix website run build`, then restart it only if the build succeeds. A daily crawler refresh does not require rebuilding the website.

### Price drop display settings

Open **Admin > Price drops** to enable or pause the listing, choose 24 hours, 2 days or a custom window, set the maximum number of products, and set products per page. A price drop requires a timestamped reduction from a previous observed selling price; an MRP discount alone does not qualify.

## Website production server

For individual marketplace listing and PDP refresh commands, price history, and admin time-window controls, see [Crawler refresh and price drops](CRAWLER-REFRESH.md).

Start the website with the root `ecosystem.config.js` on port **7857**. See [PM2 setup and domain guide](PM2-SETUP.md) for installation, environment settings, startup, logs, and domain configuration.

```sh
npm --prefix website run build
pm2 start ecosystem.config.js
pm2 save
```

**MakeupKhoj** is an automated multi-marketplace product comparison and catalog intelligence platform for Indian cosmetics and beauty products.

It crawls, indexes, and tracks real-time pricing, discounts, shade varieties, formulation specs, and verified buyer reviews across **Nykaa**, **Amazon India**, **Flipkart**, and **Myntra**.

---

## Legacy Python crawler commands

The daily Node commands above are the recommended workflow. The following Python commands are retained for reference; do not run both runners together.

### View Live Catalog & Database Counts
```powershell
python crawler/run_master_crawler.py --status
```

### Launch Unified Interactive Crawler Menu
```powershell
python crawler/run_master_crawler.py
```

## 🚀 Full Catalog Crawl Commands (All 81 Categories & All Pages)

To crawl the **FULL catalog without page limits** (`--max-pages 0`), run:

```powershell
# Crawl 100% of Nykaa (All 28 Categories, All Pages):
python crawler/run_master_crawler.py --platform nykaa --type listing --max-pages 0

# Crawl 100% of Amazon (All 24 Categories, All Pages):
python crawler/run_master_crawler.py --platform amazon --type listing --max-pages 0

# Crawl 100% of Flipkart (All 16 Categories, All Pages):
python crawler/run_master_crawler.py --platform flipkart --type listing --max-pages 0

# Crawl 100% of Myntra (All 13 Categories, All Pages):
python crawler/run_master_crawler.py --platform myntra --type listing --max-pages 0

# Crawl ALL 4 Marketplaces Sequentially (Full Catalog - 81 Categories):
python crawler/run_master_crawler.py --platform all --type listing --max-pages 0

# Enrich ALL Pending PDP Specifications Across All Marketplaces:
python crawler/run_master_crawler.py --platform all --type pdp --limit 0
```

---

## 📚 Complete Documentation
* 👉 **[Full Catalog Crawl Commands Guide](crawler/FULL_CATALOG_CRAWL_COMMANDS.md)**
* 👉 **[Complete Architecture & Crawler Documentation](crawler/README.md)**

