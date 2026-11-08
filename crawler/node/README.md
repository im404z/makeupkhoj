# Native Node.js Crawlee crawlers

Amazon, Flipkart, Myntra and Nykaa listing + PDP crawlers. No Python subprocesses.
The original Python files remain available separately. Tata CLiQ is excluded.

## Setup

Node.js 22+ is required. From this folder:

```powershell
npm install
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/browsers"
npx playwright install chromium
```

Copy `.env.example` to `.env` on another machine and fill in your proxy and MongoDB
URI. The supplied proxy is already configured locally in ignored `.env`. Root
`.env` is also loaded, with local settings taking priority. Set:

```dotenv
CRAWLER_PROXY_URL=http://username:password@proxy-host:port
MONGODB_URI=mongodb://username:password@database-host:27017/?authSource=admin
MASTER_DB=makeupkhoj
```

Multiple proxy endpoints can be supplied as a JSON array in `CRAWLER_PROXY_URLS`.
Crawlee rotates endpoints between sessions, retaining the chosen endpoint for a
session. A single supplied endpoint cannot manufacture multiple exit IPs: the
Webshare account/endpoint must itself support rotation. The two-session check of
the supplied endpoint returned the same IP twice.

## Run

Commands below are from the project root:

```powershell
# Verify proxy authentication and observe exit IPs across sessions
node crawler/node/src/cli.js --check-proxy --sessions 3

# Preview category jobs without browsing or database writes
node crawler/node/src/cli.js --platform all --type all --plan

# Myntra: multiple independent browser/category sessions, 3 pages each
node crawler/node/src/cli.js --platform myntra --pages 3 --concurrency 3 --sessions 5

# Two-page Myntra smoke test, local JSONL output only
node crawler/node/src/cli.js --platform myntra --url https://www.myntra.com/makeup --pages 2 --concurrency 1 --dry-run

# All four listing crawlers, full category pagination
node crawler/node/src/cli.js --platform all --type listing --pages 0 --concurrency 3

# Pending PDP enrichment (50 per store)
node crawler/node/src/cli.js --platform all --type pdp --limit 50 --concurrency 3

# Listing then pending PDP enrichment for each store
node crawler/node/src/cli.js --platform all --type all --pages 3 --limit 100

# Refresh all products' PDP prices, including previously enriched products
node crawler/node/src/cli.js --platform myntra --type pdp --all --limit 0 --sync-master

# Inspect saved state or resume interrupted/failed requests
node crawler/node/src/cli.js --status
node crawler/node/src/cli.js --resume

# Show every option
node crawler/node/src/cli.js --help
```

`--concurrency` caps simultaneous requests/categories for the current store.
Stores run sequentially; independent categories and PDP requests run concurrently.
`--tabs 1` allows one page per browser, so concurrency can use multiple browsers.
`--sessions` caps session-pool size; `--session-uses` retires sessions after usage.
`--rate 30` limits new Crawlee requests/minute. Myntra Next-button navigation occurs
inside a category request, and uses `--delay` milliseconds between pages; those
internal navigations are not counted by Crawlee's request-rate limiter.

Browser mode is the default. `--engine http` uses native Crawlee HTTP/Cheerio
transport, which has a different TLS/client fingerprint from the old Python
curl_cffi transport. Use browser mode for sites that need rendering or session
navigation. Myntra HTTP mode may return incomplete/overlapping pagination.

`--pages 0` and `--limit 0` mean all available items. A category request defaults
to a 1,800-second handler timeout; increase `--timeout` for very large Myntra
categories. `--headful` opens visible browser windows for debugging.

## Data and matching

Writes target only `makeupkhoj` and the same four `*_makeupkhoj` collections.
Amazon uses ASIN; Flipkart/Myntra use existing IDs; Nykaa preserves `NYK-` IDs.
Listing updates retain existing PDP enrichment. PDP parsers support current DOM
selectors, JSON-LD, Myntra embedded data and Nykaa preloaded state. They extract
prices, ratings, images, specifications, cosmetic attributes, variants and reviews
present in the loaded page. They do not promise to fetch every review page.

Writes are serialized inside the Node process to avoid duplicate upserts against
legacy non-unique indexes. The runner takes a local process lock. Do not run the
old Python crawlers or a second machine against the same collection concurrently
until full unique ID indexes are in place. Existing indexes/data are never dropped.

`--sync-master` refreshes offers only for already matched master products,
recomputes the lowest in-stock price, and leaves matching decisions intact.
It does not guess that differently shaded/sized products are the same SKU or
create a new master catalog. Marketplace price history is recorded on changes.

`--dry-run` writes JSONL into `state/<run-id>/` without connecting to MongoDB.
For dry-run PDP, supply `--platform STORE --type pdp --url URL --id EXISTING_ID`.
Database-based pending selection requires a normal run.

## Reliability and verification

Crawlee persists per-run queues and session data locally under ignored `state/`.
`--resume` uses the last run's saved options, skips completed stages and requeues
failed requests. Replayed category writes are idempotent upserts; database writes
must finish before the request completes. A successful run with an explicit page
limit means the requested bounded crawl completed, not that the entire catalog
was collected. Empty/unrecognized product HTML and repeated pages fail instead
of silently counting as catalog completion.

After a forced shutdown, verify no crawler/browser process is still running
before removing `state/runner.lock`. State includes session/cookie data; keep it
local. Credentials are excluded by `.gitignore`.

Run `npm test` here for parser/identity, blocked-page, pagination and serialized
storage checks. Tests use local fixtures; live marketplace layouts still need
bounded smoke tests and output comparisons before a full production crawl.

Verified locally: nine tests passed, and the authenticated native Crawlee proxy
check passed. Live browser dry runs produced:

| Store | Listing output | PDP output |
| --- | --- | --- |
| Amazon | 60 products, one page | 1 enriched product |
| Flipkart | 36 products, one page | 1 enriched product |
| Myntra | 82 distinct products, two pages | 1 enriched product |
| Nykaa | 20 products, one page | 1 enriched product |

The Myntra test exposed and verified the stale embedded JSON fix after Next
navigation. Amazon PDP verification passed after switching from a sponsored
redirect URL to canonical `/dp/ASIN`. No production MongoDB writes were performed.
These are bounded smoke tests, not full-catalog completeness or exact-output
parity certification for every field/variant of the original Python crawlers.
