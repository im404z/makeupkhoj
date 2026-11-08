import {getPriceDropSettings} from '@/lib/price-drops';
import {prepareListingRequest} from '@/lib/seo/listing-request';
import {catalogUrl} from '@/lib/utils/catalog-urls';
import {notFound} from 'next/navigation';
import { ItemListJsonLd } from '@/components/seo/JsonLd';
import DealsSeoSection from '@/components/seo/DealsSeoSection';
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

export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{return collectionMetadata("Recorded makeup price drops","Compare recent reductions from previously recorded marketplace prices. View price history and current recorded offers.","/price-drops",await searchParams);}

interface PriceDropsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PriceDropsPage({ searchParams }: PriceDropsPageProps) {
  const sp = prepareListingRequest('/price-drops',await searchParams);
  const settings = await getPriceDropSettings();
  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'discount_desc';

  const result = settings.enabled ? await queryProducts({
    ...parseCatalogFilters(sp),
    page,
    limit: Math.min(settings.perPage,settings.maxProducts),
    maxResults: settings.maxProducts,
    priceDropSince: new Date(Date.now()-settings.windowHours*3600000),
    sort,
  }) : {products:[],total:0,page,limit:settings.perPage,totalPages:1};

  if(result.page>result.totalPages)notFound();
  return (
    <div>
      <ItemListJsonLd name="Recorded makeup price drops" description="Explore makeup listings and compare marketplace prices." products={result.products} total={result.total} page={result.page} url={catalogUrl('/price-drops',sp)}/>
      <Breadcrumb items={[{ label: 'Price Drops' }]} />

      <div className="mb-6">
        <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider bg-rose-50 px-2.5 py-1 rounded-full border border-rose-100 inline-block mb-2">
          Recorded Price Drops
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
          Makeup Price Drops
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          {settings.enabled ? `Recorded reductions in the last ${settings.windowHours} hours. Showing up to ${settings.maxProducts.toLocaleString('en-IN')} products. Prices may change at the store.` : 'Price drop listings are currently paused.'}
        </p>
      </div>

      <div className="catalog-layout">
        <div className="catalog-filters">
          <ProductFilters />
        </div>
        <div className="catalog-results">
          <SortBar total={result.total} />
          <ProductGrid products={result.products} catalog />
          <Pagination currentPage={result.page} totalPages={result.totalPages} />
        </div>
      </div>

      <DealsSeoSection pageType="price-drops" />
    </div>
  );
}

