import { MetadataRoute } from 'next';
import { CATEGORIES } from '@/lib/constants/categories';
import { getAllBrandsList } from '@/lib/utils/products';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://makeupkhoj.com';
  const now = new Date();

  // Static core routes
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/products`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/compare-products`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/categories`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/brands`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/deals`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/trending`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/new-arrivals`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/price-drops`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/contact`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/terms`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/disclaimer`, changeFrequency: 'monthly', priority: 0.3 },
  ];

  // Category & Subcategory routes
  const categoryRoutes: MetadataRoute.Sitemap = [];
  for (const cat of CATEGORIES) {
    categoryRoutes.push({
      url: `${baseUrl}/categories/${cat.slug}`,

      changeFrequency: 'daily',
      priority: 0.85,
    });
    for (const sub of cat.subcategories) {
      categoryRoutes.push({
        url: `${baseUrl}/categories/${cat.slug}/${sub.slug}`,

        changeFrequency: 'daily',
        priority: 0.8,
      });
    }
  }

  // Top Brands
  let brandRoutes: MetadataRoute.Sitemap = [];
  try {
    const brands = await getAllBrandsList();
    brandRoutes = brands.map((b) => ({
      url: `${baseUrl}/brands/${b.slug}`,

      changeFrequency: 'weekly' as const,
      priority: 0.75,
    }));
  } catch (e) {
    console.error('Error generating brand sitemap:', e);
  }

  // Product URLs are split by store into 10,000-entry sitemaps.
  // See /sitemap-index.xml, referenced from robots.txt.
  return [...staticRoutes, ...categoryRoutes, ...brandRoutes];
}
