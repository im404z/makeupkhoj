import { productSitemapPaths, siteUrl, xmlEscape } from '@/lib/utils/sitemaps';
export const runtime='nodejs';
export async function GET(){
  const urls=['/sitemap.xml',...await productSitemapPaths()];
  const xml=`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(p=>`<sitemap><loc>${xmlEscape(siteUrl()+p)}</loc></sitemap>`).join('')}</sitemapindex>`;
  return new Response(xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300'}});
}
