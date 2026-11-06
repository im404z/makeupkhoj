import { MetadataRoute } from 'next';
import { CATEGORIES } from '@/lib/constants/categories';
import { getAllBrandsList, queryProducts } from '@/lib/utils/products';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://makeupkhoj.com';
  const now = new Date();

  // Static core routes
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/categories`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/brands`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/deals`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${baseUrl}/trending`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/new-arrivals`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/price-drops`, lastModified: now, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/disclaimer`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];

  // Category & Subcategory routes
  const categoryRoutes: MetadataRoute.Sitemap = [];
  for (const cat of CATEGORIES) {
    categoryRoutes.push({
      url: `${baseUrl}/categories/${cat.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.85,
    });
    for (const sub of cat.subcategories) {
      categoryRoutes.push({
        url: `${baseUrl}/categories/${cat.slug}/${sub.slug}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.8,
      });
    }
  }

  // Top Brands
  let brandRoutes: MetadataRoute.Sitemap = [];
  try {
    const brands = await getAllBrandsList();
    brandRoutes = brands.slice(0, 100).map((b) => ({
      url: `${baseUrl}/brands/${b.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    }));
  } catch (e) {
    console.error('Error generating brand sitemap:', e);
  }

  // Top Products
  let productRoutes: MetadataRoute.Sitemap = [];
  try {
    const pResult = await queryProducts({ limit: 500, sort: 'popular' });
    productRoutes = pResult.products.map((p) => ({
      url: `${baseUrl}/products/${p.slug || p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
  } catch (e) {
    console.error('Error generating product sitemap:', e);
  }

  return [...staticRoutes, ...categoryRoutes, ...brandRoutes, ...productRoutes];
}

