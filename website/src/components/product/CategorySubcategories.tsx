import Link from 'next/link';
import {categoryNavigation} from '@/lib/utils/category-navigation';
import {catalogUrl,type SearchValues} from '@/lib/utils/catalog-urls';

export default async function CategorySubcategories({category,name,active,filters={}}:{category:string;name:string;active?:string;filters?:SearchValues}){
  const {items,total}=await categoryNavigation(category);
  if(!items.length)return null;
  const retained={...filters,page:undefined,category:undefined,sub_category:undefined};
  const links=[{slug:'',name:'All '+name,count:total},...items];
  return <section className="category-browser" aria-label={'Browse '+name}>
    <div className="category-browser__heading"><h2>Shop by subcategory</h2><p>Listing records across all four stores, before filters.</p></div>
    <nav className="category-browser__links" aria-label={name+' subcategories'}>
      {links.map(item=><Link key={item.slug} href={catalogUrl('/categories/'+category+(item.slug?'/'+item.slug:''),retained)} aria-current={(active||'')===item.slug?'page':undefined}>
        <span>{item.name}</span><small>{item.count.toLocaleString('en-IN')}</small>
      </Link>)}
    </nav>
  </section>;
}
