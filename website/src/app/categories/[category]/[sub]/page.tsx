import CategorySubcategories from '@/components/product/CategorySubcategories';
import {prepareListingRequest} from '@/lib/seo/listing-request';
import {catalogUrl} from '@/lib/utils/catalog-urls';
import { parseCatalogFilters,CATALOG_PAGE_SIZE } from '@/lib/utils/catalog-query';
import { Suspense } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import ProductGrid from '@/components/product/ProductGrid';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { ItemListJsonLd } from '@/components/seo/JsonLd';
import CategorySeoSection from '@/components/seo/CategorySeoSection';
import { getCategoryBySlug, LEGACY_SUBCATEGORY_SLUGS } from '@/lib/constants/categories';
import { queryProducts } from '@/lib/utils/products';
import { collectionMetadata } from '@/lib/utils/seo';

interface SubCategoryPageProps {
  params: Promise<{ category: string; sub: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params, searchParams }: SubCategoryPageProps): Promise<Metadata> {
  const { category, sub } = await params;
  const cat = getCategoryBySlug(category);
  if(!cat)notFound();
  if(!cat.subcategories.some(s=>s.slug===sub)){
    if(LEGACY_SUBCATEGORY_SLUGS[category]?.includes(sub))permanentRedirect('/categories/'+category);
    notFound();
  }
  const subName = cat!.subcategories.find(s => s.slug === sub)!.name;
  const catName = cat ? cat.name : 'Makeup';

  return collectionMetadata(`${subName} - ${catName} price comparison`, `Compare ${subName} makeup prices across Nykaa, Amazon, Flipkart and Myntra. Explore available shades, product details and store offers.`, `/categories/${category}/${sub}`, await searchParams);
}

export default async function SubCategoryPage({ params, searchParams }: SubCategoryPageProps) {
  const { category, sub } = await params;
  const sp = prepareListingRequest(`/categories/${category}/${sub}`,await searchParams);
  const cat = getCategoryBySlug(category);
  if(!cat)notFound();
  if(!cat.subcategories.some(s=>s.slug===sub)){
    if(LEGACY_SUBCATEGORY_SLUGS[category]?.includes(sub))permanentRedirect('/categories/'+category);
    notFound();
  }
  const subName = cat!.subcategories.find(s => s.slug === sub)!.name;

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
    subSlug: sub,
    categorySlug: category,
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

  if(result.page>result.totalPages)notFound();
  return (
    <div>
      <Breadcrumb items={breadcrumbs} />

      <ItemListJsonLd
        name={`${subName} Listings`}
        description={`Compare ${subName} prices across 4 marketplaces`}
        products={result.products}
        total={result.total} page={result.page} url={catalogUrl(`/categories/${category}/${sub}`,sp)}
      />

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 tracking-tight">
          {subName}
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 mt-1">
          Explore genuine {subName.toLowerCase()} with multi-retailer price comparisons and ratings.
        </p>
      </div>

      <Suspense fallback={null}>
        <CategorySubcategories category={category} name={cat.name} active={sub} filters={sp}/>
      </Suspense>
      <div className="catalog-layout">
        <div className="catalog-filters">
          <ProductFilters currentCategory={category} currentSub={sub} />
        </div>
        <div className="catalog-results">
          <SortBar total={result.total} />
          <ProductGrid products={result.products} catalog />
          <Pagination currentPage={result.page} totalPages={result.totalPages} />
        </div>
      </div>

      <CategorySeoSection
        categoryName={cat ? cat.name : 'Makeup'}
        subCategoryName={subName}
      />
    </div>
  );
}

