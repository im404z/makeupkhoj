import React from 'react';
import type { Metadata } from 'next';
import ProductGrid from '@/components/product/ProductGrid';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { ItemListJsonLd } from '@/components/seo/JsonLd';
import { queryProducts, getAllBrandsList } from '@/lib/utils/products';
import { constructMetadata } from '@/lib/utils/seo';

interface BrandDetailPageProps {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: BrandDetailPageProps): Promise<Metadata> {
  const { brand } = await params;
  const decodedBrand = decodeURIComponent(brand).replace(/-/g, ' ');
  const capitalized = decodedBrand.replace(/\b\w/g, (c) => c.toUpperCase());

  return constructMetadata({
    title: `${capitalized} Makeup Online - Best Prices & Discounts`,
    description: `Shop authentic ${capitalized} cosmetics online. Compare prices, discounts and shades across Nykaa, Amazon, Flipkart, and Myntra.`,
    canonical: `/brands/${brand}`,
  });
}

export default async function BrandDetailPage({ params, searchParams }: BrandDetailPageProps) {
  const { brand } = await params;
  const sp = await searchParams;

  const decodedBrand = decodeURIComponent(brand).replace(/-/g, ' ');
  const brandName = decodedBrand.replace(/\b\w/g, (c) => c.toUpperCase());

  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'popular';
  const marketplace = sp.marketplace;
  const minDiscount = sp.minDiscount ? Number(sp.minDiscount) : undefined;
  const rating = sp.rating ? Number(sp.rating) : undefined;

  const result = await queryProducts({
    page,
    limit: 24,
    brand: decodedBrand,
    sort,
    marketplace,
    minDiscount,
    rating,
  });

  const breadcrumbs = [
    { label: 'All Brands', href: '/brands' },
    { label: brandName },
  ];

  return (
    <div>
      <Breadcrumb items={breadcrumbs} />

      <ItemListJsonLd
        name={`${brandName} Cosmetics`}
        description={`Compare all ${brandName} makeup prices and discounts`}
        products={result.products}
      />

      <div className="mb-6 bg-white rounded-3xl border border-pink-100 p-6 sm:p-8 shadow-sm">
        <div className="max-w-2xl">
          <span className="text-[11px] font-bold text-pink-600 uppercase tracking-wider bg-pink-50 px-2.5 py-1 rounded-full border border-pink-100 inline-block mb-2">
            Verified Brand Catalog
          </span>
          <h1 className="text-2xl sm:text-4xl font-black text-neutral-900 tracking-tight">
            {brandName}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-2 leading-relaxed">
            Compare prices for {brandName} cosmetics. Find authentic listings, customer ratings, shades and maximum discounts across leading stores.
          </p>
        </div>
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

