import { connectDB } from '@/lib/mongodb';
import { getModelByMarketplace } from '@/lib/models/Product';
import { CATALOG_STORES } from './catalog-query';
import {comparisonSitemapCount} from '@/lib/matching/catalog';
export const SITEMAP_SIZE=20_000;
export const siteUrl=()=> (process.env.NEXT_PUBLIC_SITE_URL||'https://www.makeupkhoj.shop').replace(/\/$/,'');
export const xmlEscape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function sitemapIndexResponse(paths: string[]) {
  const base = siteUrl();
  const entries = paths.map(path => `<sitemap><loc>${xmlEscape(base + path)}</loc></sitemap>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
export async function productSitemapPaths(){
  await connectDB();
  const groups=await Promise.all(CATALOG_STORES.map(async store=>({store,count:await getModelByMarketplace(store)!.estimatedDocumentCount()})));
  return [...groups.flatMap(({store,count})=>Array.from({length:Math.ceil(count/SITEMAP_SIZE)},(_,i)=>`/sitemaps/${store}/${i}.xml`)),...Array.from({length:Math.ceil(await comparisonSitemapCount()/SITEMAP_SIZE)},(_,i)=>`/sitemaps/compare/${i}.xml`)];
}
