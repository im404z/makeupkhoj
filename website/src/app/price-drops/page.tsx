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
  title: 'Makeup Price Drop Alerts - Live Price Slashes',
  description: 'Track price drops on makeup and cosmetics. Instant notifications and best historical prices for premium beauty brands.',
  canonical: '/price-drops',
});

interface PriceDropsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PriceDropsPage({ searchParams }: PriceDropsPageProps) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'discount_desc';

  const result = await queryProducts({
    page,
    limit: 24,
    minDiscount: 20,
    sort,
  });

  return (
    <div>
      <Breadcrumb items={[{ label: 'Price Drops' }]} />

      <div className="mb-6">
        <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider bg-rose-50 px-2.5 py-1 rounded-full border border-rose-100 inline-block mb-2">
          📉 Live Price Drops
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
          Makeup Price Drops
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Products with recent price reductions. Grab them before prices rise again!
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

