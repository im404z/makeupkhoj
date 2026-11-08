import {prepareListingRequest} from '@/lib/seo/listing-request';
import {catalogUrl} from '@/lib/utils/catalog-urls';
import {notFound} from 'next/navigation';
import { ItemListJsonLd } from '@/components/seo/JsonLd';
import { parseCatalogFilters,CATALOG_PAGE_SIZE } from '@/lib/utils/catalog-query';
import React from 'react';
import type { Metadata } from 'next';
import ProductGrid from '@/components/product/ProductGrid';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { queryProducts } from '@/lib/utils/products';
import { constructMetadata, collectionMetadata } from '@/lib/utils/seo';

export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{return collectionMetadata("New makeup listings","Explore the latest makeup added to our catalog. Discover lip, face and eye products and compare available marketplace prices.","/new-arrivals",await searchParams);}

interface NewArrivalsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function NewArrivalsPage({ searchParams }: NewArrivalsPageProps) {
  const sp = prepareListingRequest('/new-arrivals',await searchParams);
  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'newest';

  const result = await queryProducts({
    ...parseCatalogFilters(sp),
    page,
    limit: CATALOG_PAGE_SIZE,
    sort,
  });

  if(result.page>result.totalPages)notFound();
  return (
    <div>
      <ItemListJsonLd name="New makeup listings" description="Explore makeup listings and compare marketplace prices." products={result.products} total={result.total} page={result.page} url={catalogUrl('/new-arrivals',sp)}/>
      <Breadcrumb items={[{ label: 'New Arrivals' }]} />

      <div className="mb-6">
        <span className="text-[11px] font-bold text-pink-600 uppercase tracking-wider bg-pink-50 px-2.5 py-1 rounded-full border border-pink-100 inline-block mb-2">
          Fresh Beauty Launches
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
          New Makeup Arrivals
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Latest additions and new beauty collections added across our indexed marketplaces.
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

