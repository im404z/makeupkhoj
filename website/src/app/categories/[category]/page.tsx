import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductGrid from '@/components/product/ProductGrid';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { ItemListJsonLd } from '@/components/seo/JsonLd';
import { CATEGORIES, getCategoryBySlug } from '@/lib/constants/categories';
import { queryProducts } from '@/lib/utils/products';
import { constructMetadata } from '@/lib/utils/seo';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  const cat = getCategoryBySlug(category);
  const title = cat ? `${cat.name} Online - Best Price Comparison` : 'Makeup Category';
  const description = cat
    ? `${cat.description} Compare live prices across Nykaa, Amazon, Flipkart, and Myntra.`
    : 'Discover cosmetics and compare makeup prices on MakeupKhoj.';

  return constructMetadata({
    title,
    description,
    canonical: `/categories/${category}`,
  });
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { category } = await params;
  const sp = await searchParams;
  const cat = getCategoryBySlug(category);

  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'popular';
  const brand = sp.brand;
  const marketplace = sp.marketplace;
  const minDiscount = sp.minDiscount ? Number(sp.minDiscount) : undefined;
  const rating = sp.rating ? Number(sp.rating) : undefined;

  // Search keyword maps category slug (e.g., face-makeup -> Face, or Foundation, Blush)
  const categoryFilterName = cat ? cat.name.replace(' Makeup', '').trim() : category;

  const result = await queryProducts({
    page,
    limit: 24,
    category: categoryFilterName,
    sort,
    brand,
    marketplace,
    minDiscount,
    rating,
  });

  const breadcrumbs = [
    { label: 'All Categories', href: '/categories' },
    { label: cat ? cat.name : category },
  ];

  return (
    <div>
      <Breadcrumb items={breadcrumbs} />

      <ItemListJsonLd
        name={cat ? cat.name : category}
        description={cat ? cat.description : 'Makeup listings'}
        products={result.products}
      />

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
          {cat ? cat.name : category}
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1 max-w-2xl leading-relaxed">
          {cat ? cat.description : 'Compare prices and find the best beauty deals online.'}
        </p>

        {/* Subcategories tags */}
        {cat && cat.subcategories.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {cat.subcategories.map((sub) => (
              <Link
                key={sub.slug}
                href={`/categories/${cat.slug}/${sub.slug}`}
                className="px-3 py-1 rounded-full text-xs font-semibold bg-pink-50 text-pink-700 hover:bg-pink-600 hover:text-white border border-pink-200 transition-colors"
              >
                {sub.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <div className="lg:col-span-1">
          <ProductFilters currentCategory={category} />
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

