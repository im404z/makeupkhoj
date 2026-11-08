# Crawler review and proposed Node.js structure

Scope: Amazon, Flipkart, Myntra, Nykaa. Tata CLiQ excluded.

## Current flow

`category_mapper.py` supplies category URLs and taxonomy. Listing crawlers upsert
marketplace IDs into the four `*_makeupkhoj` collections. PDP crawlers enrich those
same documents. `run_master_crawler.py` runs stores sequentially. Website catalog
matching and offer aggregation are a separate step; faster extraction must retain
IDs, variant attributes, taxonomy, price fields and PDP status.

| Store | Listing transport | PDP transport | Existing parallelism |
| --- | --- | --- | --- |
| Amazon | Playwright browser and DOM extraction | Playwright with JS extractor | Single browser/page per crawler |
| Flipkart | Playwright and BeautifulSoup | HTTP with HTML parser | PDP semaphore, default 3 |
| Myntra | HTTP embedded `window.__myx`, or Playwright Next button | Async HTTP and HTML parser | PDP semaphore, default 3 |
| Nykaa | curl_cffi and HTML parsing | curl_cffi and HTML parsing | Predominantly sequential |

## Myntra findings

The supplied log shows extraction succeeding but every save failing with MongoDB
code 86: existing `id_1` is non-unique, while the crawler requests unique. The code
now reuses the existing index and logs the missing uniqueness constraint. It does
not drop indexes or delete duplicates. Before adding concurrent writers, audit
duplicate and missing IDs and migrate to a unique index in a separate maintenance
step. Application upserts alone cannot prevent concurrent duplicate inserts.

Browser mode also passed `category_meta` to a function that did not accept it.
It now accepts and attaches category metadata. HTTP pagination now replaces an
existing `p` query parameter instead of appending a second one. Mongo clients in
the listing save function now close even on exceptions.

The low new-item counts on pages 2–4 suggest overlapping/stale listings, but do
not establish the cause. Compare page IDs, actual response pagination metadata,
and saved HTML before asserting that URL pagination works. The existing claims
about an exact 11-page HTTP limit are not proven by the pasted log. Empty or
blocked responses must not be reported as a successfully completed catalog.

## Proposed Node.js control plane

Keep the working Python extraction adapters initially. Node.js can own scheduling,
job persistence, metrics and worker lifecycle without changing product parsing.
A full JavaScript rewrite would need saved HTML fixtures and output comparisons
for all eight listing/PDP paths; it is not necessary to gain concurrency.

```text
crawler/node/
  cli/                 # run, status, retry, stop
  config/              # store limits and environment validation
  queue/               # persistent jobs, leases, retries, checkpoints
  workers/             # Python adapter processes; later native JS adapters
  sessions/            # browser pools, cookie jars and proxy leases
  adapters/
    amazon/
    flipkart/
    myntra/
    nykaa/
  storage/             # marketplace upserts and serialized catalog updates
  telemetry/           # extracted/saved/failed counts and latency
```

Job identity should include store, phase, category URL or product ID, and run ID.
Claim jobs atomically with lease expiry; acknowledge only after durable writes.
Persist retry counts and checkpoints. Run listings before pending PDP enrichment
for each store. Never launch multiple unpartitioned `--pending` processes: they
can select the same documents. Partition by claimed IDs instead.

Start by running different stores concurrently. Then allow a small configurable
number of independent category sessions and bounded PDP requests per store.
Keep Next-button pagination sequential inside each browser category session.
Limit total browser processes separately from HTTP concurrency and database batch
size. Measure successful saved products/minute, errors and memory before raising
limits; Node.js itself does not make network requests faster.

Lease one proxy and cookie jar per browser context or HTTP session. Rotate on a
new session, expiry or a failed proxy; avoid changing IP on every navigation in
the same session. Track proxy health without logging credentials. Apply request
timeouts, bounded exponential retry with jitter, Retry-After handling and per-store
backpressure. Pause blocked sessions instead of multiplying failed requests.

Require unique store-ID indexes before parallel writes. Preserve Amazon `asin`
and other stores' `id` types. Centralize Mongo connection pooling within each
process. Serialize or atomically update master price/history fields to avoid lost
updates. Keep shade, pack size, formulation and quantity distinct when comparing
offers; matching brand/title alone can produce incorrect price comparisons.

## Status

The subsequent native implementation is in `crawler/node/`, using Crawlee with
Node.js parsers and MongoDB writes. See its README for commands and validation.
The Python extraction code remains available separately. The earlier design
above records the review; the implementation no longer uses a Python bridge.
