import { productSitemapPaths, sitemapIndexResponse } from '@/lib/utils/sitemaps';
export const runtime='nodejs';
export async function GET(){
  return sitemapIndexResponse(['/sitemap.xml', ...await productSitemapPaths()]);
}
