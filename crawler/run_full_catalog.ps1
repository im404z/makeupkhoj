# ==============================================================================
# MakeupKhoj Full Catalog Automated Crawl Script (PowerShell)
# Crawls 100% of all 81 categories across Nykaa, Myntra, Flipkart, and Amazon
# ==============================================================================

Write-Host "==============================================================================" -ForegroundColor Magenta
Write-Host "             STARTING MAKEUPKHOJ FULL CATALOG CRAWLER (81 CATEGORIES)         " -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Magenta

# Check status first
python crawler/run_master_crawler.py --status

# 1. Nykaa (28 categories)
Write-Host "`n>>> [1/4] Crawling 100% of Nykaa (28 Categories, All Pages)..." -ForegroundColor Yellow
python crawler/run_master_crawler.py --platform nykaa --type listing --max-pages 0

# 2. Myntra (13 categories)
Write-Host "`n>>> [2/4] Crawling 100% of Myntra (13 Categories, All Pages)..." -ForegroundColor Yellow
python crawler/run_master_crawler.py --platform myntra --type listing --max-pages 0

# 3. Flipkart (16 categories)
Write-Host "`n>>> [3/4] Crawling 100% of Flipkart (16 Categories, All Pages)..." -ForegroundColor Yellow
python crawler/run_master_crawler.py --platform flipkart --type listing --max-pages 0

# 4. Amazon (24 categories)
Write-Host "`n>>> [4/4] Crawling 100% of Amazon (24 Categories, All Pages)..." -ForegroundColor Yellow
python crawler/run_master_crawler.py --platform amazon --type listing --max-pages 0

# Final status
Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host "            FULL LISTING CRAWL COMPLETED ACROSS ALL 4 MARKETPLACES             " -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
python crawler/run_master_crawler.py --status

