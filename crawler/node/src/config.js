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
  const rows = JSON.parse(fs.readFileSync(path.join(root, 'crawler/makeup_urls.json'), 'utf8')).filter(r => r.marketplace === store);
  if (url) {
    const host = new URL(url).hostname;
    const domain = { amazon: 'amazon.in', flipkart: 'flipkart.com', myntra: 'myntra.com', nykaa: 'nykaa.com' }[store];
    if (host !== domain && !host.endsWith(`.${domain}`)) throw Error('--url must belong to selected marketplace');
    return [rows.find(r => r.url === url) || { marketplace: store, category: 'Makeup', url }];
  }
  return rows.filter(r => !subcategory || r.sub_category.toLowerCase() === subcategory.toLowerCase());
}
