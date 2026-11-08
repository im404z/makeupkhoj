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

interface BrandDetailPageProps {
  params: Promise<{ brand: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params, searchParams }: BrandDetailPageProps): Promise<Metadata> {
  const { brand } = await params;
  const entry = await resolveBrandSlug(brand);
  if (!entry) notFound();
  return collectionMetadata(`${entry.name} makeup prices`, `Compare ${entry.name} cosmetics across Nykaa, Amazon, Flipkart and Myntra. Browse product details, available shades and current store prices.`, `/brands/${entry.slug}`, await searchParams);
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
        brand={brandName} total={result.total} page={result.page} url={catalogUrl(`/brands/${entry.slug}`,sp)}
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

      <BrandSeoSection brandName={brandName} />
    </div>
  );
}

