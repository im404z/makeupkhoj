// Product type definitions for MakeupKhoj

export interface Variant {
  variant_id: string;
  sku?: string;
  name: string;
  pack_size?: string;
  price: number;
  mrp: number;
  discount: number;
  in_stock: boolean;
  shade_image?: string;
  expiry?: string | null;
}

export interface PriceHistory {
  price: number;
  date: string;
}

export interface Product {
  _id: string;
  id: string;
  name: string;
  title?: string;
  brand: string;
  category: string;
  sub_category: string;
  sub_sub_category: string;
  category_name?: string;
  category_path?: string;
  category_url?: string;
  breadcrumbs?: string[];
  slug?: string;
  url: string;
  marketplace: 'nykaa' | 'amazon' | 'flipkart' | 'myntra' | 'tatacliq';
  marketplace_name: string;
  price: number;
  mrp?: number;
  currency?: string;
  discount?: string;
  discount_percentage?: number;
  image: string;
  high_res_image?: string;
  images?: string[];
  in_stock?: boolean;
  rating?: number;
  rating_count?: number;
  reviews_count?: number;
  rating_breakdown?: Record<string, number>;
  reviews?: Array<{ text: string; author: string; rating: number; date: string }>;
  customer_photos?: string[];
  description?: string;
  description_html?: string;
  // Makeup-specific attributes
  shade?: string;
  finish?: string;
  formulation?: string;
  coverage?: string;
  skin_type?: string | string[];
  spf?: string | number | null;
  pack_size?: string;
  size?: string;
  gender?: string;
  country_of_origin?: string;
  manufacturer?: string;
  return_policy?: string;
  expiry_date?: string;
  seller_name?: string;
  sku?: string;
  tag?: string;
  is_ad?: string;
  authenticity_badge?: string;
  bestseller_tag?: string;
  variants?: Variant[];
  videos?: string[];
  price_history?: PriceHistory[];
  highest_recorded_price?: number;
  lowest_recorded_price?: number;
  price_last_checked?: string;
  pdp_scraped?: boolean;
  pdp_scraped_at?: string;
  crawled_at?: string;
  updated_at?: string;
  page_no?: number;
}

export interface ProductFilters {
  category?: string;
  sub_category?: string;
  brand?: string[];
  marketplace?: string[];
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  rating?: number;
  in_stock?: boolean;
  finish?: string;
  coverage?: string;
  skin_type?: string;
}

export type SortOption =
  | 'price_asc'
  | 'price_desc'
  | 'discount_desc'
  | 'rating_desc'
  | 'newest'
  | 'popular';

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CategoryInfo {
  slug: string;
  name: string;
  image: string;
  description: string;
  subcategories: SubcategoryInfo[];
}

export interface SubcategoryInfo {
  slug: string;
  name: string;
  parent: string;
}

export interface Brand {
  _id: string;
  name: string;
  slug: string;
  productCount?: number;
  marketplace?: string;
}

