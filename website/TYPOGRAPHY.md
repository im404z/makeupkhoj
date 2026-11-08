# Nohemi typography

The supplied `Nohemi/Variable-TT/Nohemi-VF.ttf` is self-hosted through next/font/local in `src/app/fonts.ts`. It contains a weight axis from 100 to 900 and is about 90 KB. One file supplies all selected styles; no third-party font requests are made. The supplied EULA is retained next to the copied font.

Shared role assignments in `src/styles/typography.css`:

- Regular 400: descriptions, form inputs, filter options, specifications and table content.
- Medium 500: navigation, buttons, product titles, labels and secondary links.
- SemiBold 600: hero, section headings, category banners, product headings and panel titles.
- Bold 700: prices and the wordmark.
- ExtraBold 800 and lighter display weights are available in the font but are not used for routine body content.

Headings use restrained negative letter spacing; small uppercase labels use wider spacing. Product names retain two-line clamping. Prices use tabular-number styling where supported. The font has no rupee glyph, so ₹ falls back to Segoe UI/Arial. The font is preloaded with display swap and an adjusted Arial fallback.

The homepage hero and marketplace band were redesigned together in `HeroBanner.tsx`; related responsive styles are in `marketplace.css`. A screenshot of the live implementation is saved in `design/hero-nohemi/` after visual verification.
