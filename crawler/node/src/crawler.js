import { PlaywrightCrawler, CheerioCrawler, ProxyConfiguration, RequestQueue, Configuration, log, SessionError } from 'crawlee';
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { listing, pdp, nextUrl, embedded } from './adapters.js';
import { directory, proxyOptions,resolveEngine,browserChannel } from './config.js';
import { minimalSource } from './runtime.js';
import { amazonPdp } from './amazon-extractor.js';

const metadata = target => Object.fromEntries(['category', 'sub_category', 'sub_sub_category', 'category_path', 'category_name'].filter(k => target[k]).map(k => [k, target[k]]));
const selectors = { amazon: '[data-component-type="s-search-result"]', flipkart: 'div[data-id]', myntra: 'li.product-base', nykaa: '.productWrapper, div[class*="productWrapper"]' };
async function loadLazyContent(page) {
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    for (let step = 0; step < 30; step++) {
      window.scrollBy(0, 800);
      await new Promise(resolve => setTimeout(resolve, 100));
      if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 20) break;
    }
  });
  await page.waitForTimeout(300);
}
function validProductUrl(store, doc) {
  if (store === 'amazon') return `https://www.amazon.in/dp/${doc.asin || doc.id}`;
  if (doc.url) return doc.url;
  if (store === 'myntra') return `https://www.myntra.com/${doc.id}/buy`;
  if (store === 'nykaa') return `https://www.nykaa.com/product/p/${doc.product_id || String(doc.id).replace(/^NYK-/, '')}`;
  throw Error('Flipkart product URL missing');
}
export async function crawl({ store, phase, targets, storage, options, runId, signal, onProgress = ()=>{} }) {
  const engine=resolveEngine(store,phase,options);
  log.info(`${store} ${phase}: ${engine==='http'?'HTTP (no browser)':'Playwright browser'}`);
  const config = new Configuration({ storageClientOptions: { localDataDirectory: path.join(directory, 'state', runId, 'crawlee') }, persistStorage: true, purgeOnStart: false,
    logLevel: options.debug ? 'DEBUG' : 'INFO' });
  const queue = await RequestQueue.open(`${store}-${phase}`, { config });
  const failedPath = path.join(directory, 'state', runId, `${store}-${phase}-failed.json`);
  const failedRequests = [];
  if (fs.existsSync(failedPath)) {
    for (const request of JSON.parse(fs.readFileSync(failedPath, 'utf8'))) {
      await queue.addRequest({ ...request, uniqueKey: `${request.uniqueKey}:resume:${Date.now()}` });
    }
  }
  const proxyConfiguration = options.proxy ? new ProxyConfiguration(proxyOptions()) : undefined;
  let failures = 0;
  let queued=0,handled=0,active=0;
  let crawler;
  const progress=extra=>onProgress({
    store,phase,engine,queued,handled,failures,saved:storage.saved,...storage.changes,
    active,activeBrowsers:crawler?.browserPool?.activeBrowserControllers?.size||0,
    concurrentRequests:crawler?.autoscaledPool?.currentConcurrency||0,...extra,
  });
  progress({stage:'queueing'});
  let feedMore = null;
  if (phase === 'listing') {
    for (const target of targets){if(signal?.aborted)break;await queue.addRequest({url:target.url,uniqueKey:`${store}:listing:${target.url}`,userData:{target,pageNo:1}});queued++;progress({stage:'queueing'});}
  } else if (options.url) {
    await queue.addRequest({url:validProductUrl(store,options.product),uniqueKey:`${store}:pdp:${options.product.asin||options.product.id}`,userData:{source:minimalSource(options.product)}});
    queued++;
  } else {
    const requestedLimit = options.limit || 0;
    const batchChunkSize = Math.max(50, Math.min(200, requestedLimit || 200));
    let feeding = false, hasMore = true;
    let lastSeenId = null;
    feedMore = async () => {
      if (feeding || !hasMore || signal?.aborted) return;
      feeding = true;
      try {
        const remainingToFetch = requestedLimit > 0 ? (requestedLimit - queued) : batchChunkSize;
        if (requestedLimit > 0 && remainingToFetch <= 0) { hasMore = false; return; }
        const fetchSize = requestedLimit > 0 ? Math.min(batchChunkSize, remainingToFetch) : batchChunkSize;
        const docs = await storage.pendingBatch(store, fetchSize, options.all, lastSeenId);
        if (!docs.length) { hasMore = false; return; }
        lastSeenId = docs[docs.length - 1]._id;
        const requests = docs.map(doc => ({
          url: validProductUrl(store, doc),
          uniqueKey: `${store}:pdp:${doc.asin || doc.id}`,
          userData: { source: minimalSource(doc) }
        }));
        await queue.addRequests(requests);
        queued += requests.length;
        if (docs.length < fetchSize) hasMore = false;
        progress({ stage: 'crawling' });
      } catch (err) {
        log.warning(`Pending batch feed warning: ${err.message}`);
      } finally {
        feeding = false;
      }
    };
    await feedMore();
  }
  if(signal?.aborted)return {failures,stopped:true};
  const checkFeed = () => {
    if (feedMore && (queued - (handled + failures)) < Math.max(50, options.concurrency * 4)) {
      feedMore().catch(err => log.warning(`Pending batch feed warning: ${err.message}`));
    }
  };
  const common = {
    requestQueue: queue, proxyConfiguration, maxConcurrency: options.concurrency,
    maxRequestsPerMinute: options.rate, maxRequestRetries: options.retries, maxSessionRotations:2,
    autoscaledPoolOptions:{desiredConcurrency:options.concurrency},
    useSessionPool: true, persistCookiesPerSession: true, retryOnBlocked: true,
    sessionPoolOptions: {
      persistStateKey: `sessions-${store}-${phase}`,
      maxPoolSize: options.sessions,
      sessionOptions: { maxUsageCount: options.sessionUses },
    },
    requestHandlerTimeoutSecs: phase==='listing'?Math.max(600,options.timeout):options.timeout,
    async failedRequestHandler({ request, page, body }) {
      if(signal?.aborted)return;
      failures++;progress({stage:'crawling'});
      checkFeed();
      failedRequests.push({ url: request.url, uniqueKey: request.uniqueKey, userData: request.userData });
      fs.writeFileSync(failedPath, JSON.stringify(failedRequests, null, 2));
      const html = page ? await page.content().catch(() => '') : body ? String(body) : '';
      if (html) fs.writeFileSync(path.join(directory, 'state', runId, `${store}-${phase}-${request.id}-failed.html`), html);
      log.error(`${store} ${phase} failed: ${request.url} (see saved request queue for retry details)`);
    }
  };
  const processHtml = async (html, request, page) => {
    if (/captcha|robot check|access denied|verify you are human/i.test(html.slice(0, 12000)) && !listing(store, html, request.url).length && phase === 'listing') throw Error('Blocked listing response');
    if(/<title[^>]*>[^<]*(?:robot check|access denied)/i.test(html)||/id=["']captchacharacters["']|action=["'][^"']*validateCaptcha/i.test(html))throw new SessionError('Store returned a blocked response; rotating session');
    if (phase === 'pdp') {
      const row = page && store === 'amazon' ? await amazonPdp(page, request.userData.source) : pdp(store, html, request.url, request.userData.source);
      await storage.save(store, [row], phase);handled++;progress({stage:'crawling',lastUrl:request.url});
      checkFeed();
      return;
    }
    let pageNo = request.userData.pageNo || 1;
    const target = request.userData.target;
    const seen = new Set(request.userData.previousIds || []);
    while (true) {
      if(signal?.aborted)return;
      const rows = listing(store, html, request.url, { ...metadata(target), category_url: target.url, page: pageNo, page_no: pageNo,...(engine==='http'?{http:true}:{}) });
      if (!rows.length) {
        if (/no products found|no results found|did not match any products|no items found/i.test(html)) return;
        if(store==='myntra'&&engine==='http')throw Error(`Myntra HTTP page ${pageNo} returned no products. Coverage is incomplete; the Python HTTP crawler also documents pagination blocks. Retry with --browser-stores myntra if browser pagination is needed.`);
        throw Error(`${store}: no listing products parsed; refusing to treat unknown HTML as catalog end`);
      }
      const fresh = rows.filter(r => !seen.has(r.id));
      if (!fresh.length) throw Error(`${store}: repeated product page detected at page ${pageNo}; category coverage is incomplete.${store==='myntra'&&engine==='http'?' Retry with --browser-stores myntra for browser pagination.':''}`);
      await storage.save(store, fresh, phase);handled++;progress({stage:'crawling'});
      rows.forEach(r => seen.add(r.id));
      log.info(`${store}: category page ${pageNo}, extracted ${rows.length}, saved ${fresh.length}`);
      if (options.pages && pageNo >= options.pages) return;
      // Myntra's rendered Next button is authoritative. Keep cookies and page
      // state together rather than trusting server-rendered ?p= HTML.
      if (page && store === 'myntra') {
        const next = page.locator('li.pagination-next').first();
        if (!await next.count()) return;
        if (/disabled/i.test(await next.getAttribute('class') || '')) return;
        const previous = await page.locator('li.product-base').evaluateAll(cards => cards.slice(0, 10).map(c => c.id).join('|'));
        await next.scrollIntoViewIfNeeded();
        await next.click();
        await page.waitForFunction(signature => {
          const cards = [...document.querySelectorAll('li.product-base')];
          return cards.length && cards.slice(0, 10).map(c => c.id).join('|') !== signature;
        }, previous, { timeout: 20000 });
        await page.waitForTimeout(options.delay);
        await loadLazyContent(page);
        html = await page.content(); pageNo++;
        continue;
      }
      let next = nextUrl(store, html, request.url);
      if(store==='myntra'&&engine==='http'){
        const data=embedded(html,'window.__myx').searchData;
        const total=Number(data?.results?.totalCount??data?.totalCount);
        if(Number.isFinite(total)&&total>=0&&seen.size>=total)return;
        const u=new URL(target.url);u.searchParams.set('p',String(pageNo+1));next=u.href;
      }
      if (!next && store === 'nykaa') {
        const $ = (await import('cheerio')).load(html);
        const totalText = $('h1').text() + ' ' + $('[class*="count"], [class*="Count"]').text();
        const total = Number(totalText.match(/\((\d[\d,]*)\)/)?.[1]?.replace(/,/g, '') || totalText.match(/(\d[\d,]*)\s*products/i)?.[1]?.replace(/,/g, ''));
        if (total && seen.size >= total) return;
        // Nykaa's existing adapter uses page_no, not p/page.
        const u = new URL(request.url); u.searchParams.set('page_no', String(pageNo + 1));
        if (!u.searchParams.has('sort')) u.searchParams.set('sort', 'popularity');
        next = u.href;
      }
      if (!next) return;
      await queue.addRequest({ url: next, uniqueKey: `${store}:listing:${target.url}:${pageNo + 1}`,
        userData: { target, pageNo: pageNo + 1, previousIds: [...seen] } });
      return;
    }
  };
  crawler = engine === 'http' ? new CheerioCrawler({ ...common,
    navigationTimeoutSecs:options.navigationTimeout||45,
    preNavigationHooks:[async({request})=>{request.headers={...request.headers,'accept-language':'en-IN,en-US;q=0.9,en;q=0.8'};}],
    async requestHandler({ body, request }) {active++;try{await processHtml(String(body),request);}finally{active--;progress({stage:'crawling'});}} 
  }, config) : new PlaywrightCrawler({ ...common,
    launchContext: { 
      launcher: chromium, 
      launchOptions: { 
        channel:browserChannel(),
        headless: !options.headful, 
        timeout: 30000,
        args: [
          '--disable-http2',
          '--disable-blink-features=AutomationControlled'
        ]
      }, 
      useIncognitoPages: true 
    },
    browserPoolOptions: { maxOpenPagesPerBrowser: options.tabs, retireBrowserAfterPageCount: options.sessionUses },
    navigationTimeoutSecs: options.navigationTimeout||45,
    preNavigationHooks: [async ({ page }, gotoOptions) => {
      gotoOptions.waitUntil = 'domcontentloaded';
      if (options.blockMedia) await page.route(/\.(?:woff2?|mp4|webm)(?:\?|$)/i, route => route.abort());
    }],
    async requestHandler({ page, request, response }) {
      active++;progress({stage:'crawling',lastUrl:request.url});
      try{
      if ([403, 429, 503].includes(response?.status())) throw new SessionError(`HTTP ${response.status()}`);
      if (phase === 'listing') {
        await page.waitForSelector(selectors[store], { timeout: 20000 }).catch(() => {});
        await loadLazyContent(page);
      }
      if (phase === 'pdp' && store === 'amazon') {
        await page.waitForSelector('#productTitle, #title, #dp, #dp-container, #dpx-detail-page', { timeout: 10000 }).catch(() => {});
      }
      await page.waitForTimeout(options.delay);
      await processHtml(await page.content(), request, page);
      }finally{active--;progress({stage:'crawling'});}
    }
  }, config);
  let forced;const stop=()=>{crawler.stop('Stop requested');forced=setTimeout(()=>{void crawler.teardown().catch(()=>{});},15000);forced.unref();};
  signal?.addEventListener('abort',stop,{once:true});
  const report=setInterval(()=>{
    progress({stage:'crawling'});
    checkFeed();
  },2000);report.unref();
  try{progress({stage:'crawling'});if(signal?.aborted)stop();await crawler.run();}finally{clearInterval(report);clearTimeout(forced);signal?.removeEventListener('abort',stop);}
  if (!failures && fs.existsSync(failedPath)) fs.unlinkSync(failedPath);
  return { failures, stopped:!!signal?.aborted, stats: crawler.stats.state };
}

export async function checkProxy(options) {
  const proxyConfiguration = new ProxyConfiguration(proxyOptions());
  const ips = [];
  const crawler = new CheerioCrawler({ proxyConfiguration, maxConcurrency: Math.min(options.sessions, 3),
    additionalMimeTypes: ['text/plain'],
    useSessionPool: true, sessionPoolOptions: { maxPoolSize: options.sessions, sessionOptions: { maxUsageCount: 1 } },
    maxRequestRetries: 0,
    async requestHandler({ body }) { const ip = String(body).trim(); ips.push(ip); console.log(`Proxy outgoing IP: ${ip}`); },
    async failedRequestHandler() { process.exitCode = 1; console.error('Proxy check failed'); }
  }, new Configuration({ persistStorage: false }));
  await crawler.run(Array.from({ length: options.sessions }, (_, i) => ({ url: 'http://ipv4.webshare.io/', uniqueKey: `proxy-check-${Date.now()}-${i}` })));
  console.log(`Observed ${new Set(ips).size} distinct IP(s) across ${ips.length} requests. Provider controls exit-IP rotation.`);
}
