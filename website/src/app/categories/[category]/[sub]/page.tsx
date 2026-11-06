import React from 'react';
import type { Metadata } from 'next';
import ProductGrid from '@/components/product/ProductGrid';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { ItemListJsonLd } from '@/components/seo/JsonLd';
import { getCategoryBySlug } from '@/lib/constants/categories';
import { queryProducts } from '@/lib/utils/products';
import { constructMetadata } from '@/lib/utils/seo';

interface SubCategoryPageProps {
  params: Promise<{ category: string; sub: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: SubCategoryPageProps): Promise<Metadata> {
  const { category, sub } = await params;
  const cat = getCategoryBySlug(category);
  const subName = sub.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const catName = cat ? cat.name : 'Makeup';

  return constructMetadata({
    title: `${subName} Online - Best ${catName} Price Comparison`,
    description: `Shop top-rated ${subName} online at lowest prices. Compare shade availability, ratings, and discounts across Nykaa, Amazon, Flipkart & Myntra.`,
    canonical: `/categories/${category}/${sub}`,
  });
}

export default async function SubCategoryPage({ params, searchParams }: SubCategoryPageProps) {
  const { category, sub } = await params;
  const sp = await searchParams;
  const cat = getCategoryBySlug(category);
  const subName = sub.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'popular';
  const brand = sp.brand;
  const marketplace = sp.marketplace;
  const minDiscount = sp.minDiscount ? Number(sp.minDiscount) : undefined;
  const rating = sp.rating ? Number(sp.rating) : undefined;

  const result = await queryProducts({
    page,
    limit: 24,
    sub_category: subName,
    sort,
    brand,
    marketplace,
    minDiscount,
    rating,
  });

  const breadcrumbs = [
    { label: 'All Categories', href: '/categories' },
    { label: cat ? cat.name : category, href: `/categories/${category}` },
    { label: subName },
  ];

  return (
    <div>
      <Breadcrumb items={breadcrumbs} />

      <ItemListJsonLd
        name={`${subName} Listings`}
        description={`Compare ${subName} prices across 4 marketplaces`}
        products={result.products}
      />

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
          {subName}
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Explore genuine {subName.toLowerCase()} with multi-retailer price comparisons and ratings.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="lg:col-span-1">
          <ProductFilters currentCategory={category} currentSub={sub} />
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

