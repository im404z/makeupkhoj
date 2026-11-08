'use client';
import {catalogUrl,defaultCatalogSort} from '@/lib/utils/catalog-urls';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, Clock3, Tag } from 'lucide-react';

export default function CatalogQuickLinks() {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const selected = params.get('maxPrice') === '500' ? 'budget' : (params.get('sort')||defaultCatalogSort(pathname)) === 'newest' ? 'newest' : (params.get('sort')||defaultCatalogSort(pathname)) === 'popular' ? 'popular' : '';
  function choose(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set('page','1'); next.delete('maxPrice');
    next.set('sort', key === 'newest' ? 'newest' : 'popular');
    if (key === 'budget') next.set('maxPrice','500');
    router.push(catalogUrl(pathname,next));
  }
  return <div className="catalog-quick-links" aria-label="Browse product collections">
    {[{key:'popular',label:'Popular picks',Icon:ArrowUpDown},{key:'newest',label:'Just added',Icon:Clock3},{key:'budget',label:'₹500 & under',Icon:Tag}].map(({key,label,Icon}) =>
      <button key={key} aria-pressed={selected === key} onClick={() => choose(key)}><Icon size={14} strokeWidth={1.4}/>{label}</button>)}
  </div>;
}
