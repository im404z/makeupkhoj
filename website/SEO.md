# Catalog rendering and SEO

## Catalog behavior

The catalog reads the four active marketplace collections. Store identity comes
from the collection, including older records without a marketplace field. The
default Popular view rotates through matching stores, ordered by recorded rating
count within each store. This prevents one large collection from occupying the
whole page. Explicit price, rating, discount and newest sorts order the combined
results globally. Pagination has deterministic tie-breakers and does not refetch
every previous page into application memory.

Search, category, subcategory, brand and numeric filters apply together. Literal
search text is escaped, numeric strings are normalized before range comparisons,
and multi-store selections restrict the collections read. Price range, stock,
finish and searchable brand controls are available in the sidebar. Brand names
that normalize to the same URL are grouped; exact source aliases remain valid
filter values. Marketplace IDs are preserved.

Listings and category results are server-rendered. The homepage's initial Popular
panel is server-rendered; its category tabs switch between prefetched products.
Collection, brand and product pages retain HTML links to detail pages.

## Metadata and schema

- One site-name suffix per title, page-specific descriptions and absolute canonicals.
- Unfiltered page 2+ URLs have their own title and canonical.
- Filter/sort variants use noindex/follow; robots.txt allows their noindex tags to
  be read. Search results are noindex. Admin/API routes remain excluded.
- Pagination uses ordinary links with hrefs, preserving active filters.
- Organization, WebSite and BreadcrumbList schema identify the site and navigation.
- Listing/category/brand templates emit CollectionPage + ItemList. Brand pages
  identify the actual Brand, including accented names resolved from the catalog.
- Product schema uses recorded prices/ratings. Unknown availability is omitted;
  arbitrary future price-expiry dates and unverified social accounts are omitted.
- JSON-LD escapes HTML-sensitive characters. Empty product social images fall
  back to the editorial banner rather than emitting an empty Open Graph image.

`NEXT_PUBLIC_SITE_URL` must be the real production origin before deployment.
The default is `https://makeupkhoj.com`.

## Sitemaps

`/sitemap-index.xml` references the core page/brand/category sitemap and product
sitemaps split by marketplace into at most 10,000 records each. Product sitemap
URLs are generated independently of the public API's 100-item result limit.
Only known product timestamps are used as lastmod values. Admin and filtered
variants are excluded. robots.txt points at the index.

## Admin audit

Open `/admin` → **SEO audit** → **Run SEO audit**. The audit fetches public HTML
for core pages, sample categories/subcategory/brands and one product per store.
Results persist in ignored `.admin/seo-audit.json`. Checks cover HTTP responses,
titles, descriptions, H1s, canonicals, Open Graph, JSON-LD, server-rendered product
cards, image alt attributes and crawlable pagination. Expand any result to see
the individual checks. This is a local technical audit, not a Google Search
Console or Rich Results Test integration, and does not guarantee indexing.

```powershell
node scripts/verify-catalog-helpers.mjs
node scripts/verify-format.mjs
node scripts/verify-catalog-seo.mjs
```

The integration script requires the local development server and environment
admin credentials. It only reads product data and writes the local audit report.
It does not launch crawlers or modify products.

## Editorial assets

New built-in ImageGen artwork is saved as optimized WebP files:

- `public/assets/banners/editorial-hero.webp`
- `public/assets/banners/editorial-lips.webp`
- `public/assets/banners/editorial-eyes.webp`

The complete prompt set is in `design/banner-prompts.json`. The existing artwork
was retained. Shared visual styles remain in `src/styles/components.css`.

## Consistent catalog URLs

Shared URL rules live in src/lib/utils/catalog-urls.ts and are used by filters, sort controls, quick links, search, pagination, canonicals and listing schema. Category/subcategory and brand paths stay readable, for example /categories/lip-makeup/lipstick and /brands/lakme. Query parameters remain a supported, readable format for filter combinations.

The builder uses a fixed parameter order, sorts/deduplicates multi-select values, writes brand slugs, validates numeric values, removes page=1 and route-default sort values, and discards unused parameters. Nonstandard listing requests redirect permanently to that form. Filters preserve category context and pagination preserves active selections. Search reset preserves the query.

Base categories, subcategories, brand pages and unfiltered pagination are indexable with self-referencing canonicals. Faceted/sorted pages and search pages use noindex, follow and their own normalized canonical URL; they are not included in sitemaps. Equivalent explicit defaults normalize to the indexable base route. Buy redirects remain noindex and are excluded from sitemaps.

Invalid category/subcategory paths, impossible price ranges and nonexistent pagination return HTTP 404. Metadata validation runs before response headers (Next htmlLimitedBots set to match all agents), avoiding streamed soft 404s. Paginated metadata validates the result count, which adds a catalog validation query on page 2 and later. Legacy Nykaa paths, product aliases and brand aliases redirect to the canonical local path. Product identity is checked across stores before accepting shortened ID suffixes, avoiding cross-marketplace ID collisions.

The admin audit now includes marketplace, brand, price/sort, category-filter and search URLs and checks their indexing policy. Run node scripts/verify-catalog-urls.mjs for pure URL rules, node scripts/verify-seo-urls-live.mjs to crawl every configured category/subcategory plus redirect and status tests, and node scripts/verify-catalog-seo.mjs for catalog regressions and the expanded admin HTML audit. Set ADMIN_TEST_URL to the preview origin when testing separately.

References: https://developers.google.com/search/docs/specialty/ecommerce/designing-a-url-structure-for-ecommerce-sites and https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading . No local audit guarantees Google indexing.
