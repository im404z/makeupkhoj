import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { FEATURED_BRANDS } from '@/lib/constants/marketplaces';
import { slugify } from '@/lib/utils/format';

export default function BrandStrip() {
  return (
    <section className="mb-14 bg-white rounded-3xl border border-pink-100 p-6 sm:p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
            Shop by Brands
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            100% authentic cosmetics from India&apos;s most loved beauty houses
          </p>
        </div>
        <Link
          href="/brands"
          className="text-xs sm:text-sm font-bold text-pink-600 hover:text-pink-700 flex items-center gap-1 transition-colors"
        >
          View All Brands <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2.5 sm:gap-3">
        {FEATURED_BRANDS.map((brand) => (
          <Link
            key={brand}
            href={`/brands/${slugify(brand)}`}
            className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-neutral-700 bg-pink-50/50 hover:bg-pink-600 hover:text-white border border-pink-100 transition-all hover:scale-105"
          >
            {brand}
          </Link>
        ))}
      </div>
    </section>
  );
}

