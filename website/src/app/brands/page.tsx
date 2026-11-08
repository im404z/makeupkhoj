import { JsonLd } from '@/components/seo/JsonLd';
import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { getAllBrandsList } from '@/lib/utils/products';
import { constructMetadata } from '@/lib/utils/seo';

export const metadata: Metadata = constructMetadata({
  title: 'Makeup and cosmetics brand directory',
  description:
    'Browse makeup brands indexed across Nykaa, Amazon, Flipkart and Myntra. Explore each brand catalog and compare available product prices.',
  canonical: '/brands',
});

export default async function AllBrandsPage() {
  const brands = await getAllBrandsList();

  // Group brands alphabetically
  const grouped: Record<string, typeof brands> = {};
  for (const b of brands) {
    const firstChar = b.name.charAt(0).toUpperCase();
    const key = /[A-Z]/.test(firstChar) ? firstChar : '#';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(b);
  }

  const alphabet = Object.keys(grouped).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  const base=process.env.NEXT_PUBLIC_SITE_URL||'https://makeupkhoj.com';
  return (
    <div>
      <JsonLd data={{'@context':'https://schema.org','@type':'CollectionPage',name:'Makeup brands',url:base+'/brands',mainEntity:{'@type':'ItemList',itemListElement:brands.map((b,i)=>({'@type':'ListItem',position:i+1,item:{'@type':'Brand',name:b.name,url:base+'/brands/'+b.slug}}))}}}/>
      <Breadcrumb items={[{ label: 'All Brands' }]} />

      <div className="mb-8">
        <h1 className="text-2xl sm:text-4xl font-black text-neutral-900 tracking-tight mb-2">
          All Makeup & Cosmetic Brands
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 max-w-2xl leading-relaxed">
          Browse verified beauty brands indexed across Nykaa, Amazon, Flipkart, and Myntra. Compare brand catalog discounts and bestsellers.
        </p>

        {/* Quick Letter Jump */}
        <div className="flex flex-wrap gap-1.5 mt-4">
          {alphabet.map((letter) => (
            <a
              key={letter}
              href={`#section-${letter}`}
              className="w-7 h-7 flex items-center justify-center text-xs font-bold rounded-lg bg-pink-50 text-pink-700 hover:bg-pink-600 hover:text-white border border-pink-100 transition-colors"
            >
              {letter}
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-10">
        {alphabet.map((letter) => (
          <div key={letter} id={`section-${letter}`} className="scroll-mt-24">
            <h2 className="text-xl font-black text-neutral-900 border-b border-pink-100 pb-2 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-pink-600 text-white flex items-center justify-center text-sm font-bold">
                {letter}
              </span>
              <span>Brands</span>
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {grouped[letter].map((b) => (
                <Link
                  key={b.slug}
                  href={`/brands/${b.slug}`}
                  className="bg-white rounded-2xl border border-pink-100 p-3 hover-lift flex flex-col justify-between"
                >
                  <span className="text-xs font-bold text-neutral-800 line-clamp-1 hover:text-pink-600 transition-colors">
                    {b.name}
                  </span>
                  <span className="text-[11px] text-pink-600 font-semibold mt-1">
                    {b.count} products →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

