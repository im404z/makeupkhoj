import { productSitemapPaths, sitemapIndexResponse } from '@/lib/utils/sitemaps';

export const runtime = 'nodejs';

export async function GET() {
  return sitemapIndexResponse(await productSitemapPaths());
}
