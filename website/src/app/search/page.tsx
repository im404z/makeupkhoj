import React from 'react';
import type { Metadata } from 'next';
import ProductGrid from '@/components/product/ProductGrid';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { queryProducts } from '@/lib/utils/products';
import { constructMetadata } from '@/lib/utils/seo';

export const metadata: Metadata = constructMetadata({
  title: 'Search Makeup Products & Brands',
  description: 'Search across 100,000+ makeup items from Nykaa, Amazon, Flipkart and Myntra with live price comparison.',
  noindex: true,
});

interface SearchPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'popular';
  const brand = sp.brand;
  const marketplace = sp.marketplace;
  const minDiscount = sp.minDiscount ? Number(sp.minDiscount) : undefined;
  const rating = sp.rating ? Number(sp.rating) : undefined;

  const result = await queryProducts({
    page,
    limit: 24,
    search: q,
    sort,
    brand,
    marketplace,
    minDiscount,
    rating,
  });

  return (
    <div>
      <Breadcrumb items={[{ label: 'Search Results', href: '/search' }, { label: q ? `"${q}"` : 'All' }]} />

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
          {q ? `Search Results for "${q}"` : 'Search MakeupKhoj'}
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Found {result.total} matching cosmetics across all retailers.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="lg:col-span-1">
          <ProductFilters />
        </div>
        <div className="lg:col-span-3">
          <SortBar total={result.total} />
          <ProductGrid products={result.products} emptyMessage={`No makeup products matching "${q}". Try searching for brands like Charlotte Tilbury, Lakmé, or categories like Foundation, Blush.`} />
          <Pagination currentPage={result.page} totalPages={result.totalPages} />
        </div>
      </div>
    </div>
  );
}

