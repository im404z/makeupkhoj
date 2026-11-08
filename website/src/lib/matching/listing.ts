import {cache} from 'react';
import {catalogParams,catalogUrl,type SearchValues} from '@/lib/utils/catalog-urls';
import {comparisonListing,catalogEnabled} from './catalog';
export const loadComparisonListing=cache(async(serialized:string)=>{
 const p=new URLSearchParams(serialized);
 return comparisonListing({page:Number(p.get('page'))||1,limit:25,view:'multi',sort:p.get('sort'),q:p.get('q'),category:p.get('category'),sub_category:p.get('sub_category'),brand:p.getAll('brand'),marketplace:p.getAll('marketplace'),minPrice:p.has('minPrice')?Number(p.get('minPrice')):undefined,maxPrice:p.has('maxPrice')?Number(p.get('maxPrice')):undefined,minDiscount:Number(p.get('minDiscount')),rating:Number(p.get('rating')),inStock:p.get('inStock')==='true',finish:p.get('finish'),coverage:p.get('coverage'),skinType:p.get('skinType')});
});
export async function listingData(sp:SearchValues){const p=catalogParams('/compare-products',sp);return {params:p,result:await loadComparisonListing(p.toString()),enabled:await catalogEnabled(),url:catalogUrl('/compare-products',sp)};}
