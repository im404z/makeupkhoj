import Link from 'next/link';
import {notFound,permanentRedirect} from 'next/navigation';
import Breadcrumb from '@/components/layout/Breadcrumb';
import ProductCard from '@/components/product/ProductCard';
import ProductFilters from '@/components/product/ProductFilters';
import SortBar from '@/components/product/SortBar';
import Pagination from '@/components/ui/Pagination';
import {JsonLd} from '@/components/seo/JsonLd';
import {constructMetadata} from '@/lib/utils/seo';
import {catalogUrl,type SearchValues} from '@/lib/utils/catalog-urls';
import {listingData} from '@/lib/matching/listing';
import {groupPath} from '@/lib/matching/engine.mjs';
import type {Product} from '@/types/product';
import {siteUrl} from '@/lib/utils/sitemaps';
import {CATEGORIES} from '@/lib/constants/categories';
export const dynamic='force-dynamic';
type Props={searchParams:Promise<SearchValues>};
export async function generateMetadata({searchParams}:Props){
 const {params,result,enabled,url}=await listingData(await searchParams);
 if(result.page>result.totalPages||params.has('minPrice')&&params.has('maxPrice')&&Number(params.get('minPrice'))>Number(params.get('maxPrice')))notFound();
 return constructMetadata({title:'Compare makeup prices'+(result.page>1?' - Page '+result.page:''),description:'Discover makeup by product, with matched marketplace offers together. Compare admin-approved identical variants across two or more marketplaces.',canonical:url,noindex:!enabled||result.total===0||[...params.keys()].some(k=>k!=='page')});
}
export default async function CompareProductsPage({searchParams}:Props){
 const sp=await searchParams,{params,result,enabled,url}=await listingData(sp);
 const raw=new URLSearchParams();for(const [k,v] of Object.entries(sp))for(const x of [v].flat())if(typeof x==='string')raw.append(k,x);
 if(raw.toString()!==params.toString())permanentRedirect(url);
 if(result.page>result.totalPages)notFound();
 return <div><Breadcrumb items={[{label:'Compare products'}]}/><section className="comparison-banner"><div><p className="eyebrow">One product. Every offer.</p><h1>Compare products</h1><p>Find your favourite makeup, with identical variants grouped across stores.</p></div><div className="comparison-banner__note"><strong>Same shade. Same size.</strong><p>Every group is approved by admin and available across at least two marketplaces.</p></div></section>
  <JsonLd data={{'@context':'https://schema.org','@type':'ItemList',name:'Compare makeup products',numberOfItems:result.total,itemListElement:result.rows.map((r:any,i:number)=>({'@type':'ListItem',position:(result.page-1)*25+i+1,name:r.root.title,url:siteUrl()+groupPath(r.root)}))}}/>
  <p className="comparison-freshness mt-5">Only admin-approved products matched across two or more marketplaces appear here. <Link href="/products" className="underline">Browse all makeup</Link></p>
  <form action="/compare-products" method="get" className="comparison-search"><label htmlFor="comparison-search">Search this catalogue</label><input id="comparison-search" name="q" defaultValue={params.get('q')||''} placeholder="Product title or name" maxLength={200}/><button className="action-button">Find products</button></form>
  <nav className="catalog-category-links" aria-label="Comparison categories"><Link href={catalogUrl('/compare-products',{view:params.get('view')||undefined})} aria-current={!params.has('category')?'page':undefined}>All categories</Link>{CATEGORIES.map(c=>{const names:Record<string,string>={'face-makeup':'Face','lip-makeup':'Lips','eye-makeup':'Eyes','tools-and-brushes':'Tools','makeup-kits':'Makeup Kits','makeup-remover':'Makeup Remover',cheeks:'Cheeks',nails:'Nails'};const term=names[c.slug];return <Link key={c.slug} href={catalogUrl('/compare-products',{...Object.fromEntries(params),marketplace:params.getAll('marketplace'),brand:params.getAll('brand'),category:term,page:undefined})} aria-current={params.get('category')===term?'page':undefined}>{c.name}</Link>;})}</nav>
  {!enabled?<div className="comparison-empty"><h2>The comparison catalogue is being prepared</h2><p>Browse current marketplace listings while product matching is underway.</p><Link className="action-button" href="/products">Browse makeup</Link></div>:<div className="catalog-layout"><div className="catalog-filters"><ProductFilters/></div><div className="catalog-results"><SortBar total={result.total}/><p className="comparison-freshness">Recorded prices from the latest catalogue scan. Open a product for current source offers. Store counts include known listings; availability may vary.</p>{result.rows.length?<div className="product-grid product-grid--catalog">{result.rows.map((r:any)=>{
   const p=r.product,product={_id:p._id,id:p._id,name:r.root.displayTitle||r.root.title,brand:p.brand,price:p.price,mrp:p.mrp,image:p.image,marketplace:p.store,discount_percentage:p.discount} as Product;
   return <ProductCard key={r._id} product={product} comparison={{href:groupPath(r.root),sku:r._id,stores:r.stores}}/>;
  })}</div>:<div className="comparison-empty"><h2>No approved comparisons yet</h2><p>{result.total===0?'Products appear here after admin approves a match across at least two marketplaces. You can also try clearing filters.':''}</p><Link href="/compare-products">Reset filters</Link></div>}<Pagination currentPage={result.page} totalPages={result.totalPages}/></div></div>}
 </div>;
}
