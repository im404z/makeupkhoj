# Affiliate links

Open Admin → Affiliate links. The global switch and each marketplace switch control affiliate destinations; disabled affiliate settings use the validated original merchant URL. The tracking switch separately controls aggregate outbound request counts. Counts are not unique visitors, sales or commission reports.

Amazon uses your exact Associates tag (`scentkhoj-21`), replacing any existing `tag` parameter. Set the marketplace method to Amazon tracking ID. Per product, choose marketplace settings, original store link, or a custom HTTPS affiliate URL. Settings take effect on the next request without a rebuild.

Every product offer uses `/buy/{marketplace}/{local-product-slug}`. Targets come from the database and admin settings, never a visitor-supplied redirect URL. GET requests redirect with HTTP 302 and no caching. HEAD requests and recognized bots/prefetches are not counted. Analytics contain daily product/store/method totals and no visitor IPs or cookies. Buy routes return an `X-Robots-Tag: noindex, nofollow` header and are excluded from sitemaps.

Save the EarnKaro token in the masked admin field, or set `EARNKARO_API_TOKEN` on the server. Saved tokens use AES-256-GCM with `AFFILIATE_ENCRYPTION_KEY` (or the existing `ADMIN_SESSION_SECRET` as fallback). Keep that key stable; rotating it requires saving the token again. The token is never returned to the browser. Leave the token field empty to preserve the current token. Removing a saved token does not unset an environment token.

EarnKaro conversion is an explicit admin action per product. It sends only the product's original merchant URL and `convert_option: convert_only` to the fixed API endpoint. It never invokes convert_share. Generated URLs are cached separately from crawler records and invalidated when the source merchant URL changes. Missing conversions use the original link. A database-backed 60-request-per-minute limit applies across sessions; errors are shown without leaking credentials. Failed conversions do not replace an existing link. A timeout is not automatically retried.

Collections: affiliate_settings, affiliate_products, affiliate_clicks, affiliate_rate_limits. Unique keys guard settings and product overrides; minute reservations expire with a TTL index. Crawlers do not overwrite these collections.

Legacy Nykaa `/products/{name}/p/{id}` links redirect permanently to a clean local slug. Product normalization also replaces marketplace path slugs before listings and sitemaps use them.

Verification: `node scripts/verify-affiliates.mjs` (defaults to preview port 3001; set ADMIN_TEST_URL for another origin). This verifies authentication, origin checks, the reported broken URL, no-cache/noindex buy redirects, the Amazon tag, overrides, and global disable. It persists the requested Amazon tag and restores the tested product override. It makes no EarnKaro calls. `node scripts/verify-affiliate-unit.mjs` tests conversion, caching, limits, encryption and click aggregation using isolated mocks. No live EarnKaro conversion can be verified until a real API token is configured.
