# Marketplace design

Implemented from the approved homepage, listing and product concepts in this folder. The live site uses catalog data; reference mockup prices, charts, shade choices and stock claims are not copied into the application.

## Shared components

- `BrandMark`, `Header`, `Footer`: one brand treatment, search and working category navigation across storefront pages.
- `CampaignBanner`: homepage hero and catalog/category campaigns; real HTML headings and responsive optimized images.
- `StoreStrip`, `MarketplaceLogo`: marketplace identities reused in the hero, footer, cards and offers.
- `SectionHeading`: discovery section headings and navigation.
- `ProductCard`, `ProductGrid`, `PriceDisplay`, `SaveProductButton`: compact cards, five desktop columns, numeric ratings, device-local saves and shared currency formatting.
- `ProductFilters`, `SortBar`, `CatalogQuickLinks`, `Pagination`: URL-backed filtering/sorting and responsive controls. Mobile filters collapse to a button.
- `ProductGallery`, `StoreOffer`: real product images and exact matched store offers, linked through the existing tracked buy routes.

`src/styles/marketplace.css` owns the storefront theme and responsive rules. It uses shared navy/coral/border/background tokens; `components.css` supplies existing structural and admin styles. Global typography uses the system Segoe UI/Arial stack without a font download. Cards use five columns on wide desktops, four on smaller desktops, three on tablets and two on phones. Product galleries use vertical thumbnails on desktop and a horizontal strip on phones.

Hero photograph: `public/assets/banners/marketplace-hero.webp`, generated with the built-in image tool. Exact prompt: `hero-prompt.txt`. Category photographs and the previously sourced brand/marketplace logos are reused. The three PNGs are reference mockups, not production page screenshots. Their prompts are in `prompts.json`.

Validation: TypeScript, production build, desktop/mobile browser checks, existing catalog/SEO audit and affiliate regressions. The website keeps server-rendered catalog content, canonical URLs, JSON-LD, repaired legacy Nykaa links and tracked outbound offers.

The current menu uses shared CategoryNavigation with a clickable category directory, real subcategory links, Escape/outside-click dismissal and a mobile disclosure. Catalog pages use CATALOG_PAGE_SIZE=25 from catalog-query.ts; metadata pagination validation uses that same value. Homepage collections fill one or two five-card rows. Category cards and promotional banners share the navy/coral storefront theme.
