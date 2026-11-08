# Category photography and brand grid

Eight coordinated category photographs were generated with built-in ImageGen.
Final optimized files are under `public/assets/categories/editorial-*.webp`.
The exact prompt set is in [category-prompts.json](category-prompts.json).
These images are used by the homepage category grid and category directory.
Original category illustrations were retained.

The Shop by Brands section uses 17 sourced logo images saved under
`public/assets/brands/`. Each source URL is recorded in
`public/assets/brands/sources.json`. Most assets came directly from official
brand sites. The Charlotte Tilbury wordmark came from Wikimedia Commons, is
credited to Charlotte Tilbury, and is provided under CC BY-SA 4.0. The source,
license link and rasterization/resizing note are included in the public credits.

NYX Professional Makeup, Dior and Blue Heaven retain text labels because a
suitable logo was not verified during preparation. These are not synthetic logos.
White source logos are displayed in dark monochrome with CSS for legibility;
the downloaded PNGs retain the sourced artwork. Source logos were visually
checked to reject campaign photography and unrelated symbols.

Brand links resolve the catalog's actual brand names and aliases, with search
fallbacks where no directory match exists. Styles are shared in
`src/styles/components.css`.
