# Shop by category artwork refresh

The homepage now uses CategoryBannerCard with new transparent studio product groups, navy panels, coral calls to action and readable HTML labels. It displays four banners per row on desktop and two per row on mobile. Category links and the single H2 section title are retained.

The eight final, optimized assets are in `public/assets/categories/shop-*.webp` (640 × 640, transparency preserved). They replace the previous beige/still-life imagery in the category data as well as the homepage section. Old artwork is retained for rollback.

Generated using the built-in image-generation tool. Exact prompts are in `prompts.json`; original output paths are in `sources.json`. These are illustrative category images with original unbranded packaging, not photographs of specific catalog SKUs.

Validation: all eight assets have alpha channels, TypeScript and production build, plus desktop/mobile visual checks and live category links.
