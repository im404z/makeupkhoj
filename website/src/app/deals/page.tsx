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
  title: 'Top Makeup Deals Today - Up to 60% Off Cosmetics',
  description: 'Shop verified makeup deals with huge discounts across Nykaa, Amazon, Flipkart and Myntra. Price drops on authentic lipstick, foundation & eyeshadow.',
  canonical: '/deals',
});

interface DealsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'discount_desc';
  const minDiscount = sp.minDiscount ? Number(sp.minDiscount) : 15;

  const result = await queryProducts({
    page,
    limit: 24,
    minDiscount,
    sort,
  });

  return (
    <div>
      <Breadcrumb items={[{ label: 'Top Deals' }]} />

      <div className="mb-6">
        <span className="text-[11px] font-bold text-pink-600 uppercase tracking-wider bg-pink-50 px-2.5 py-1 rounded-full border border-pink-100 inline-block mb-2">
          🔥 Steal Deals & Maximum Savings
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
          Top Makeup Deals Today
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Hand-picked genuine cosmetics with minimum 15% discount across top retailers.
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

