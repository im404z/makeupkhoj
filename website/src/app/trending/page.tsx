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
  title: 'Trending Makeup Products - Most Popular Cosmetics in India',
  description: 'See which makeup products are trending right now. Top customer-rated foundations, viral lipsticks and bestsellers compared across stores.',
  canonical: '/trending',
});

interface TrendingPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function TrendingPage({ searchParams }: TrendingPageProps) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'popular';

  const result = await queryProducts({
    page,
    limit: 24,
    sort,
  });

  return (
    <div>
      <Breadcrumb items={[{ label: 'Trending Products' }]} />

      <div className="mb-6">
        <span className="text-[11px] font-bold text-pink-600 uppercase tracking-wider bg-pink-50 px-2.5 py-1 rounded-full border border-pink-100 inline-block mb-2">
          🔥 Viral & Most Wanted
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
          Trending Makeup Now
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Top-rated cosmetics with maximum customer interest and positive beauty reviews.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="lg:col-span-1">
          <ProductFilters />
        </div>
        <div className="lg:col-span-3">
          <SortBar total={result.total} />
          <ProductGrid products={result.products} />
          <Pagination currentPage={result.page} totalPages={result.totalPages} />
        </div>
      </div>
    </div>
  );
}

