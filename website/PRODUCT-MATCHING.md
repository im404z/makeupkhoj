# Product matching operations

## Start here

Open `/admin` → **Product matching & SKUs**. The existing environment-based administrator login protects all matching endpoints.

1. Optional **Dry-run audit** reads the selected scope without creating SKUs or suggestions.
2. **Scan / resume catalogue** assigns permanent site SKUs, refreshes snapshots and generates cross-store title suggestions. Set limit 0 for all records. It uses a separate Node worker; the page can close while work continues.
3. Review both raw titles and original store links. Check shade, size, pack and formulation. Ranking scores are not probabilities. Approval revalidates the current source data against every member of both groups. Known conflicts block merging.
4. Publish using the checkbox. `/compare-products` lists only admin-approved groups with at least two distinct marketplaces. Single-store items remain in the normal `/products` catalogue. Product details use `/product/<slug>`; previous `/products/<slug>` and `/compare-products/<legacy-group-slug>` links redirect to the canonical product URL. Affiliate buy routes remain source-specific.
5. Inspect a SKU to edit the catalogue display title, split an incorrect listing into a new SKU, or reconfirm a held identity after reviewing refreshed data. Rejected pairs can be reopened deliberately.

Select individual suggestions or **Select this page**, then **Approve selected** or **Reject selected**. Selection persists across pages, up to 50 pairs. The confirmation lists both products and their stores. Every approval independently revalidates the complete group; blocked pairs remain selected and display their errors while successful decisions are retained. Review can be filtered by Amazon, Flipkart, Myntra or Nykaa. No bulk action automatically overrides variant conflicts.

**Approve all matching results** previews a fixed snapshot of every pending suggestion under the current marketplace and conflict filters (up to 50,000). The preview gives the exact count, scope and example pairs. Confirmation starts a separate cancellable worker. Progress includes approved and blocked counts; completed decisions survive cancellation. Blocked pairs remain pending for review. Draft previews expire after one hour; actual run history remains. The button does not bypass identity checks or start automatically.

Approved store groups also decorate regular product-grid cards across listings, categories, brands and homepage collections. Those cards show all matched marketplace logos and link to the canonical product page. Their original source price is preserved and labelled by marketplace, so a store/price filter is not silently replaced with another store's price.

## Dynamic product information

The product route is server rendered dynamically from current marketplace documents. `ProductDataSections` and `product-details.mjs` map marketplace-specific fields into specifications, highlights, seller/delivery/return information, available sizes/variants, store-specific ratings and rating breakdowns, saved written reviews, customer photos and recorded price history. The summary uses the richest source for product information while store offers retain their own prices and stock states.

Empty values and placeholders are hidden, duplicate specification groups and reviews are collapsed, and HTML descriptions are rendered as safe text. Flipkart gallery filename filtering excludes unrelated recommendation variants. Fragrance-only fields are not presented as lipstick attributes. Customer photos and reviews remain visibly attributed to their source store. Written-review counts describe the saved subset rather than pretending every reported review was collected.

All saved written reviews and customer photos are rendered. The product gallery includes every retained product image with scrolling thumbnails; it has no fixed eight-image cap. Customer photos include both marketplace-level and review-attached image arrays.

Customer-photo thumbnails also appear directly below the main gallery. Clicking a product or customer image opens a shared modal viewer with captions, an image counter, previous/next controls, arrow-key navigation and Escape-to-close behavior. The main gallery viewer includes both product and customer images; the review-section viewer shows that store's customer photos.

Related products use the common compact grid, prioritise the current product category, and exclude the current offer group. Approved marketplace duplicates are collapsed within the related section.

Site SKUs remain permanent internal identities; they do not have to be included in the public slug. Canonical slugs are pinned in `catalog_nodes.productSlug` under a unique sparse index. Existing SKU-suffixed comparison URLs continue to resolve and redirect.

## CLI

From `website`:

```powershell
node --env-file=.env.local scripts/run-catalog-matching.mjs --dry-run --limit 100
node --env-file=.env.local scripts/run-catalog-matching.mjs
node --env-file=.env.local scripts/run-catalog-matching.mjs --store myntra --limit 1000
```

No automatic approval is implemented. Initial matching uses titles, normalized brand aliases and extracted/structured variant attributes. Unknown details remain unknown. Re-run after PDP crawling or price refreshes. No scheduler is installed.

## Storage and atomicity

The original marketplace collections, identifiers and merchant SKU fields are unchanged. No dependency on the legacy empty `products` master collection is introduced.

- `catalog_sources`: unique source store/document reference, original assigned site SKU, title identity fingerprint, held/missing flags and timestamped listing snapshot. A split assigns a new site SKU and records the old assignment in history.
- `catalog_nodes`: permanent site SKU, immutable URL slug, optional display title, parent pointer and merge/title audit history.
- `catalog_candidates`: source pair, evidence/hashes, rank, pending/approved/rejected decision. Re-running unchanged evidence preserves decisions.
- `catalog_runs`: scope, progress, heartbeat, cancellation and completion state.
- `catalog_control`: publication setting and short-lived cross-process mutation lease.

A merge updates one root parent pointer atomically, rather than rewriting thousands of memberships. Reads resolve the union tree. The larger group wins to keep depth small; old SKU URLs resolve to the surviving group. This supports standalone MongoDB without requiring replica-set transactions. A split is an atomic source-assignment update; a newly created unused node is harmless if interrupted before assignment. A worker/app crash after a merge can leave the suggestion marked pending: approving it again recognizes the already merged root and reconciles the decision. Embedded mutation histories remain authoritative.

Group-wide checks cap groups at 100 source listings. Candidate generation uses brand/token postings with the four rarest useful title tokens, at most 800 postings per token and four ranked suggestions per source. These bounds keep memory and comparisons practical; suggestions are not exhaustive proof of either identity or uniqueness. Manual review is essential, particularly for parent listings with selectable variants. Same-store duplicates alone do not become multi-store comparisons.

## Freshness and storefront rules

Listing filters and prices use the latest scan snapshot and show that limitation. All offer-level filters must match the same snapshot. Store counts are distinct known marketplaces, not a promise of stock. Detail pages fetch source documents and immediately hold changed identity fingerprints out of offers. Ratings stay store-specific.

After a scan detects identity changes in a multi-member group, affected listings stay held until admin reconfirms or splits them. Full unlimited scans mark vanished source records missing. Partial scans do not infer deletion. Prices alone do not change the identity fingerprint.

Disabling publication returns existing source product pages to their normal behavior and makes comparison detail pages unavailable. The comparison landing page stays available with a preparation message. Filtered/sorted comparison pages use noindex/follow and normalized self-canonical URLs; base/paginated pages and valid SKU pages can be indexed. Comparison sitemap chunks contain up to 10,000 groups, and mapped source pages are excluded from marketplace sitemap chunks while published. Standard crawler refresh and scan reruns are required to keep sitemap snapshots current.

Worker logs: `.admin/matching-<run-id>.log` (ignored by git). An expired heartbeat marks interrupted work; retry safely with the same scope. Admin may cancel at a checkpoint. Restarting a scan preserves allocated SKUs and reviewed decisions; it starts reading the scope again rather than relying on a potentially stale source cursor.

## Verification

```powershell
node scripts/verify-title-matching.mjs
node --env-file=.env.local scripts/verify-catalog-matching.mjs
npx tsc --noEmit --incremental false
npm run build
```

The integration check creates and drops only a randomly named `makeupkhoj_catalog_test_<hex>` database. It does not approve live source products. It checks stable IDs, approved merging, conflicting variants, same-offer filtering, held PDP changes, split behavior and embedded audit history.
