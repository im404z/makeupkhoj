import { connectDB } from '@/lib/mongodb';
import { getModelByMarketplace } from '@/lib/models/Product';
import { CATALOG_STORES } from '@/lib/utils/catalog-query';
import { normalizeProduct } from '@/lib/utils/products';
import { SITEMAP_SIZE, siteUrl, xmlEscape } from '@/lib/utils/sitemaps';
import {catalogDB,catalogEnabled,comparisonSitemapRows} from '@/lib/matching/catalog';
import {groupPath} from '@/lib/matching/engine.mjs';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{store:string;chunk:string}>}){
  const {store,chunk}=await params;
  if(store!=='compare'&&!(CATALOG_STORES as readonly string[]).includes(store)||!/^\d+\.xml$/.test(chunk))return new Response('Not found',{status:404});
  const index=Number(chunk.replace('.xml',''));
  if(index>10000)return new Response('Not found',{status:404});
  if(store==='compare'){
    const rows=await comparisonSitemapRows(index*SITEMAP_SIZE,SITEMAP_SIZE);if(!rows.length)return new Response('Not found',{status:404});
    const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.map((r:any)=>{const d=new Date(r.node?.updatedAt||r.node?.createdAt||'');return `<url><loc>${xmlEscape(siteUrl()+groupPath(r.node))}</loc>${Number.isFinite(d.getTime())?`<lastmod>${d.toISOString()}</lastmod>`:''}</url>`;}).join('')}</urlset>`;
    return new Response(xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});
  }
  await connectDB();
  const docs=await getModelByMarketplace(store)!.find({},{id:1,asin:1,name:1,title:1,brand:1,slug:1,marketplace:1,updated_at:1,crawled_at:1}).sort({_id:1}).skip(index*SITEMAP_SIZE).limit(SITEMAP_SIZE).lean();
  if(!docs.length)return new Response('Not found',{status:404});
  const mapped=new Set<string>();if(await catalogEnabled()){const db=await catalogDB(),aliases=await db.collection('catalog_nodes').find({parent:{$ne:null}},{projection:{parent:1}}).toArray(),groupSkus=[...new Set(aliases.flatMap((a:any)=>[a._id,a.parent]))];const records=await db.collection('catalog_sources').find({_id:{$in:docs.map(d=>store+':'+String(d._id))},siteSku:{$in:groupSkus},suspended:{$ne:true}}).project({_id:1}).toArray();for(const r of records)mapped.add(r._id);}
  const urls=[...new Map(docs.filter(doc=>!mapped.has(store+':'+String(doc._id))).map(doc=>{const p=normalizeProduct(doc,store);return [p.slug||p.id,p];})).values()];
  const xml=`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(p=>{const date=new Date(p.updated_at||p.crawled_at||'');return `<url><loc>${xmlEscape(siteUrl()+'/product/'+encodeURIComponent(p.slug||p.id))}</loc>${Number.isFinite(date.getTime())?`<lastmod>${date.toISOString()}</lastmod>`:''}</url>`;}).join('')}</urlset>`;
  return new Response(xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});
}
