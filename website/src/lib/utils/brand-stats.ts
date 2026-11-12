import brandStatsJson from '../../data/brand-stats.json';
import { slugify } from './format';

export interface BrandStats {
  name: string;
  slug: string;
  aliases: string[];
  productCount: number;
  minPrice: number | null;
  maxPrice: number | null;
  priceRange: string | null;
  avgRating: number | null;
  ratingCount: number;
  ratedProductsCount: number;
}

const statsMap = (brandStatsJson || {}) as Record<string, BrandStats>;

/**
 * Fast O(1) lookup of precomputed brand stats generated at build time.
 */
export function getBrandStats(slugOrName: string): BrandStats | null {
  if (!slugOrName) return null;
  const slug = slugify(slugOrName);
  if (!slug) return null;

  // Direct key lookup
  if (statsMap[slug]) return statsMap[slug];

  // Lookup by normalized name or alias
  const normalized = slugOrName.toLowerCase().trim();
  for (const item of Object.values(statsMap)) {
    if (item.name.toLowerCase() === normalized) return item;
    if (item.aliases?.some(a => a.toLowerCase() === normalized)) return item;
  }

  return null;
}

export function getAllBrandStatsMap(): Record<string, BrandStats> {
  return statsMap;
}
