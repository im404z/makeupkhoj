import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
export const directory = fileURLToPath(new URL('../', import.meta.url));
export const root = path.resolve(directory, '../..');
dotenv.config({ path: path.join(directory, '.env') });
dotenv.config({ path: path.join(root, '.env') });
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.join(directory, 'browsers');
export const stores = ['amazon', 'flipkart', 'myntra', 'nykaa'];
export const collections = Object.fromEntries(stores.map(s => [s, `${s}_makeupkhoj`]));
export function proxyUrls(env = process.env) {
  const urls = env.CRAWLER_PROXY_URLS ? JSON.parse(env.CRAWLER_PROXY_URLS) : [env.CRAWLER_PROXY_URL];
  if (!Array.isArray(urls) || !urls.length || urls.some(u => !u)) throw Error('Set CRAWLER_PROXY_URL in crawler/node/.env');
  for (const u of urls) if (!['http:', 'https:'].includes(new URL(u).protocol)) throw Error('HTTP(S) proxy required');
  return urls;
}
export function proxyOptions(env=process.env){
 if(env.CRAWLER_PROXY_URL_TEMPLATE){
  const template=env.CRAWLER_PROXY_URL_TEMPLATE;if(!template.includes('{sessionId}'))throw Error('Proxy template must contain {sessionId}');
  const example=new URL(template.replaceAll('{sessionId}','test'));if(!['http:','https:'].includes(example.protocol))throw Error('HTTP(S) proxy required');
  return {newUrlFunction:sessionId=>template.replaceAll('{sessionId}',encodeURIComponent(String(sessionId)))};
 }
 return {proxyUrls:proxyUrls(env)};
}
export function targets(store, url, subcategory) {
  if(!stores.includes(store))throw Error('Invalid marketplace');
  const source=path.join(root,'crawler',store,`${store}_makeup_urls.json`);
  const rows = JSON.parse(fs.readFileSync(source, 'utf8'));
  if(!Array.isArray(rows)||rows.some(r=>r.marketplace!==store||!r.url))throw Error('Invalid category URL file for '+store);
  const domain = { amazon: 'amazon.in', flipkart: 'flipkart.com', myntra: 'myntra.com', nykaa: 'nykaa.com' }[store];
  for(const row of rows){const parsed=new URL(row.url);if(!['http:','https:'].includes(parsed.protocol)||(parsed.hostname!==domain&&!parsed.hostname.endsWith('.'+domain)))throw Error('Invalid category domain for '+store);}
  if (url) {
    const host = new URL(url).hostname;
    const domain = { amazon: 'amazon.in', flipkart: 'flipkart.com', myntra: 'myntra.com', nykaa: 'nykaa.com' }[store];
    if (host !== domain && !host.endsWith(`.${domain}`)) throw Error('--url must belong to selected marketplace');
    return [rows.find(r => r.url === url) || { marketplace: store, category: 'Makeup', url }];
  }
  return rows.filter(r => !subcategory || String(r.sub_category||'').toLowerCase() === subcategory.toLowerCase());
}

export function resolveEngine(store,phase,options){
  if(options.engine&&options.engine!=='auto')return options.engine;
  if(options.browserStores?.includes(store))return 'browser';
  return phase==='listing'&&store!=='amazon'?'http':'browser';
}

export function browserChannel(env=process.env){
  if(env.CRAWLER_BROWSER_CHANNEL)return env.CRAWLER_BROWSER_CHANNEL==='bundled'?undefined:env.CRAWLER_BROWSER_CHANNEL;
  if(process.platform==='win32'){
    for(const base of [env.PROGRAMFILES,env['PROGRAMFILES(X86)'],env.LOCALAPPDATA].filter(Boolean)){
      if(fs.existsSync(path.join(base,'Google/Chrome/Application/chrome.exe')))return 'chrome';
    }
  }
  return undefined;
}
