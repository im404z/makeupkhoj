import React from 'react';
import type { Metadata } from 'next';
import ProductGrid from '@/components/product/ProductGrid';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { ItemListJsonLd } from '@/components/seo/JsonLd';
import { queryProducts } from '@/lib/utils/products';
import { constructMetadata } from '@/lib/utils/seo';

export const metadata: Metadata = constructMetadata({
  title: 'All Makeup Products - Compare Prices & Beauty Deals',
  description:
    'Browse complete makeup catalog. Compare prices for foundations, lipsticks, blushes and eye makeup across Nykaa, Amazon, Flipkart, and Myntra.',
  canonical: '/products',
});

interface ProductsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'popular';
  const brand = sp.brand;
  const marketplace = sp.marketplace;
  const minDiscount = sp.minDiscount ? Number(sp.minDiscount) : undefined;
  const rating = sp.rating ? Number(sp.rating) : undefined;
  const minPrice = sp.minPrice ? Number(sp.minPrice) : undefined;
  const maxPrice = sp.maxPrice ? Number(sp.maxPrice) : undefined;
  const inStock = sp.inStock === 'true';

  const result = await queryProducts({
    page,
    limit: 24,
    sort,
    brand,
    marketplace,
    minDiscount,
    rating,
    minPrice,
    maxPrice,
    inStockOnly: inStock,
  });

  return (
    <div>
      <Breadcrumb items={[{ label: 'All Products' }]} />

      <ItemListJsonLd
        name="All Makeup Products"
        description="Complete list of authentic cosmetics with multi-store price comparisons"
        products={result.products}
      />

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
          All Makeup Products
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Compare verified cosmetic products across India&apos;s leading beauty retailers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Filters Sidebar */}
        <div className="lg:col-span-1">
          <ProductFilters />
        </div>

        {/* Product Grid & Sort */}
        <div className="lg:col-span-3">
          <SortBar total={result.total} />
          <ProductGrid products={result.products} />
          <Pagination currentPage={result.page} totalPages={result.totalPages} />
        </div>
      </div>
    </div>
  );
}

