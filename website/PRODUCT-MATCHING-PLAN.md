# MakeupKhoj SKU and product comparison plan

Updated requirements implemented after this initial plan: the public comparison listing contains only approved multi-marketplace groups; detail pages use `/product/<slug>`, and admin supports reviewed bulk decisions. See `PRODUCT-MATCHING.md` for the current behavior.

## Purpose

Build a deduplicated catalogue alongside the existing marketplace listings. A single purchasable variant has one MakeupKhoj SKU and one comparison page, whether it is available at one store or four. Start with listing titles; use PDP data to strengthen identity as it arrives.

## Existing code and constraints

- Four active collections: amazon_makeupkhoj, flipkart_makeupkhoj, myntra_makeupkhoj, nykaa_makeupkhoj. Exclude Tata CLiQ.
- `src/lib/utils/products.ts` currently discovers offers with exact name/brand and shade/size equality on each page request. Replace this with saved, approved membership when the new catalogue is published.
- Existing `sku`, `sku_id`, `id`, `asin`, and `product_id` belong to the source store. Do not replace them with our SKU.
- Keep marketplace documents and existing listing/product URLs intact during rollout. Existing buy routes must continue selecting the actual store document so affiliate overrides and tracking keep working.
- Matching runs independently of PDP crawlers. Do not write matching metadata into fields the crawlers own.

## Identity model

**Site SKU:** opaque, immutable identifier such as `MK-<random ID>`, allocated once with a unique database index and collision retry. Never derive identity from title, price, category, or a shortened merchant ID. Store as `site_sku` in the new catalogue, distinct from merchant `sku`.

**Variant:** one exact shade/colour, net quantity, pack count, and formulation. A 10 ml blush and a 20 ml blush have different SKUs; so do shade 30 and shade 40. Families can connect related variants later without merging their offers.

**Source offer:** reference by `(marketplace, source MongoDB _id)`, with original merchant identifiers retained for diagnostics. One active source offer belongs to at most one catalogue SKU. Multiple sellers/listings in the same store do not increase the distinct store count.

**Unknown identity:** incomplete titles can have provisional single-store SKUs, but cannot join a confirmed variant merely because the brand and product line look similar. Expose uncertain candidates only to admin.

## Collections

1. `catalog_products`: site_sku, permanent slug, display title/brand/category, normalized identity attributes with provenance, provisional/active/retired state, representative image reference, timestamps, and identity revision. Unique site_sku and slug.
2. `catalog_memberships`: source store + source document ID, site_sku, approved/manual/seed status, evidence, algorithm version, source title/identity fingerprint, verification time. Unique compound source reference; index site_sku. Do not use merchant ID alone across stores.
3. `catalog_match_candidates`: ordered pair of source references, proposed target SKU, score components, conflicting/missing attributes, pending/approved/rejected/stale status, reviewer action, matcher version, input fingerprints. Deduplicate pairs and preserve explicit rejections across reruns unless identity evidence changes.
4. `catalog_match_runs`: queued/running/completed/failed/cancelled state, scope, checkpoints, counts, errors, lease/heartbeat and cancellation flag. One worker lease per scope prevents overlapping runs.
5. `catalog_match_audit`: append-only merge/split/approve/reject events with actor, before/after references and reason. Retain SKU and URL aliases after a merge.
6. `catalog_offer_summary`: rebuildable read model per SKU: distinct stores, source count, current lowest known available price, price range, freshness and chosen image. Source store records remain authoritative for current prices and buy destinations.

Publish membership changes atomically using MongoDB transactions where the configured deployment supports them. Otherwise publish a completed revision and switch the active revision pointer only after all writes succeed. Readers must never observe half a merge. Audit which deployment mode is available before implementation.

## Title matching pipeline — version 1

1. Read source listings in resumable batches. Normalize casing, Unicode, punctuation and spacing; retain raw text and all meaningful numbers. Use an admin-maintained brand alias table; never globally delete numerical tokens.
2. Extract brand, product line, type, shade name/code, quantities, unit, pack count, SPF and explicit finish/formulation when present. Normalize equivalent quantities such as 0.01 L and 10 ml. Do not equate grams and millilitres. Keep per-unit quantity separate from total bundle quantity.
3. Build an inverted token index/blocking keys by normalized brand and distinctive product-line tokens. Use category only when reliable; uncategorized listings must remain matchable. Avoid all-pairs comparisons across the full catalogue.
4. Generate cross-store candidates with rare shared tokens, then rank by weighted token overlap and word/character similarity. Distinctive line/model/shade tokens matter more than generic words such as makeup or long lasting. Price is a diagnostic, not identity evidence.
5. Hard conflicts block automatic matching: different known brands, shade/code, quantity, pack count, SPF, product type or formulation. A missing attribute is uncertainty, not agreement. Flag contradictions between title and structured fields.
6. Initially publish only manually approved cross-store matches. Show confidence bands and an explanation rather than presenting an uncalibrated score as a probability. A proposed score is for queue ordering until validated against reviewed real examples.
7. Later allow automatic approval only for a measured high-precision tier: exact normalized identity, all required variant fields known, no conflicts and strong title agreement. Keep an easy global disable switch. Wider fuzzy matches remain review-only.
8. Validate a candidate against every confirmed member of a group. A matches B and B resembles C does not prove A matches C; do not use unchecked transitive clustering.

Do not invent shade, size or pack values from weak hints. An ambiguous bundle remains separate. Store listing titles sometimes describe a parent with several selectable variants; mark such records as unresolved parents until the selected variant is known.

## Admin comparison tool

Add a Product matching section with:

- Counts: source listings, site SKUs, provisional singles, multi-store SKUs, unresolved candidates, rejected pairs, stale matches and missing source records.
- Actions: dry-run scan, initial SKU backfill, incremental scan, retry/resume, cancel, and rebuild summaries. Long jobs run in a separate Node worker, not inside a Next.js HTTP request.
- Controls: store/category scope, batch size, bounded concurrency, matcher version, auto-approval switch (off initially), and published comparison catalogue switch.
- Review side by side: images, raw titles, normalized brand, shade/quantity/pack fields, price, store logo, source link, PDP status, score explanation and highlighted conflicts.
- Approve match, reject pair, leave separate, choose canonical title/image, correct an extracted attribute, merge groups, move a mistaken member and split a group. All changes audited; confirm a concrete merge/split preview.
- Reject duplicate clicks safely using idempotency keys and optimistic revision checks. Apply current admin authentication and same-origin protections.

## Storefront

- Add navigation item **Compare products** and server-rendered `/compare-products` listing.
- Include every published SKU: single-store items remain visible and multi-store duplicates appear once. Use tabs/filters for All products, Multiple stores, and Single store.
- Reuse existing card, logos, price display, breadcrumb, filters, sorting and pagination components. Keep the current compact five-column desktop grid.
- Group card shows representative image, brand/title, selected variant, lowest known available price, distinct store logos/count, and Compare prices or View offer for singles. Never claim savings between different variants. Unknown stock is labelled as unknown rather than confirmed available.
- Detail route `/compare-products/<product-slug>-<site-sku>` shows selected variant, store offers, price freshness, availability and affiliate buy links. Do not pool customer ratings from separate stores.
- Filtering a store means the group has a qualifying offer at that store. Price, stock and marketplace filters must be satisfied by the same offer; a group must not qualify using one offer's price and another offer's availability. Define displayed filtered prices accordingly. Multiple stores means at least two distinct stores, not two listings from one store.
- Keep current `/products` source catalogue available during migration. Once a group is published, its source detail pages can permanently redirect to the group page while `/buy/...` remains source-specific. Activate redirects and sitemap/canonical changes together; avoid duplicate indexed product pages.

## SEO

- Stable permanent slug plus SKU; a later title change does not change the URL. Merged group URLs redirect to the retained SKU; split groups get deliberate aliases, not ambiguous redirects.
- Server-render detail content and real 404s. Self-canonical clean base/detail URLs; reuse existing normalization/noindex rules for filtered and sorted listings. Add published comparison pages to chunked sitemaps only after canonical rollout.
- Product JSON-LD uses our SKU plus accurate AggregateOffer information for the exact variant. Include only real source offers; no fabricated GTIN, pooled ratings or guaranteed live-price claims.

## PDP updates and ongoing crawling

- Fingerprint identity fields separately from prices. Price-only updates refresh summaries without rerunning the matcher.
- New listings receive provisional SKUs and enter incremental matching. PDP identity changes rescore affected candidates.
- If PDP data contradicts an approved group, suspend the conflicting offer from public comparison and queue review; do not silently merge/split established identities.
- Retain manual decisions and SKU stability across scans. Missing source records are marked unavailable/orphaned and reviewed; do not delete the catalogue identity immediately.
- Backfill with dry-run counts first, idempotent insert/upsert operations, bounded batches and resume checkpoints. No crawler shutdown required.

## Implementation order and release gates

1. Read-only catalogue audit: collection counts, identity/brand/title completeness and representative candidate samples. Produce reviewed fixtures covering true matches, shades, sizes, bundles, spelling variants and incomplete titles.
2. Add collections, indexes, SKU allocator, dry-run CLI and resumable worker. Confirm reruns create no duplicate SKUs or memberships; preserve crawler data.
3. Add title extraction/ranking and admin review. Calibrate against fixtures; inspect precision and ambiguous/missed cases. No public fuzzy merges.
4. Build comparison listing/detail with existing shared components and approved memberships. Verify singles, multi-store groups, filters, pagination, price freshness, stock and source-specific affiliate tracking.
5. Enable a small published category, verify canonical redirects, schema, sitemap, desktop/mobile layouts and rollback. Expand after review.
6. Connect PDP change detection and optional conservative automation after accuracy is demonstrated.

Required tests: conflicting shades/sizes/packs never auto-group; unit conversion works; missing attributes remain uncertain; identity is store-scoped; concurrent/resumed runs are idempotent; group-wide consistency prevents transitive false matches; merge/split audit and aliases survive; same-offer filtering works; stale or unavailable offers do not become lowest confirmed available; existing buy routes still track the correct product. Record match quality on reviewed fixtures before setting an automatic threshold.

## Scope of the first release

Four marketplaces, permanent site SKUs, title-based suggestions, manual approval, single/multi-store comparison catalogue, source-specific affiliate links, admin controls and SEO integration. Image matching, embeddings and automatic broad fuzzy grouping are follow-up work, after the first reviewed data establishes whether they are needed.
