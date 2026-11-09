# Refresh marketplace prices and reviews

## Daily listing-only price update

Default listing engines: Amazon uses a browser; Flipkart, Myntra and Nykaa use HTTP. The category sources are each store's `crawler/<store>/<store>_makeup_urls.json`. `--engine browser` explicitly forces browsers for all stores; use `--engine auto` for the normal per-store selection. PDP mode retains its browser defaults.

Use `node crawler/price-update.mjs --parallel-stores 4 --concurrency 2 --rate 30` for all stores together. Myntra's HTTP pagination can repeat the first page or fail on later pages, as documented in the Python crawler. Such categories are marked incomplete. `--browser-stores myntra` opts into a browser for Myntra only, while Amazon continues using a browser by default.

The current Flipkart Python implementation uses Playwright. The Node HTTP mode reuses its HTML extraction approach and was checked against live listing HTML. Nykaa follows its Python HTML parsing and `page_no` pagination; Myntra uses `window.__myx` and `p` pagination in HTTP mode. A successful first-page check does not prove complete catalog coverage.

From the project root, run `node crawler/price-update.mjs` to scan all four marketplaces' configured listing categories and pages. Use `node crawler/price-update.mjs amazon` for one store, or `node crawler/price-update.mjs --plan` to preview. This is also available as `node crawler/refresh.mjs all --mode price-update`.

This mode updates prices and visible rating information without visiting PDPs. Listing cards generally do not provide full customer review text; use the separate PDP commands below for that. A listing scan only refreshes the products it encounters. Add `--proxy` to use the configured proxy; the current runner defaults to direct connections.

Run from the project root. These commands use the Node Crawlee adapters and connect directly by default. Add `--proxy` to use the proxy configuration in `crawler/node/.env`. Install dependencies once with `npm --prefix crawler/node ci` if needed.

## Refresh all existing products in one marketplace

PDP mode revisits stored product URLs, including products already marked as scraped. It updates observed selling prices, availability, ratings, and reviews returned by the current product page.

```sh
node crawler/refresh.mjs amazon
node crawler/refresh.mjs flipkart
node crawler/refresh.mjs myntra
node crawler/refresh.mjs nykaa
```

Run one crawler command at a time. To refresh all four stores sequentially:

```sh
node crawler/refresh.mjs all
```

To refresh multiple marketplaces at once, pass a comma-separated list or `all` with `--parallel-stores`:

```sh
node crawler/refresh.mjs flipkart,myntra --parallel-stores 2 --limit 200 --concurrency 3 --rate 60 --verbose-changes
node crawler/refresh.mjs all --mode listing --parallel-stores 2 --pages 3
```

`--limit`, `--concurrency`, and `--rate` apply to each marketplace. With two stores, concurrency 3, and rate 60, the run can have up to six crawler requests in flight and a combined queue rate of 120 requests per minute. The runner still holds one global lock and keeps listing and PDP work for the same store in sequence.

Start with a limited batch, or adjust concurrent browser requests:

```sh
node crawler/refresh.mjs amazon --limit 100 --concurrency 3 --sessions 12 --rate 30
node crawler/refresh.mjs flipkart --limit 200 --concurrency 4 --rate 60 --block-media --verbose-changes
```

`--limit 0` means every stored product in each selected marketplace. `--rate` caps crawler requests per minute. `--concurrency` limits simultaneous requests, and `--delay` controls the browser wait in milliseconds (250 by default for the refresh command). Browser mode is the default. Use `--engine http` for a small trial when the marketplace serves the required data without JavaScript.

Progress shows cumulative saves, new products, price increases, price decreases, unchanged prices, first prices for existing records, and saves without an observed price. `--verbose-changes` adds the product name and old and new price for each increase or decrease, plus a line for each new product. These counts reflect the current process and restart at zero when a run resumes.

## Refresh category listings

These commands scan the configured category pages, discover products and update prices and rating information exposed on listing cards. Full review content requires the PDP commands above.

```sh
node crawler/refresh.mjs amazon --mode listing
node crawler/refresh.mjs flipkart --mode listing
node crawler/refresh.mjs myntra --mode listing
node crawler/refresh.mjs nykaa --mode listing
node crawler/refresh.mjs all --mode listing
```

`--pages 0` means all available listing pages per category. For a smaller run, add `--pages 3`. To discover new products and then refresh every stored product, run a listing command first, wait for it to finish, then run its PDP command.

## Preview, status and stop

```sh
node crawler/refresh.mjs amazon --limit 10 --plan
node crawler/node/src/cli.js --status
node crawler/node/src/cli.js --stop
```

Preview does not crawl or write products. An active Node runner prevents a second run from starting. Let your current run finish before launching a refresh. Review updates are limited to content the marketplace exposes; empty responses preserve existing stored review data.

## Price drops and admin controls

In **Admin > Overview > Price drop display**, configure:

- Enable or pause the public price-drop listing.
- A rolling window: 24 hours, 2 days, 3 days, 7 days, or a custom 1 to 720 hours.
- Maximum products across all pages, from 1 to 10,000.
- Products per page, from 5 to 100.

Defaults: enabled, last 24 hours, at most 100 products, 25 per page. Settings are stored in MongoDB and apply on the next page request without a website rebuild.

A qualifying record needs a timestamped change from a higher previous selling price to a lower observed selling price. The current recorded price must still be at that reduced level or lower, and the item must not be explicitly out of stock. A first observation, an MRP discount, an expired reduction or a legacy date-only entry does not qualify. Records without history need at least two valid observations to establish a reduction. The crawler retains up to 1,000 price changes per product, so eligibility is limited to retained observations.

The default sort ranks actual reduction percentages. Cards show the recorded previous price and reduction amount separately from the MRP discount. Prices are observations, not guarantees of the current checkout price. No artificial history or backdated reductions are created.

Changes to crawler code take effect on its next launch. Existing crawler processes are not restarted by this setup.
