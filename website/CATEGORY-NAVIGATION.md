# Category navigation

The navigation mapping was checked against MongoDB on 8 November 2026 using the `amazon_makeupkhoj`, `flipkart_makeupkhoj`, `myntra_makeupkhoj` and `nykaa_makeupkhoj` collections.

The stores do not use consistent parent labels. Nykaa often records `Makeup > Makeup > Foundation`, while other stores record `Makeup > Face > Foundation`. Category pages now use exact product-type aliases from `sub_sub_category`, rather than looking for the parent category name anywhere in the record.

`src/lib/constants/category-leaves.ts` is the shared mapping for category listings and navigation. Equivalent recorded labels are grouped, for example `Compact` with `Compact Powder`, and `Eyeshadow` with `Eye Shadow`. Broad buckets such as `Setting Sprays & Powders` stay broad; they are not guessed into more specific categories. Cheek types are grouped under Cheeks even when a marketplace uses Face as their parent.

The subcategory component reads counts from all four collections on each request, hides empty groups, highlights the current group and preserves listing filters when switching groups. Counts represent listing records, not deduplicated products, and are shown before filters. The parent count is the sum of its disjoint subcategory groups.

Menus use the same recorded type mapping. Previously advertised subcategory URLs with no supporting recorded type redirect to the parent. Unrecognized URLs remain 404. Source documents are not modified. A new source label needs review and an explicit mapping before becoming a new public category; unrelated skincare and body-care labels are not automatically advertised as makeup.

Run the live checks against a running build, setting `CATEGORY_TEST_URL` to its origin if needed:

```sh
node scripts/verify-category-navigation.mjs
```

The default test origin is `http://127.0.0.1:7858`. Checks cover all eight parents, positive subcategory counts, parent totals, active state, real products, marketplace filter preservation, aliases, and legacy redirects.
