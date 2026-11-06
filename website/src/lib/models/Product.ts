import mongoose, { Schema, Model } from 'mongoose';
import type { Product } from '@/types/product';

type ProductDocument = Product & mongoose.Document;

const VariantSchema = new Schema({
  variant_id: String,
  sku: String,
  name: String,
  pack_size: String,
  price: Number,
  mrp: Number,
  discount: Number,
  in_stock: Boolean,
  shade_image: String,
  expiry: Schema.Types.Mixed,
}, { _id: false });

const ProductSchema = new Schema<ProductDocument>({
  id: { type: String, index: true },
  name: { type: String, required: true, index: true },
  title: String,
  brand: { type: String, index: true },
  category: String,
  sub_category: String,
  sub_sub_category: { type: String, index: true },
  category_name: String,
  category_path: String,
  category_url: String,
  breadcrumbs: [String],
  slug: { type: String, index: true },
  url: String,
  marketplace: { type: String, index: true },
  marketplace_name: String,
  price: { type: Number, index: true },
  mrp: Number,
  currency: String,
  discount: String,
  discount_percentage: { type: Number, index: true },
  image: String,
  high_res_image: String,
  images: [String],
  in_stock: Boolean,
  rating: { type: Number, index: true },
  rating_count: Number,
  reviews_count: Number,
  rating_breakdown: Schema.Types.Mixed,
  reviews: Schema.Types.Mixed,
  customer_photos: [String],
  description: String,
  description_html: String,
  shade: String,
  finish: String,
  formulation: String,
  coverage: String,
  skin_type: Schema.Types.Mixed,
  spf: Schema.Types.Mixed,
  pack_size: String,
  size: String,
  gender: String,
  country_of_origin: String,
  manufacturer: String,
  return_policy: String,
  expiry_date: String,
  seller_name: String,
  sku: String,
  tag: String,
  is_ad: String,
  authenticity_badge: String,
  bestseller_tag: String,
  variants: [VariantSchema],
  videos: [String],
  price_history: Schema.Types.Mixed,
  highest_recorded_price: Number,
  lowest_recorded_price: Number,
  price_last_checked: String,
  pdp_scraped: Boolean,
  pdp_scraped_at: String,
  crawled_at: String,
  updated_at: String,
  page_no: Number,
}, {
  timestamps: false,
  strict: false, // allow extra fields from MongoDB
});

// Compound text index for search
ProductSchema.index({ name: 'text', brand: 'text', description: 'text' });

// Helper to get collection model per marketplace
function getProductModel(collectionName: string): Model<ProductDocument> {
  return (
    mongoose.models[collectionName] ||
    mongoose.model<ProductDocument>(collectionName, ProductSchema, collectionName)
  );
}

// All marketplace collections
export const MARKETPLACE_COLLECTIONS = {
  nykaa: 'nykaa_makeupkhoj',
  amazon: 'amazon_makeupkhoj',
  flipkart: 'flipkart_makeupkhoj',
  myntra: 'myntra_makeupkhoj',
  tatacliq: 'tatacliq_makeupkhoj',
} as const;

export function getNykaaModel() { return getProductModel('nykaa_makeupkhoj'); }
export function getAmazonModel() { return getProductModel('amazon_makeupkhoj'); }
export function getFlipkartModel() { return getProductModel('flipkart_makeupkhoj'); }
export function getMyntraModel() { return getProductModel('myntra_makeupkhoj'); }
export function getTatacliqModel() { return getProductModel('tatacliq_makeupkhoj'); }

export function getAllModels() {
  return Object.values(MARKETPLACE_COLLECTIONS).map(col => getProductModel(col));
}

export function getModelByMarketplace(marketplace: string) {
  const col = MARKETPLACE_COLLECTIONS[marketplace as keyof typeof MARKETPLACE_COLLECTIONS];
  return col ? getProductModel(col) : null;
}

export default getProductModel;

