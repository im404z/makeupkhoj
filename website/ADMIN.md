# Catalog administration

Open `/admin` and sign in with `ADMIN_USERNAME` and `ADMIN_PASSWORD` from
`website/.env.local`. These values and `ADMIN_SESSION_SECRET` are server-only;
the ignored local environment file is already configured. Change credentials in
that file and restart the server to invalidate existing sessions.

The dashboard displays per-marketplace and total listing records, PDP-enriched
records, pending PDPs and records needing category review. The listing count
includes enriched documents because both phases use the same collection.
Pending is the count where `pdp_scraped` is not `true`.

Use **Run a crawler** to select a marketplace, listing/PDP/both phases,
concurrent requests, pages per category and PDP limit per store. Zero means all.
The default is pending PDP enrichment, since the existing catalog already has
listing data. Proxy settings come from `crawler/node/.env`. Server-side launches
use the existing native Node/Crawlee CLI, with no shell interpolation. One job
can run at a time; Crawlee processes categories/PDPs concurrently inside it.
Output and job state are stored under ignored `website/.admin/`. The UI polls
activity every four seconds and counts every fifteen seconds. Refresh manually
after a run if needed.

The process must run on a persistent Node host with the crawler directory and
its dependencies/Chromium installed. This local worker launcher is not suitable
for a serverless deployment. A server restart may leave a detached crawler
running; the dashboard checks the saved PID and reports interrupted jobs when
the process is gone. After a forced shutdown, inspect the worker and CLI lock
before starting another job. Keep `.admin/` and crawler state out of version
control.

**Products & categories** supports marketplace/status/search filters and paginated
records. Edit a parent and leaf category to update that marketplace document's
taxonomy. Reviewed categories are marked and retained by the native crawler on
subsequent listing or PDP updates. Legacy Python crawlers do not have that
preservation behavior. Category review does not automatically merge products
or assign cross-marketplace shade/size matches.

Authentication uses signed, expiring HttpOnly/SameSite cookies, server-side
environment credentials and login throttling. Mutation endpoints require a
matching Origin and a valid session. Admin routes are excluded from indexing.

The Crawlers navigation item opens three explicit Node/Crawlee launch modes:
Listing crawler, PDP crawler, and Listing + PDP. The mode shortcuts and crawl-type
selector share the same state. The separate SEO audit tab runs the HTML checks
documented in [SEO.md](SEO.md) and stores its latest report locally.

## Checks

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/verify-admin.mjs
```

The integration check requires the development server at localhost:3000 and
uses environment credentials without printing them. It checks access control,
login, count invariants, pending filters, input rejection, logout and the Amazon
product page. It does not launch a crawler or change product data.

Shared UI tokens/base styles are in `src/app/globals.css`. Product cards and the
admin workspace share classes from `src/styles/components.css`. Marketplace
logos are copied from the supplied `images` folder into `public/marketplaces`.
