import {getPriceDropSettings} from '@/lib/price-drops';
import {queryProducts,resolveBrandSlug} from '@/lib/utils/products';
import {parseCatalogFilters,CATALOG_PAGE_SIZE} from '@/lib/utils/catalog-query';
import {defaultCatalogSort} from '@/lib/utils/catalog-urls';
import {CATEGORIES} from '@/lib/constants/categories';
import 'server-only';
import {permanentRedirect,notFound} from 'next/navigation';
import {catalogUrl,searchValues,type SearchValues} from '@/lib/utils/catalog-urls';
export function prepareListingRequest(path:string,params:SearchValues){
 const raw=new URLSearchParams();for(const[key,value]of Object.entries(params))for(const item of [value].flat())if(item!==undefined)raw.append(key,item);
 const target=catalogUrl(path,params),current=path+(raw.size?'?'+raw:'');
 if(target!==current)permanentRedirect(target);
 const clean=searchValues(new URLSearchParams(target.split('?')[1]||''));
 if(clean.minPrice!==undefined&&clean.maxPrice!==undefined&&Number(clean.minPrice)>Number(clean.maxPrice))notFound();
 return clean;
}

export async function validateListingPage(path:string,params:SearchValues){
 const clean=searchValues(new URLSearchParams(catalogUrl(path,params).split('?')[1]||''));
 if(clean.minPrice!==undefined&&clean.maxPrice!==undefined&&Number(clean.minPrice)>Number(clean.maxPrice))notFound();
 const filters=parseCatalogFilters(clean);if(filters.page<=1)return;
 const route=path.split('/').filter(Boolean),context:Record<string,unknown>={};
 if(route[0]==='categories'){const cat=CATEGORIES.find(c=>c.slug===route[1]);if(!cat)notFound();context.categorySlug=cat.slug;if(route[2]){const sub=cat.subcategories.find(s=>s.slug===route[2]);if(!sub)notFound();context.subSlug=sub.slug;}}
 if(route[0]==='brands'){const brand=await resolveBrandSlug(route[1]);if(!brand)notFound();context.brand=brand.name;}
 if(path==='/deals')context.minDiscount=filters.minDiscount||15;
 if(path==='/price-drops'){const settings=await getPriceDropSettings();if(!settings.enabled)notFound();context.priceDropSince=new Date(Date.now()-settings.windowHours*3600000);context.maxResults=settings.maxProducts;context.limit=Math.min(settings.perPage,settings.maxProducts);}
 const result=await queryProducts({...filters,...context,sort:typeof clean.sort==='string'?clean.sort:defaultCatalogSort(path),limit:Number(context.limit)||CATALOG_PAGE_SIZE});
 if(filters.page>result.totalPages)notFound();
}
