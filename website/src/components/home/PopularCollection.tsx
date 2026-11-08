'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import ProductGrid from '@/components/product/ProductGrid';
import type { Product } from '@/types/product';

export type Collection = { label: string; products: Product[]; href: string };
export default function PopularCollection({ collections }: { collections: Collection[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const current = collections[active];
  return <section className="store-section">
    <div className="section-heading"><div><p className="eyebrow text-[#777b70] mb-3">Discover your favourites</p><h2>Trending makeup across stores</h2></div>
      <Link href={current.href} className="inline-flex gap-2 items-center">Explore {current.label.toLowerCase()} <ArrowUpRight size={14}/></Link>
    </div>
    <div role="tablist" aria-label="Popular makeup categories" className="collection-tabs">
      {collections.map((c, i) => <button key={c.label} id={`${id}-tab-${i}`} role="tab" aria-selected={active === i}
        aria-controls={`${id}-panel`} tabIndex={active === i ? 0 : -1} onClick={() => setActive(i)}
        onKeyDown={e => { if (['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) { e.preventDefault(); const next=e.key==='Home'?0:e.key==='End'?collections.length-1:(active+(e.key==='ArrowRight'?1:-1)+collections.length)%collections.length;setActive(next);document.getElementById(`${id}-tab-${next}`)?.focus(); } }}>
        {c.label}
      </button>)}
    </div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`}><ProductGrid products={current.products}/></div>
  </section>;
}
