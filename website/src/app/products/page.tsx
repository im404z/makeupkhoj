import {prepareListingRequest} from '@/lib/seo/listing-request';
import {catalogUrl} from '@/lib/utils/catalog-urls';
import {notFound} from 'next/navigation';
import { parseCatalogFilters,CATALOG_PAGE_SIZE } from '@/lib/utils/catalog-query';
import React from 'react';
import Link from 'next/link';
import CatalogBanner from '@/components/product/CatalogBanner';
import CatalogQuickLinks from '@/components/product/CatalogQuickLinks';
import { CATEGORIES } from '@/lib/constants/categories';
import type { Metadata } from 'next';
import ProductGrid from '@/components/product/ProductGrid';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { ItemListJsonLd } from '@/components/seo/JsonLd';
import { queryProducts } from '@/lib/utils/products';
import { constructMetadata, collectionMetadata } from '@/lib/utils/seo';

export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}):Promise<Metadata>{return collectionMetadata("Makeup prices across four stores","Browse makeup from Nykaa, Amazon, Flipkart and Myntra. Compare available prices, filter by brand and category, and explore product details.","/products",await searchParams);}

interface ProductsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const sp = prepareListingRequest('/products',await searchParams);
  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'popular';
  const brand = sp.brand;
  const marketplace = sp.marketplace;
  const minDiscount = sp.minDiscount ? Number(sp.minDiscount) : undefined;
  const rating = sp.rating ? Number(sp.rating) : undefined;
  const minPrice = sp.minPrice ? Number(sp.minPrice) : undefined;
  const maxPrice = sp.maxPrice ? Number(sp.maxPrice) : undefined;
  const inStock = sp.inStock === 'true';

  const result = await queryProducts({
    ...parseCatalogFilters(sp),
    page,
    limit: CATALOG_PAGE_SIZE,
    sort,
    brand,
    marketplace,
    minDiscount,
    rating,
    minPrice,
    maxPrice,
    inStockOnly: inStock,
  });

  if(result.page>result.totalPages)notFound();
  return (
    <div>
      <Breadcrumb items={[{ label: 'All Products' }]} />

      <ItemListJsonLd
        name="All Makeup Products"
        description="Complete list of authentic cosmetics with multi-store price comparisons"
        products={result.products}
        total={result.total} page={result.page} url={catalogUrl('/products',sp)}
      />

      <CatalogBanner />
      <nav className="catalog-category-links" aria-label="Makeup categories">
        <Link href="/products" aria-current="page">All makeup</Link>
        {CATEGORIES.map(c => <Link key={c.slug} href={`/categories/${c.slug}`}>{c.name}</Link>)}
      </nav>
      <CatalogQuickLinks />

      <div className="catalog-layout">
        {/* Filters Sidebar */}
        <div className="catalog-filters">
          <ProductFilters />
        </div>

        {/* Product Grid & Sort */}
        <div className="catalog-results">
          <SortBar total={result.total} />
          <ProductGrid products={result.products} catalog />
          <Pagination currentPage={result.page} totalPages={result.totalPages} />
        </div>
      </div>
    </div>
  );
}

