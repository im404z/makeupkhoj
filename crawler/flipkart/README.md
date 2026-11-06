# Flipkart Perfume Crawler for ScentKhoj

A high-performance async crawler designed for Flipkart perfume listing pages. It extracts comprehensive perfume catalog data, automatically normalizes fields into the unified **ScentKhoj** schema, and directly batch upserts items into MongoDB (`flipkart.products`), enabling seamless price comparison alongside Amazon and Myntra.

---

## 🌟 Key Features

1. **Dual Extraction Strategy**:
   - **In-Browser JS Evaluation**: Fast, DOM-native extraction with automatic smooth-scrolling to trigger Flipkart's lazy-loaded product cards and images.
   - **BeautifulSoup4 Fallback**: Clean HTML parsing fallback that works directly on static markup or server-rendered HTML.
2. **Comprehensive Field Extraction**:
   - `id` / `pid`: Unique Flipkart product identifier (e.g. `PERGT2RWAXHBU6N6`).
   - `brand`: Smart brand extractor matching known perfume brands (Denver, Bella Vita, Wild Stone, Fogg, Beardo, etc.) or title prefixes.
   - `title` / `name`: Full un-truncated title from `a.pIpigb[title]` and image `alt` attributes.
   - `subtitle`: Extracted category / demographic tag (e.g. `For Men`, `For Women`).
   - `gender`: Auto-classified into `Men`, `Women`, or `Unisex`.
   - `size`: Standardized volume extraction (e.g. `100 ML`, `50 ML`, `20ML X 4`).
   - `price`: Clean discounted selling price (in INR).
   - `mrp`: Strike-through MRP.
   - `discount` & `discount_percentage`: Discount percentage badge (e.g. `65% OFF`, `65`).
   - `rating`: Star rating out of 5 (e.g. `4.4`).
   - `rating_count` / `reviews_count`: Clean total ratings count (e.g. `120364`).
   - `is_f_assured`: Boolean flag identifying Flipkart Assured verified products.
   - `badge`: Special tags (e.g. `Top Discount of the Sale`, `Value 365`).
   - `image` & `images`: High-resolution Flixcart CDN image URLs.
   - `url`: Clean canonical Flipkart product URL with tracking bloat removed.
   - `crawled_at` & `updated_at`: ISO UTC timestamps for freshness tracking.
3. **Live Price Shift Tracking & Master SKU Sync**:
   - Detects live price changes against previously stored documents.
   - Logs `[PRICE DROP]` or `[PRICE HIKE]` with exact old price -> new price values.
   - Appends entries to `price_history` (`date`, `timestamp`, `price`, `old_price`, `mrp`, `change`, `marketplace`).
   - Tracks `lowest_recorded_price` and `highest_recorded_price`.
   - Real-time updates `price_last_checked` and synchronizes live price and ratings to master SKUs in `scentkhoj.products`.
4. **MongoDB Integration**:
   - Connects to the ScentKhoj MongoDB cluster via environment variables or default URI.
   - Automatically ensures indexes on `id`, `pid`, `brand`, `price`, and `crawled_at`.
   - Uses atomic `bulk_write` with `UpdateOne(..., upsert=True)` so re-running never creates duplicate records.
5. **Backend Server & Admin Panel Integration**:
   - Can be triggered directly from the Admin Panel via **Fast Listing Price Updater**.
   - Registered in [`server/src/marketplaces/flipkart.js`](file:///d:/laragon/www/scentkhoj/server/src/marketplaces/flipkart.js) and [`server/src/marketplaces/index.js`](file:///d:/laragon/www/scentkhoj/server/src/marketplaces/index.js).
   - Automatically appears in ScentKhoj marketplace filter, search, sorting, and PDP comparisons.

---

## 🚀 Usage

### 1. Verification / Snippet Test Mode
Run the built-in parser verification test on the sample Flipkart HTML snippet:
```bash
python crawler/flipkart/flipkart_crawler.py --test-snippet
```

### 2. Crawl 1 Page (Quick Test)
```bash
python crawler/flipkart/flipkart_crawler.py --max-pages 1 --export-csv
```

### 3. Full Crawl (e.g. 5 Pages)
```bash
python crawler/flipkart/flipkart_crawler.py --max-pages 5 --delay 2.5
```

### 4. Headful Debugging Mode
To watch the browser navigate and scroll:
```bash
python crawler/flipkart/flipkart_crawler.py --max-pages 25 --headful
```

### 5. Custom Search Query or URL
```bash
# Custom search query:
python crawler/flipkart/flipkart_crawler.py --query "eau de parfum for men" --max-pages 3

# Specific start URL with custom filters:
python crawler/flipkart/flipkart_crawler.py --url "https://www.flipkart.com/search?q=perfume&otracker=search&marketplace=FLIPKART&p%5B%5D=facets.rating%255B%255D%3D4%2B" --max-pages 3
```

---

## ⚙️ CLI Options

| Option | Default | Description |
|---|---|---|
| `--query` | `perfume` | Search term to query on Flipkart |
| `--url` | `None` | Custom start URL (overrides `--query`) |
| `--max-pages` | `5` | Maximum pages to crawl (0 = unlimited until last page) |
| `--start-page` | `1` | Page number to start crawling from |
| `--delay` | `2.5` | Delay in seconds between page navigations |
| `--headful` | `False` | Run browser in visual headful mode |
| `--export-csv`| `False` | Save crawled records to a CSV file |
| `--csv-file` | `flipkart_perfumes.csv` | Target CSV filename |
| `--mongo-uri` | From `.env` | Custom MongoDB connection string |
| `--mongo-db` | `flipkart` | Target MongoDB database |
| `--mongo-collection` | `products` | Target MongoDB collection |
| `--test-snippet` | `False` | Run parsing verification on provided HTML snippet |

---

## 📂 MongoDB Document Schema

```json
{
  "id": "PERHHPYEKXVH7XUN",
  "pid": "PERHHPYEKXVH7XUN",
  "brand": "OSCAR",
  "name": "OSCAR Big Shot Jazz Club & Forever Oud Intense Perfume Combo | Strong & Long Lasting Eau de Parfum - 200 ml",
  "title": "OSCAR Big Shot Jazz Club & Forever Oud Intense Perfume Combo | Strong & Long Lasting Eau de Parfum - 200 ml",
  "subtitle": "For Men & Women",
  "gender": "Women",
  "size": "200 ML",
  "sizes": "200 ML",
  "currency": "INR",
  "price": 288,
  "mrp": 2298,
  "discount": "87% OFF",
  "discount_percentage": 87,
  "rating": 4.1,
  "rating_count": 1879,
  "reviews_count": 1879,
  "is_f_assured": true,
  "badge": "Value 365",
  "url": "https://www.flipkart.com/oscar-big-shot-jazz-club-forever-oud-intense-perfume-combo-strong-long-lasting-eau-de-parfum-200-ml/p/itm74fc4cc198349?pid=PERHHPYEKXVH7XUN&lid=LSTPERHHPYEKXVH7XUNWJ6DTR",
  "image": "https://rukminim2.flixcart.com/image/612/612/xif0q/perfume/u/p/k/-original-imahrqgx7ncbhdzh.jpeg?q=70",
  "images": [
    "https://rukminim2.flixcart.com/image/612/612/xif0q/perfume/u/p/k/-original-imahrqgx7ncbhdzh.jpeg?q=70"
  ],
  "category_name": "Perfume",
  "marketplace": "flipkart",
  "marketplace_name": "Flipkart",
  "page": 1,
  "crawled_at": "2026-10-24T04:22:19.404324+00:00",
  "updated_at": "2026-10-24T04:22:19.406685+00:00"
}
```
