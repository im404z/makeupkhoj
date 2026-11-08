# Refresh marketplace prices and reviews

Run from the project root. These commands use the existing Node Crawlee adapters and proxy configuration in `crawler/node/.env`. They do not launch separate terminal windows. Install dependencies once with `npm --prefix crawler/node ci` if needed.

## Refresh all existing products in one marketplace

PDP mode revisits stored product URLs, including products already marked as scraped. It updates observed selling prices, availability, ratings, and reviews returned by the current product page.

```sh
node crawler/refresh.mjs amazon
node crawler/refresh.mjs flipkart
node crawler/refresh.mjs myntra
node crawler/refresh.mjs nykaa
```

Run only one command at a time. To refresh all four stores sequentially:

```sh
node crawler/refresh.mjs all
```

Start with a limited batch, or adjust concurrent browser requests:

```sh
node crawler/refresh.mjs amazon --limit 100 --concurrency 3 --sessions 12 --rate 30
```

`--limit 0` means every stored product in each selected marketplace. `--rate` is the maximum requests per minute. Each browser has one tab. Sessions use the configured proxy; separate sessions do not guarantee different exit IPs. Use a provider-supported rotating endpoint or proxy list for IP rotation.

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
