import {prepareListingRequest} from '@/lib/seo/listing-request';
import {catalogUrl} from '@/lib/utils/catalog-urls';
import { parseCatalogFilters,CATALOG_PAGE_SIZE } from '@/lib/utils/catalog-query';
import { Suspense } from 'react';
import CatalogBanner from '@/components/product/CatalogBanner';
import CatalogQuickLinks from '@/components/product/CatalogQuickLinks';
import type { Metadata } from 'next';
import CategorySubcategories from '@/components/product/CategorySubcategories';
import { notFound } from 'next/navigation';
import ProductGrid from '@/components/product/ProductGrid';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { ItemListJsonLd } from '@/components/seo/JsonLd';
import CategorySeoSection from '@/components/seo/CategorySeoSection';
import { getCategoryBySlug } from '@/lib/constants/categories';
import { queryProducts } from '@/lib/utils/products';
import { collectionMetadata } from '@/lib/utils/seo';

interface CategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  const cat = getCategoryBySlug(category);
  if(!cat)notFound();
  const title = cat ? `${cat.name} Online - Best Price Comparison` : 'Makeup Category';
  const description = cat
    ? `${cat.description} Compare live prices across Nykaa, Amazon, Flipkart, and Myntra.`
    : 'Discover cosmetics and compare makeup prices on MakeupKhoj.';

  return collectionMetadata(title, description, `/categories/${category}`, await searchParams);
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { category } = await params;
  const sp = prepareListingRequest(`/categories/${category}`,await searchParams);
  const cat = getCategoryBySlug(category);

  if (!cat) notFound();
  const page = Number(sp.page) || 1;
  const sort = typeof sp.sort === 'string' ? sp.sort : 'popular';
  const brand = sp.brand;
  const marketplace = sp.marketplace;
  const minDiscount = sp.minDiscount ? Number(sp.minDiscount) : undefined;
  const rating = sp.rating ? Number(sp.rating) : undefined;

  const result = await queryProducts({
    ...parseCatalogFilters(sp),
    page,
    limit: CATALOG_PAGE_SIZE,
    categorySlug: category,
    sort,
    brand,
    marketplace,
    minDiscount,
    rating,
    maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined,
  });

  const breadcrumbs = [
    { label: 'All Categories', href: '/categories' },
    { label: cat ? cat.name : category },
  ];

  if(result.page>result.totalPages)notFound();
  return (
    <div>
      <Breadcrumb items={breadcrumbs} />

      <ItemListJsonLd
        name={cat ? cat.name : category}
        description={cat ? cat.description : 'Makeup listings'}
        products={result.products}
        total={result.total} page={result.page} url={catalogUrl(`/categories/${category}`,sp)}
      />

      <CatalogBanner title={cat ? cat.name : category} description={cat ? cat.description : 'Explore the collection and compare available store prices.'} category={category}/>
      <Suspense fallback={null}>
        <CategorySubcategories category={category} name={cat.name} filters={sp}/>
      </Suspense>
      <CatalogQuickLinks />

      <div className="catalog-layout">
        <div className="catalog-filters">
          <ProductFilters currentCategory={category} />
        </div>
        <div className="catalog-results">
          <SortBar total={result.total} />
          <ProductGrid products={result.products} catalog />
          <Pagination currentPage={result.page} totalPages={result.totalPages} />
        </div>
      </div>

      <CategorySeoSection
        categoryName={cat ? cat.name : category}
        description={cat ? cat.description : undefined}
      />
    </div>
  );
}

