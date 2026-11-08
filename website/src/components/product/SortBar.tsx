'use client';
import {catalogUrl,defaultCatalogSort} from '@/lib/utils/catalog-urls';
import {useRouter,useSearchParams,usePathname} from 'next/navigation';
const options=[['popular','Popular'],['price_asc','Price: Low to High'],['price_desc','Price: High to Low'],['discount_desc','Discount'],['rating_desc','Top rated'],['newest','Newest']];
export default function SortBar({total}:{total:number}){
 const router=useRouter(),pathname=usePathname(),params=useSearchParams(),active=params.get('sort')||defaultCatalogSort(pathname);
 function sort(value:string){const next=new URLSearchParams(params.toString());next.set('sort',value);next.set('page','1');router.push(catalogUrl(pathname,next));}
 return <div className="catalog-sort"><div className="catalog-sort__tabs" aria-label="Sort products">{options.map(([value,label])=><button key={value} aria-pressed={active===value} onClick={()=>sort(value)}>{pathname==='/price-drops'&&value==='discount_desc'?'Biggest price drop':label}</button>)}</div><label className="catalog-sort__mobile">Sort by<select aria-label="Sort products" value={active} onChange={e=>sort(e.target.value)}>{options.map(([value,label])=><option key={value} value={value}>{pathname==='/price-drops'&&value==='discount_desc'?'Biggest price drop':label}</option>)}</select></label><p>{total.toLocaleString('en-IN')} products</p></div>;
}
