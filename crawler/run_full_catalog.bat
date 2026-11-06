@echo off
REM ==============================================================================
REM MakeupKhoj Full Catalog Automated Crawl Script (Batch)
REM ==============================================================================

echo ==============================================================================
echo              STARTING MAKEUPKHOJ FULL CATALOG CRAWLER (81 CATEGORIES)
echo ==============================================================================

python crawler\run_master_crawler.py --status

echo.
echo [*] [1/4] Crawling 100%% of Nykaa (28 Categories, All Pages)...
python crawler\run_master_crawler.py --platform nykaa --type listing --max-pages 0

echo.
echo [*] [2/4] Crawling 100%% of Myntra (13 Categories, All Pages)...
python crawler\run_master_crawler.py --platform myntra --type listing --max-pages 0

echo.
echo [*] [3/4] Crawling 100%% of Flipkart (16 Categories, All Pages)...
python crawler\run_master_crawler.py --platform flipkart --type listing --max-pages 0

echo.
echo [*] [4/4] Crawling 100%% of Amazon (24 Categories, All Pages)...
python crawler\run_master_crawler.py --platform amazon --type listing --max-pages 0

echo.
echo ==============================================================================
echo             FULL LISTING CRAWL COMPLETED ACROSS ALL 4 MARKETPLACES
echo ==============================================================================
python crawler\run_master_crawler.py --status
pause

