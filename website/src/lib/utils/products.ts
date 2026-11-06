import { connectDB } from '@/lib/mongodb';
import { getAllModels, getModelByMarketplace } from '@/lib/models/Product';
import { slugify, createProductSlug } from '@/lib/utils/format';
import type { Product } from '@/types/product';

export interface ProductQueryResult {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets?: {
    brands: Array<{ name: string; count: number }>;
    categories: Array<{ name: string; count: number }>;
    marketplaces: Array<{ name: string; count: number }>;
    priceRange: { min: number; max: number };
  };
}

export async function queryProducts(params: {
  page?: number;
  limit?: number;
  category?: string;
  sub_category?: string;
  brand?: string | string[];
  marketplace?: string | string[];
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  rating?: number;
  inStockOnly?: boolean;
  finish?: string;
  coverage?: string;
  skinType?: string;
  search?: string;
  sort?: string;
}): Promise<ProductQueryResult> {
  await connectDB();

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 24));
  const skip = (page - 1) * limit;

  // Build MongoDB match query
  const query: Record<string, any> = {};

  if (params.search) {
    const s = params.search.trim();
    query.$or = [
      { name: { $regex: s, $options: 'i' } },
      { brand: { $regex: s, $options: 'i' } },
      { category_name: { $regex: s, $options: 'i' } },
      { sub_sub_category: { $regex: s, $options: 'i' } },
      { description: { $regex: s, $options: 'i' } },
    ];
  }

  if (params.category) {
    const cat = params.category.toLowerCase().replace(/-/g, ' ');
    query.$or = [
      ...(query.$or || []),
      { category: { $regex: cat, $options: 'i' } },
      { sub_category: { $regex: cat, $options: 'i' } },
      { sub_sub_category: { $regex: cat, $options: 'i' } },
      { category_name: { $regex: cat, $options: 'i' } },
      { category_path: { $regex: cat, $options: 'i' } },
    ];
  }

  if (params.sub_category) {
    const sub = params.sub_category.toLowerCase().replace(/-/g, ' ');
    query.$or = [
      ...(query.$or || []),
      { sub_category: { $regex: sub, $options: 'i' } },
      { sub_sub_category: { $regex: sub, $options: 'i' } },
      { category_name: { $regex: sub, $options: 'i' } },
    ];
  }

  if (params.brand) {
    const brands = Array.isArray(params.brand) ? params.brand : [params.brand];
    query.brand = { $in: brands.map((b) => new RegExp(`^${b.trim()}$`, 'i')) };
  }

  if (params.marketplace) {
    const mps = Array.isArray(params.marketplace) ? params.marketplace : [params.marketplace];
    query.marketplace = { $in: mps.map((m) => m.toLowerCase().trim()) };
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    query.price = {};
    if (params.minPrice !== undefined && params.minPrice > 0) query.price.$gte = Number(params.minPrice);
    if (params.maxPrice !== undefined && params.maxPrice > 0) query.price.$lte = Number(params.maxPrice);
  }

  if (params.minDiscount !== undefined && params.minDiscount > 0) {
    query.discount_percentage = { $gte: Number(params.minDiscount) };
  }

  if (params.rating !== undefined && params.rating > 0) {
    query.rating = { $gte: Number(params.rating) };
  }

  if (params.inStockOnly) {
    query.in_stock = { $ne: false };
  }

  if (params.finish) {
    query.finish = { $regex: params.finish, $options: 'i' };
  }
  if (params.coverage) {
    query.coverage = { $regex: params.coverage, $options: 'i' };
  }

  // Determine which collection(s) to query
  let models = getAllModels();
  if (params.marketplace && !Array.isArray(params.marketplace)) {
    const singleModel = getModelByMarketplace(params.marketplace);
    if (singleModel) models = [singleModel];
  }

  // Sorting
  const sortMap: Record<string, any> = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    discount_desc: { discount_percentage: -1 },
    rating_desc: { rating: -1 },
    newest: { crawled_at: -1, _id: -1 },
    popular: { rating_count: -1, rating: -1 },
  };
  const sortObj = sortMap[params.sort || 'popular'] || { rating_count: -1, _id: -1 };

  // Fetch from all collections
  const counts = await Promise.all(models.map((m) => m.countDocuments(query)));
  const total = counts.reduce((acc, c) => acc + c, 0);

  // Read docs
  let allDocs: any[] = [];
  for (const m of models) {
    const docs = await m.find(query).sort(sortObj).limit(limit + skip).lean();
    allDocs = allDocs.concat(docs);
  }

  // In-memory sort across collections if multiple collections queried
  if (models.length > 1) {
    if (params.sort === 'price_asc') allDocs.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (params.sort === 'price_desc') allDocs.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (params.sort === 'discount_desc') allDocs.sort((a, b) => (b.discount_percentage || 0) - (a.discount_percentage || 0));
    else if (params.sort === 'rating_desc') allDocs.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else allDocs.sort((a, b) => (b.rating_count || 0) - (a.rating_count || 0));
  }

  const pagedDocs = allDocs.slice(skip, skip + limit);

  // Normalize product slugs and types
  const products: Product[] = pagedDocs.map((doc: any) => {
    const raw = { ...doc, _id: String(doc._id) };
    if (!raw.slug) {
      raw.slug = createProductSlug(raw);
    }
    return raw as Product;
  });

  return {
    products,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getProductBySlugOrId(slugOrId: string): Promise<Product | null> {
  await connectDB();
  const models = getAllModels();

  for (const model of models) {
    // 1. Direct match on id or slug
    let doc = await model.findOne({
      $or: [
        { id: slugOrId },
        { slug: slugOrId },
        { product_id: slugOrId },
      ],
    }).lean();

    if (doc) {
      const p = { ...doc, _id: String(doc._id) } as any;
      if (!p.slug) p.slug = createProductSlug(p);
      return p as Product;
    }

    // 2. Extract trailing id from slug (e.g., "lakme-matte-lipstick-12345678")
    const parts = slugOrId.split('-');
    const potentialId = parts[parts.length - 1];
    if (potentialId && potentialId.length >= 4) {
      doc = await model.findOne({
        $or: [
          { id: { $regex: potentialId, $options: 'i' } },
          { product_id: { $regex: potentialId, $options: 'i' } },
        ],
      }).lean();
      if (doc) {
        const p = { ...doc, _id: String(doc._id) } as any;
        if (!p.slug) p.slug = createProductSlug(p);
        return p as Product;
      }
    }
  }

  return null;
}

export async function getCrossMarketplaceOffers(product: Product): Promise<Product[]> {
  await connectDB();
  const models = getAllModels();
  const cleanName = product.name.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const first3Words = cleanName.split(/\s+/).slice(0, 3).join(' ');

  const offers: Product[] = [product];

  for (const model of models) {
    if (model.collection.name === product.marketplace + '_makeupkhoj') continue;
    const match = await model.findOne({
      brand: new RegExp(`^${product.brand}$`, 'i'),
      name: { $regex: first3Words, $options: 'i' },
    }).lean();

    if (match) {
      const p = { ...match, _id: String(match._id) } as any;
      if (!p.slug) p.slug = createProductSlug(p);
      offers.push(p as Product);
    }
  }

  return offers.sort((a, b) => a.price - b.price);
}

export async function getAllBrandsList(): Promise<Array<{ name: string; count: number; slug: string }>> {
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
      const name = b._id;
      brandMap[name] = (brandMap[name] || 0) + b.count;
    }
  }

  return Object.entries(brandMap)
    .map(([name, count]) => ({
      name,
      count,
      slug: slugify(name),
    }))
    .sort((a, b) => b.count - a.count);
}

