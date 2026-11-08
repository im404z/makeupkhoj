import {stripEmoji} from './plain-text.mjs';
import {priceDropPipeline} from './price-drop-query';
import { connectDB } from '@/lib/mongodb';
import { getAllModels, getModelByMarketplace } from '@/lib/models/Product';
import { slugify, createProductSlug } from '@/lib/utils/format';
import { CATALOG_STORES, escapeRegex, normalizePipeline, balancedWindow, interleave } from './catalog-query';
import type { Product } from '@/types/product';
import { cache } from 'react';
import { ObjectId } from 'mongodb';
import { categoryLeafMatch } from '@/lib/constants/category-leaves';
export interface ProductQueryResult { products: Product[]; total: number; page: number; limit: number; totalPages: number; facets?: { brands: Array<{ name: string; count: number }>; categories: Array<{ name: string; count: number }>; marketplaces: Array<{ name: string; count: number }>; priceRange: { min: number; max: number } } }
export interface CatalogParams { page?: number; limit?: number; category?: string; sub_category?: string; brand?: string | string[]; marketplace?: string | string[]; minPrice?: number; maxPrice?: number; minDiscount?: number; rating?: number; inStockOnly?: boolean; finish?: string; coverage?: string; skinType?: string; search?: string; sort?: string }
export function normalizeProduct(doc: any, store?: string): Product {
  const cleanTitle = (v: unknown) => stripEmoji(v).replace(/\u2014/g, '-').replace(/^(?:sponsored\s*ad\s*[-–\u2014:]*\s*|sponsored\s*[-–\u2014:]*\s*|deal\s+of\s+the\s+day\s*[-–\u2014:]*\s*|buy\s+)/i, '').trim();
  const raw = { ...doc, _id: String(doc._id), id: String(doc.id || doc.asin || doc.product_id || doc._id), name: cleanTitle(doc.name || doc.title) || 'Makeup', marketplace: store || doc.marketplace };
  if (raw.title) raw.title = cleanTitle(raw.title);
  if (raw.brand) raw.brand = stripEmoji(raw.brand);
  const number = (v: unknown) => { const m = String(v ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : undefined; };
  raw.price = number(doc.price ?? doc.currentPrice);
  raw.mrp = number(doc.mrp);
  raw.rating = number(doc.rating ?? doc.averageRating);
  raw.rating_count = number(doc.rating_count ?? doc.ratingsCount);
  raw.marketplace_name = doc.marketplace_name || raw.marketplace;
  const secureImage = (value: unknown) => typeof value === 'string' ? value.replace(/^http:\/\//, 'https://') : '';
  raw.image = secureImage(doc.image || doc.mainImage || doc.images?.[0]);
  raw.high_res_image = secureImage(doc.high_res_image);
  raw.images = Array.isArray(doc.images) ? doc.images.map(secureImage).filter(Boolean) : [];
  if (!raw.slug || !/^[-a-zA-Z0-9_]+$/.test(raw.slug)) raw.slug = createProductSlug(raw);
  return raw as Product;
}
export async function queryProducts(params: CatalogParams & {categorySlug?:string;subSlug?:string;priceDropSince?:Date;maxResults?:number}): Promise<ProductQueryResult> {
  await connectDB();
  const page = Math.max(1, Math.floor(Number(params.page) || 1)), limit = Math.min(100, Math.max(1, Math.floor(Number(params.limit) || 24))), skip = (page - 1) * limit;
  const requested = params.marketplace ? (Array.isArray(params.marketplace) ? params.marketplace : [params.marketplace]).map(s => s.toLowerCase().trim()) : null;
  const stores = CATALOG_STORES.filter(s => !requested || requested.includes(s));
  const empty = { products: [], total: 0, page, limit, totalPages: 1 }; if (!stores.length) return empty;
  const clauses: any[] = [];
  if (params.categorySlug) clauses.push(categoryLeafMatch(params.categorySlug,params.subSlug));
  const textGroup = (fields: string[], term: string) => ({ $or: fields.map(f => ({ [f]: { $regex: escapeRegex(term.trim().replace(/-/g, ' ')), $options: 'i' } })) });
  if (params.search?.trim()) clauses.push(textGroup(['name', 'title', 'brand', 'category_name', 'sub_sub_category', 'description'], params.search));
  if (params.category) { const term = /^tools\s*(?:&|and)\s*brushes$/i.test(params.category.replace(/-/g, ' ')) ? 'Tools' : params.category; clauses.push(textGroup(['category', 'sub_category', 'sub_sub_category', 'category_name', 'category_path'], term)); }
  if (params.sub_category) clauses.push(textGroup(['sub_category', 'sub_sub_category', 'category_name'], params.sub_category));
  if (params.brand) { const values = Array.isArray(params.brand) ? params.brand : [params.brand]; const directory = await getAllBrandsList(); const aliases = values.flatMap(value => directory.find(b => b.slug === slugify(value))?.aliases || [value]); clauses.push({ brand: { $in: aliases.map(b => new RegExp('^' + escapeRegex(b.trim()) + '$', 'i')) } }); }
  if (params.inStockOnly) clauses.push({ in_stock: { $ne: false } });
  for (const [key, value] of Object.entries({ finish: params.finish, coverage: params.coverage, skin_type: params.skinType })) if (value) clauses.push({ [key]: { $regex: escapeRegex(value), $options: 'i' } });
  const numeric: any = {};
  const price: any = {}; if (Number.isFinite(params.minPrice)) price.$gte = Number(params.minPrice); if (Number.isFinite(params.maxPrice)) price.$lte = Number(params.maxPrice); if (Object.keys(price).length) numeric.price = price;
  if (Number(params.minDiscount) > 0) numeric.discount_percentage = { $gte: Number(params.minDiscount) };
  if (Number(params.rating) > 0) numeric.rating = { $gte: Number(params.rating), $lte: 5 };
  const pipeline = (store: string): any[] => [...(clauses.length ? [{ $match: { $and: clauses } }] : []), ...normalizePipeline(store), ...(params.priceDropSince ? priceDropPipeline(params.priceDropSince) : []), ...(Object.keys(numeric).length ? [{ $match: numeric }] : [])];
  const counts = await Promise.all(stores.map(async store => { const rows = await getModelByMarketplace(store)!.aggregate([...pipeline(store), { $count: 'total' }]); return rows[0]?.total || 0; }));
  const total = Math.min(counts.reduce((a, b) => a + b, 0),params.maxResults??Infinity); if (!total || skip >= total) return { ...empty, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  let docs: any[];
  if ((!params.sort || params.sort === 'popular') && stores.length > 1) {
    const window = balancedWindow(counts, skip);
    const groups = await Promise.all(stores.map(store => getModelByMarketplace(store)!.aggregate([...pipeline(store), { $sort: { rating_count: -1, rating: -1, _id: 1 } }, { $skip: window.row }, { $limit: limit }]).allowDiskUse(true)));
    docs = interleave(groups).slice(window.offset, window.offset + Math.min(limit,total-skip));
  } else {
    const sort: Record<string, any> = { price_asc: { price: 1, marketplace: 1, _id: 1 }, price_desc: { price: -1, marketplace: 1, _id: 1 }, discount_desc: { discount_percentage: -1, marketplace: 1, _id: 1 }, rating_desc: { rating: -1, rating_count: -1, marketplace: 1, _id: 1 }, newest: { __date: -1, marketplace: 1, _id: 1 }, popular: { rating_count: -1, rating: -1, _id: 1 } };
    const combined: any[] = [...pipeline(stores[0])];
    for (const store of stores.slice(1)) combined.push({ $unionWith: { coll: store + '_makeupkhoj', pipeline: pipeline(store) } });
    if (params.priceDropSince && params.sort === 'newest') combined.push({$set:{__date:'$price_drop.at'}});
    else if (params.sort === 'newest') combined.push({ $set: { __date: { $convert: { input: { $ifNull: ['$crawled_at', { $ifNull: ['$updated_at', { $toDate: '$_id' }] }] }, to: 'date', onError: new Date(0), onNull: new Date(0) } } } });
    combined.push({ $sort: params.priceDropSince&&params.sort==='discount_desc'?{price_drop_percent:-1,marketplace:1,_id:1}:sort[params.sort || 'popular'] || sort.popular }, { $skip: skip }, { $limit: Math.min(limit,total-skip) }, { $project: { __date: 0 } });
    docs = await getModelByMarketplace(stores[0])!.aggregate(combined).allowDiskUse(true);
  }
  const { decorateProductComparisons } = await import('@/lib/matching/catalog');
  return { products: await decorateProductComparisons(docs.map(doc => normalizeProduct(doc))), total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getProductBySlugOrId(slugOrId: string, store?: string): Promise<Product | null> {
  await connectDB();
  const models = getAllModels().filter(model => !store || model.collection.name === store + '_makeupkhoj');

  // 1. Exact match on id, slug, product_id, asin, or _id
  // Crawler collections contain both string and ObjectId IDs. Use native reads
  // here so Mongoose cannot cast a slug (or an ID regex) to ObjectId.
  const exact: any[] = [{ id: slugOrId }, { slug: slugOrId }, { product_id: slugOrId }, { asin: slugOrId }, { _id: slugOrId }];
  if (/^\d+$/.test(slugOrId) && Number.isSafeInteger(Number(slugOrId))) exact.push({ id: Number(slugOrId) }, { product_id: Number(slugOrId) });
  if (ObjectId.isValid(slugOrId) && slugOrId.length === 24) exact.push({ _id: new ObjectId(slugOrId) });

  for (const model of models) {
    const doc = await model.collection.findOne({ $or: exact });
    if (doc) return normalizeProduct(doc, model.collection.name.replace('_makeupkhoj', ''));
  }

  // 2. Extract potential suffix from slug (e.g. "YK90475" from "mac-retro-matte-liquid-lipcolour-YK90475")
  const potentialId = slugOrId.split('-').at(-1);
  if (!potentialId || potentialId.length < 3) return null;

  const flexiblePattern = potentialId.split('').map(c => escapeRegex(c)).join('[-_\\s]?');
  const alternatives: any[] = [
    ...['id', 'asin', 'product_id', 'sku'].flatMap(field => [
      { [field]: { $regex: escapeRegex(potentialId) + '$', $options: 'i' } },
      { [field]: { $regex: flexiblePattern + '$', $options: 'i' } }
    ])
  ];

  const digits = potentialId.replace(/\D/g, '');
  if (digits.length >= 4) {
    for (const field of ['id', 'product_id', 'sku']) {
      alternatives.push({ [field]: { $regex: '[-_]?' + escapeRegex(digits) + '$', $options: 'i' } });
      if (Number.isSafeInteger(Number(digits))) {
        alternatives.push({ [field]: Number(digits) });
        alternatives.push({ [field]: digits });
      }
    }
    alternatives.push({ url: { $regex: '[-_/=]' + escapeRegex(digits) + '(?![0-9])', $options: 'i' } });
  }

  if (/^[a-fA-F0-9]{8}$/.test(potentialId)) {
    alternatives.push({ $expr: { $eq: [{ $substrBytes: [{ $toString: '$_id' }, 16, 8] }, potentialId.toLowerCase()] } });
    alternatives.push({ _id: { $regex: escapeRegex(potentialId) + '$', $options: 'i' } });
  }

  const candidates: Product[] = [];
  const comparable = (value: string) => value.toLowerCase().replace(/-+/g, '-');

  for (const model of models) {
    const docs = await model.collection.find({ $or: alternatives }).limit(15).toArray();
    for (const doc of docs) {
      const product = normalizeProduct(doc, model.collection.name.replace('_makeupkhoj', ''));
      if (comparable(product.slug || '') === comparable(slugOrId)) return product;
      candidates.push(product);
    }
  }

  if (candidates.length === 1) return candidates[0];

  // 3. Fallback: match by title words if slug contains name tokens
  const nameTokens = slugOrId.split('-').filter(t => t.length > 2 && t !== potentialId && !['the', 'and', 'for', 'with'].includes(t));
  if (nameTokens.length >= 2) {
    const titlePattern = nameTokens.slice(0, 4).map(escapeRegex).join('.*');
    for (const model of models) {
      const docs = await model.find({
        $or: [
          { name: { $regex: titlePattern, $options: 'i' } },
          { title: { $regex: titlePattern, $options: 'i' } }
        ]
      }).limit(10).lean();
      for (const doc of docs) {
        const product = normalizeProduct(doc, model.collection.name.replace('_makeupkhoj', ''));
        if (comparable(product.slug || '') === comparable(slugOrId)) return product;
      }
    }
  }

  return null;
}

export async function getCrossMarketplaceOffers(product: Product): Promise<Product[]> {
  await connectDB();
  const offers: Product[] = [product];
  const normalize = (v: unknown) => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const productName = normalize(product.name);
  // Only exact name/brand/variant matches are offers. Similar product titles are
  // not proof that two shades or pack sizes represent the same SKU.
  for (const model of getAllModels()) {
    const store = model.collection.name.replace('_makeupkhoj', ''); if (store === product.marketplace) continue;
    const candidates = await model.find({ brand: new RegExp('^' + escapeRegex(product.brand || '') + '$', 'i'), $or: [{ name: new RegExp('^' + escapeRegex(product.name) + '$', 'i') }, { title: new RegExp('^' + escapeRegex(product.name) + '$', 'i') }] }).limit(10).lean();
    const candidate = candidates.map(doc => normalizeProduct(doc, store)).find(p => normalize(p.name) === productName && ['shade', 'pack_size', 'size'].every(key => { const a = (product as any)[key], b = (p as any)[key]; return !a && !b || normalize(a) === normalize(b); }) && Number(p.price) > 0);
    if (candidate) offers.push(candidate);
  }
  return offers.sort((a, b) => Number(a.price) - Number(b.price));
}

let cachedBrandsList: Array<{ name: string; count: number; slug: string; aliases: string[] }> | null = null;
let cachedBrandsTime = 0;
const BRANDS_CACHE_TTL_MS = 60 * 60 * 1000;

export const getAllBrandsList = cache(async (): Promise<Array<{ name: string; count: number; slug: string; aliases: string[] }>> => {
  if (cachedBrandsList && Date.now() - cachedBrandsTime < BRANDS_CACHE_TTL_MS) {
    return cachedBrandsList;
  }
  await connectDB();
  const models = getAllModels();
  const brandMap: Record<string, number> = {};

  for (const model of models) {
    const brands = await model.aggregate([
      { $match: { brand: { $exists: true, $ne: '' } } },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    for (const b of brands) {
      const name = typeof b._id === 'string' ? b._id.trim() : '';
      if (!name || name === 'Unknown') continue;
      brandMap[name] = (brandMap[name] || 0) + b.count;
    }
  }

  const grouped = new Map<string, { name: string; count: number; slug: string; aliases: string[] }>();
  for (const [name, count] of Object.entries(brandMap).sort((a, b) => b[1] - a[1])) {
    const slug = slugify(name); if (!slug) continue;
    const existing = grouped.get(slug);
    if (existing) { existing.count += count; existing.aliases.push(name); }
    else grouped.set(slug, { name, count, slug, aliases: [name] });
  }
  const result = [...grouped.values()].sort((a, b) => b.count - a.count);
  cachedBrandsList = result;
  cachedBrandsTime = Date.now();
  return result;
});

export async function resolveBrandSlug(slug: string) {
  const decoded = decodeURIComponent(slug).toLowerCase();
  return (await getAllBrandsList()).find(b => b.slug === decoded || b.aliases.some(name => name.toLowerCase() === decoded || name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '') === decoded));
}

