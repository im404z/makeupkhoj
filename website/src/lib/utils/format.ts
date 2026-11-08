// Utilities for formatting, slug generation, and data transformation

export function formatPrice(price: number | undefined | null): string {
  if (price === undefined || price === null || isNaN(price)) return '₹0';
  return `₹${Math.round(price).toLocaleString('en-IN')}`;
}

export function formatDiscount(pct: number | undefined | null): string {
  if (!pct || pct <= 0) return '';
  return `${Math.round(pct)}% OFF`;
}

export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function createProductSlug(product: {
  id?: string;
  name: string;
  brand?: string;
  _id?: string;
}): string {
  const brandPart = product.brand ? slugify(product.brand) : '';
  const namePart = slugify(product.name);
  const idPart = (product.id || String(product._id || '')).slice(-8).replace(/[^a-zA-Z0-9]/g, '');
  
  if (brandPart && !namePart.startsWith(brandPart)) {
    return `${brandPart}-${namePart}-${idPart}`;
  }
  return `${namePart}-${idPart}`;
}

export function truncate(text: string | undefined | null, length: number): string {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

export function getCleanImageUrl(url: string | undefined | null): string {
  if (!url) return '/assets/banners/hero-banner.jpg';
  // Remove Nykaa dynamic resize parameters that might fail or be low-res
  return url.replace(/tr:w-\d+,h-\d+[^/]*\//, '');
}

export function calculateSavings(mrp?: number, price?: number): number {
  if (!mrp || !price || mrp <= price) return 0;
  return Math.round(mrp - price);
}

export function formatRating(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const match = String(value).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  const rating = match ? Number(match[0]) : NaN;
  return Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating.toFixed(1) : null;
}
