# MakeupKhoj Full Catalog Crawl Commands (All Categories & All Pages)

This document contains exact, copy-pasteable commands to crawl the **FULL catalog (100% of all pages and all 81 categories)** for each marketplace without any 3-page or 5-page artificial limits.

All data is safely saved directly into the **`makeupkhoj`** MongoDB database.

---

## ⚡ 1. One-Command Full Marketplace Crawls (Master Runner)

Run these from the project root (`z:\laragon\www\makeupkhoj`):

### Crawl 100% of Nykaa (All 28 Categories, All Pages)
```powershell
python crawler/run_master_crawler.py --platform nykaa --type listing --max-pages 0
```

### Crawl 100% of Amazon (All 24 Categories, All Pages)
```powershell
python crawler/run_master_crawler.py --platform amazon --type listing --max-pages 0
```

### Crawl 100% of Flipkart (All 16 Categories, All Pages)
```powershell
python crawler/run_master_crawler.py --platform flipkart --type listing --max-pages 0
```

### Crawl 100% of Myntra (All 13 Categories, All Pages)
```powershell
python crawler/run_master_crawler.py --platform myntra --type listing --max-pages 0
```

### 🚀 Crawl ALL 4 Marketplaces Sequentially (Full Catalog - 81 Categories)
```powershell
python crawler/run_master_crawler.py --platform all --type listing --max-pages 0
```

---

## 🔬 2. Full PDP Detail Extraction (All Unscraped Products)

Once listing cards are collected, run these commands to extract complete specifications (shades, finish, formulation, coverage, skin type, SPF, ingredients, and customer reviews):

### Enrich ALL Pending Nykaa Products
```powershell
python crawler/run_master_crawler.py --platform nykaa --type pdp --limit 0
```

### Enrich ALL Pending Amazon Products
```powershell
python crawler/run_master_crawler.py --platform amazon --type pdp --limit 0
```

### Enrich ALL Pending Flipkart Products
```powershell
python crawler/run_master_crawler.py --platform flipkart --type pdp --limit 0
```

### Enrich ALL Pending Myntra Products
```powershell
python crawler/run_master_crawler.py --platform myntra --type pdp --limit 0
```

### 🚀 Enrich ALL Pending Products Across ALL Marketplaces
```powershell
python crawler/run_master_crawler.py --platform all --type pdp --limit 0
```

---

## 🛠️ 3. Direct Individual Crawler Commands (Full / Unlimited)

If you prefer to invoke individual crawlers directly without the wrapper:

### A. Nykaa Full Crawl (Akamai TLS Impersonation)
```powershell
# 1. Listing Crawl (All 28 Categories, auto-pagination up to page 222 or catalog end):
python crawler/nykaa/nykaa_crawler.py --max-pages 0

# 2. PDP Spec Extractor (All pending items):
python crawler/nykaa/nykaa_pdp_crawler.py --all --limit 0
```

### B. Amazon Full Crawl (Playwright + JS Engine)
```powershell
# 1. Listing Crawl (All 24 Categories, all pages until end of search):
python crawler/amazon/amazon_crawler.py --max-pages 0 --now

# 2. PDP Spec Extractor (All pending ASINs):
python crawler/amazon/amazon_pdp_crawler.py --pending --limit 0 --now
```

### C. Flipkart Full Crawl
```powershell
# 1. Listing Crawl (All 16 Categories, unlimited pagination):
python crawler/flipkart/flipkart_crawler.py --max-pages 0

# 2. PDP Spec Extractor (All pending items, 3 concurrent workers):
python crawler/flipkart/flipkart_pdp_crawler.py --pending --limit 0 --concurrency 3 --non-interactive
```

### D. Myntra Full Crawl
```powershell
# 1. Listing Crawl (All 13 Categories, all pages):
python crawler/myntra/myntra_crawler.py --pages 0 --engine http --non-interactive

# 2. PDP Spec Extractor (All pending items, 3 concurrent workers):
python crawler/myntra/myntra_pdp_crawler.py --limit 0 --concurrency 3 --non-interactive
```

---

## 🎯 4. Full Crawl by Subcategory (All Pages)

If you want to crawl only specific makeup segments completely across all pages:

### Face Makeup Only (Foundation, Concealer, Compact, Blush, Primer, Powder)
```powershell
# Nykaa Face (Full):
python crawler/nykaa/nykaa_crawler.py --sub-cat Face --max-pages 0

# Amazon Face (Full):
python crawler/amazon/amazon_crawler.py --sub-cat Face --max-pages 0 --now

# Flipkart Face (Full):
python crawler/flipkart/flipkart_crawler.py --sub-cat Face --max-pages 0

# Myntra Face (Full):
python crawler/myntra/myntra_crawler.py --sub-cat Face --pages 0 --non-interactive
```

### Lip Makeup Only (Lipstick, Liquid Lipstick, Lip Gloss, Lip Liner, Lip Balm)
```powershell
# Nykaa Lips (Full):
python crawler/nykaa/nykaa_crawler.py --sub-cat Lips --max-pages 0

# Amazon Lips (Full):
python crawler/amazon/amazon_crawler.py --sub-cat Lips --max-pages 0 --now

# Flipkart Lips (Full):
python crawler/flipkart/flipkart_crawler.py --sub-cat Lips --max-pages 0

# Myntra Lips (Full):
python crawler/myntra/myntra_crawler.py --sub-cat Lips --pages 0 --non-interactive
```

### Eye Makeup Only (Kajal, Eyeliner, Mascara, Eyeshadow, Eyebrow, Lashes)
```powershell
# Nykaa Eyes (Full):
python crawler/nykaa/nykaa_crawler.py --sub-cat Eyes --max-pages 0

# Amazon Eyes (Full):
python crawler/amazon/amazon_crawler.py --sub-cat Eyes --max-pages 0 --now

# Flipkart Eyes (Full):
python crawler/flipkart/flipkart_crawler.py --sub-cat Eyes --max-pages 0

# Myntra Eyes (Full):
python crawler/myntra/myntra_crawler.py --sub-cat Eyes --pages 0 --non-interactive
```

### Nails & Tools Only (Nail Polish, Remover, Brushes)
```powershell
# Nykaa Nails (Full):
python crawler/nykaa/nykaa_crawler.py --sub-cat Nails --max-pages 0

# Nykaa Tools & Brushes (Full):
python crawler/nykaa/nykaa_crawler.py --sub-cat Tools --max-pages 0

# Amazon Nails & Tools (Full):
python crawler/amazon/amazon_crawler.py --sub-cat Nails --max-pages 0 --now
python crawler/amazon/amazon_crawler.py --sub-cat Tools --max-pages 0 --now

# Flipkart Nails (Full):
python crawler/flipkart/flipkart_crawler.py --sub-cat Nails --max-pages 0
```

---

## 🌙 5. Overnight / Background Full Crawl (PowerShell)

To run a full marketplace crawl in the background so you can close your terminal:

```powershell
# Run Full Nykaa Crawl in background with log output:
Start-Process python -ArgumentList "crawler/run_master_crawler.py --platform nykaa --type listing --max-pages 0" -RedirectStandardOutput "logs/nykaa_full_crawl.log" -RedirectStandardError "logs/nykaa_full_error.log" -NoNewWindow

# Run Full Amazon Crawl in background:
Start-Process python -ArgumentList "crawler/run_master_crawler.py --platform amazon --type listing --max-pages 0" -RedirectStandardOutput "logs/amazon_full_crawl.log" -RedirectStandardError "logs/amazon_full_error.log" -NoNewWindow

# Run Full Flipkart Crawl in background:
Start-Process python -ArgumentList "crawler/run_master_crawler.py --platform flipkart --type listing --max-pages 0" -RedirectStandardOutput "logs/flipkart_full_crawl.log" -RedirectStandardError "logs/flipkart_full_error.log" -NoNewWindow

# Run Full Myntra Crawl in background:
Start-Process python -ArgumentList "crawler/run_master_crawler.py --platform myntra --type listing --max-pages 0" -RedirectStandardOutput "logs/myntra_full_crawl.log" -RedirectStandardError "logs/myntra_full_error.log" -NoNewWindow
```

---

## 📊 6. Monitoring & Progress Tracking

Check total cards collected and PDPs completed at any time:

```powershell
python crawler/run_master_crawler.py --status
```

Expected live output:
```text
==============================================================================
               MAKEUPKHOJ MULTI-MARKETPLACE CATALOG DASHBOARD
                       Target Database: 'makeupkhoj'
==============================================================================
  Unified Master Catalog (makeupkhoj.products): 0 unique products
  Master Brands Directory (makeupkhoj.brands):   1 verified brands
------------------------------------------------------------------------------
  Marketplace  | Collection             | Config URLs | Total Cards | PDP Done 
------------------------------------------------------------------------------
  Amazon       | amazon_makeupkhoj      | 24          | 12,450      | 4,200    
  Flipkart     | flipkart_makeupkhoj    | 16          | 8,900       | 2,150    
  Myntra       | myntra_makeupkhoj      | 13          | 6,780       | 1,920    
  Nykaa        | nykaa_makeupkhoj       | 28          | 14,200      | 5,300    
  Tatacliq     | tatacliq_makeupkhoj    | 0           | 0           | 0        
------------------------------------------------------------------------------
  TOTAL        | All 5 Collections      | 81          | 42,330      | 13,570   
==============================================================================
```

