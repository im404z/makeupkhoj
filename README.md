# MakeupKhoj 💄

**MakeupKhoj** is an automated multi-marketplace product comparison and catalog intelligence platform for Indian cosmetics and beauty products.

It crawls, indexes, and tracks real-time pricing, discounts, shade varieties, formulation specs, and verified buyer reviews across **Nykaa**, **Amazon India**, **Flipkart**, and **Myntra**.

---

## 🚀 Quick Commands

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

