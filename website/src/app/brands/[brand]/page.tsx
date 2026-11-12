import {prepareListingRequest} from '@/lib/seo/listing-request';
import {catalogUrl} from '@/lib/utils/catalog-urls';
import { parseCatalogFilters,CATALOG_PAGE_SIZE } from '@/lib/utils/catalog-query';
import React from 'react';
import { notFound,permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import ProductGrid from '@/components/product/ProductGrid';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { ItemListJsonLd } from '@/components/seo/JsonLd';
import BrandSeoSection from '@/components/seo/BrandSeoSection';
import { queryProducts, resolveBrandSlug } from '@/lib/utils/products';
import { collectionMetadata } from '@/lib/utils/seo';
import { getBrandStats } from '@/lib/utils/brand-stats';

interface BrandDetailPageProps {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params, searchParams }: BrandDetailPageProps): Promise<Metadata> {
  const { brand } = await params;
  const entry = await resolveBrandSlug(brand);
  if (!entry) notFound();
  const stats = getBrandStats(entry.slug) || getBrandStats(entry.name);
  const priceSnippet = stats?.priceRange ? ` (Prices: ${stats.priceRange})` : '';
  const ratingSnippet = stats?.avgRating ? ` Rated ${stats.avgRating}/5 stars.` : '';
  return collectionMetadata(
    `${entry.name} makeup prices${priceSnippet}`,
    `Compare ${entry.name} cosmetics across Nykaa, Amazon, Flipkart and Myntra.${ratingSnippet} Browse authentic products, available shades and current store prices.`,
    `/brands/${entry.slug}`,
    await searchParams
  );
}

export default async function BrandDetailPage({ params, searchParams }: BrandDetailPageProps) {
  const { brand } = await params;
  const rawParams = await searchParams;

  const entry = await resolveBrandSlug(brand);
  if (!entry) notFound();
  if(brand!==entry.slug)permanentRedirect(catalogUrl('/brands/'+entry.slug,rawParams));
  const sp=prepareListingRequest('/brands/'+entry.slug,rawParams);
  const decodedBrand = entry.name;
  const brandName = entry.name;
  const stats = getBrandStats(entry.slug) || getBrandStats(entry.name);

  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'popular';
  const marketplace = sp.marketplace;
  const minDiscount = sp.minDiscount ? Number(sp.minDiscount) : undefined;
  const rating = sp.rating ? Number(sp.rating) : undefined;

  const result = await queryProducts({
    ...parseCatalogFilters(sp),
    page,
    limit: CATALOG_PAGE_SIZE,
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

  if(result.page>result.totalPages)notFound();
  return (
    <div>
      <Breadcrumb items={breadcrumbs} />

      <ItemListJsonLd
        name={`${brandName} Cosmetics`}
        description={`Compare all ${brandName} makeup prices and discounts`}
        products={result.products}
        brand={brandName}
        brandStats={stats}
        total={result.total}
        page={result.page}
        url={catalogUrl(`/brands/${entry.slug}`,sp)}
      />

      <div className="mb-6 bg-white rounded-3xl border border-pink-100 p-6 sm:p-8 shadow-sm">
        <div className="max-w-2xl">
          <span className="text-[11px] font-bold text-pink-600 uppercase tracking-wider bg-pink-50 px-2.5 py-1 rounded-full border border-pink-100 inline-block mb-2">
            Verified Brand Catalog
          </span>
          <h1 className="text-2xl sm:text-4xl font-black text-neutral-900 tracking-tight">
            {brandName} Makeup & Cosmetics
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-2 leading-relaxed">
            Compare prices for {brandName} cosmetics. Find authentic listings, customer ratings, shades and maximum discounts across leading stores.
          </p>

          {/* Dynamic Brand Rating & Price Range Stats */}
          {stats && (stats.priceRange || stats.avgRating) && (
            <div className="flex flex-wrap items-center gap-2.5 mt-4 pt-4 border-t border-pink-100/60">
              {stats.priceRange && (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-pink-700 bg-pink-50/80 border border-pink-100 px-3 py-1.5 rounded-xl shadow-2xs">
                  <span className="text-pink-500">Price Range:</span>
                  <span className="text-neutral-900">{stats.priceRange}</span>
                </div>
              )}
              {stats.avgRating && (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50/80 border border-amber-200/60 px-3 py-1.5 rounded-xl shadow-2xs">
                  <span className="text-amber-500">★</span>
                  <span>{stats.avgRating} / 5</span>
                  {stats.ratingCount > 0 && (
                    <span className="text-neutral-500 font-normal text-[11px]">
                      ({stats.ratingCount.toLocaleString('en-IN')} ratings)
                    </span>
                  )}
                </div>
              )}
              {stats.productCount > 0 && (
                <div className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 bg-neutral-50 border border-neutral-100 px-3 py-1.5 rounded-xl">
                  <span>{stats.productCount.toLocaleString('en-IN')} products</span>
                </div>
              )}
            </div>
          )}
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

      <BrandSeoSection brandName={brandName} />
    </div>
  );
}

