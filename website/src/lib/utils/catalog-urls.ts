import {slugify} from './format';
export type SearchValues=Record<string,string|string[]|undefined>;
export function defaultCatalogSort(path:string){return ['/deals','/price-drops'].includes(path)?'discount_desc':path==='/new-arrivals'?'newest':'popular';}
export function searchValues(input:SearchValues|URLSearchParams):SearchValues{
 if(!(input instanceof URLSearchParams))return input;
 return Object.fromEntries([...new Set(input.keys())].map(key=>{const values=input.getAll(key);return [key,values.length>1?values:values[0]];}));
}
export function catalogParams(path:string,input:SearchValues|URLSearchParams){
 const sp=searchValues(input),out=new URLSearchParams();
 const one=(key:string)=>{const value=sp[key];return (Array.isArray(value)?value[0]:value)?.trim()||'';};
 const multi=(key:string,transform:(value:string)=>string)=>[...new Set([sp[key]].flat().filter((v):v is string=>typeof v==='string').map(v=>transform(v.trim())).filter(Boolean))].sort();
 const q=one('q')||one('search');if(q)out.set('q',q.slice(0,200));
 for(const key of ['category','sub_category'])if(one(key)&&!(key==='category'&&path.startsWith('/categories/'))&&!(key==='sub_category'&&/^\/categories\/[^/]+\/[^/]+$/.test(path)))out.set(key,one(key));
 if(!path.startsWith('/brands/'))for(const brand of multi('brand',slugify))out.append('brand',brand);
 for(const store of multi('marketplace',v=>v.toLowerCase()))if(['amazon','flipkart','myntra','nykaa'].includes(store))out.append('marketplace',store);
 for(const key of ['minPrice','maxPrice','minDiscount','rating']){const raw=one(key),n=Number(raw);if(raw&&Number.isFinite(n)&&n>=0&&(key!=='rating'||n<=5)&&(key!=='minDiscount'||n<=100)&&(n>0||key==='maxPrice'))out.set(key,String(n));}
 if(path==='/deals'&&out.get('minDiscount')==='15')out.delete('minDiscount');

 if(one('inStock')==='true')out.set('inStock','true');
 for(const key of ['finish','coverage','skinType'])if(one(key))out.set(key,one(key).slice(0,100));
 const sort=one('sort');if(['popular','price_asc','price_desc','discount_desc','rating_desc','newest'].includes(sort)&&sort!==defaultCatalogSort(path))out.set('sort',sort);
 
 const page=Number(one('page'));if(Number.isFinite(page)&&page>1)out.set('page',String(Math.floor(page)));
 return out;
}
export function catalogUrl(path:string,input:SearchValues|URLSearchParams={}){const params=catalogParams(path,input);return path+(params.size?'?'+params.toString():'');}
export function hasCatalogFilters(path:string,input:SearchValues){return [...catalogParams(path,input).keys()].some(key=>key!=='page');}
