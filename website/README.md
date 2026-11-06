# MakeupKhoj — Complete Next.js Makeup Discovery & Price Comparison Platform

A modern, production-grade makeup discovery and price-comparison web application matching the **MakeupKhoj** design specifications and assets, powered by **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS**, and **MongoDB**.

---

## 💄 Highlights & Features

- **Multi-Marketplace Comparison**: Live side-by-side price tracking across **Nykaa**, **Amazon**, **Flipkart**, and **Myntra**.
- **100% Real Product Data**: Directly connected to the `makeupkhoj` database (`nykaa_makeupkhoj`, `amazon_makeupkhoj`, `flipkart_makeupkhoj`, `myntra_makeupkhoj`).
- **Comprehensive Makeup Taxonomy**: Dedicated routes and filters for **Lip Makeup**, **Face Makeup**, **Eye Makeup**, **Cheeks**, **Makeup Kits**, **Tools & Brushes**, **Nails**, and **Makeup Remover**, along with all subcategories (Foundation, Concealer, Blush, Lipstick, Kajal, Mascara, etc.).
- **Dynamic Product Detail Pages**: High-resolution galleries, customer review photos strip, shade/finish/coverage attribute pills, genuine ratings & review counters, and direct retailer checkout links.
- **Brand Catalogs**: Alphabetical brand directory covering 1,000+ brands with per-brand dedicated storefronts.
- **Discovery Sections**:
  - `🔥 Trending Now`: Highest engagement & customer-reviewed beauty essentials.
  - `% Top Deals`: Curated products with 15%+ to 60% discounts.
  - `✨ New Arrivals`: Fresh cosmetics launches.
  - `📉 Price Drops`: Real-time price reduction tracking.
  - `LookBook`: Curated styles (Bridal, Natural, Korean, Glam, Office, Party).
- **Comprehensive SEO & Structured Data**:
  - `Organization` & `WebSite` JSON-LD schemas
  - `BreadcrumbList` schema on every nested page
  - `Product`, `Offer`, and genuine `AggregateRating` schemas (only when verified)
  - `ItemList` schema for category and collection pages
  - Dynamic `sitemap.xml` with indexable product, category, and brand URLs
  - Compliant `robots.txt`

---

## 📁 Directory Structure

```
website/
├── public/
│   └── assets/                     # Copied from MakeupKhoj_Assets
│       ├── backgrounds/
│       ├── banners/
│       ├── categories/
│       ├── icons/
│       └── looks/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root Layout + Global SEO + Nav
│   │   ├── page.tsx                # Homepage matching reference design
│   │   ├── products/
│   │   │   ├── page.tsx            # All Products catalog + filters
│   │   │   └── [slug]/page.tsx     # Dynamic Product Detail & Compare
│   │   ├── categories/
│   │   │   ├── page.tsx            # All Categories overview
│   │   │   └── [category]/
│   │   │       ├── page.tsx        # Main category page
│   │   │       └── [sub]/page.tsx  # Dedicated subcategory page
│   │   ├── brands/
│   │   │   ├── page.tsx            # A-Z brand directory
│   │   │   └── [brand]/page.tsx    # Brand products page
│   │   ├── search/page.tsx         # Multi-field search
│   │   ├── deals/page.tsx          # Top discount deals
│   │   ├── trending/page.tsx       # Trending products
│   │   ├── new-arrivals/page.tsx   # New launches
│   │   ├── price-drops/page.tsx    # Price drop tracker
│   │   ├── about/page.tsx          # About Us
│   │   ├── contact/page.tsx        # Contact Us
│   │   ├── privacy/page.tsx        # Privacy policy
│   │   ├── terms/page.tsx          # Terms & Conditions
│   │   ├── disclaimer/page.tsx     # Affiliate disclaimer
│   │   ├── sitemap.ts              # Dynamic sitemap generator
│   │   ├── robots.ts               # robots.txt handler
│   │   └── api/                    # REST APIs
│   │       ├── products/route.ts
│   │       ├── products/[slug]/route.ts
│   │       ├── categories/route.ts
│   │       ├── brands/route.ts
│   │       └── search/route.ts
│   ├── components/
│   │   ├── layout/                 # Header, Footer, Breadcrumb
│   │   ├── home/                   # HeroBanner, FeatureCards, PromoCards, LookBook, BrandStrip
│   │   ├── product/                # ProductCard, ProductGrid, ProductFilters, SortBar
│   │   ├── seo/                    # JsonLd structured data components
│   │   └── ui/                     # Pagination, Badges
│   ├── lib/
│   │   ├── mongodb.ts              # Mongoose singleton connection
│   │   ├── models/Product.ts       # Mongoose schemas for all 4 marketplaces
│   │   ├── constants/              # Categories & Marketplace metadata
│   │   └── utils/                  # Product querying, formatting & SEO helpers
│   └── types/
│       └── product.ts              # Full TypeScript interfaces
```

---

## 🚀 Running the App

### 1. Development Mode
```powershell
cd Z:\laragon\www\makeupkhoj\website
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Production Build & Start
```powershell
cd Z:\laragon\www\makeupkhoj\website
npm run build
npm start
```
Runs the optimized standalone production server on port 3000.
