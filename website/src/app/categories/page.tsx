import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { CATEGORIES } from '@/lib/constants/categories';
import { constructMetadata } from '@/lib/utils/seo';

export const metadata: Metadata = constructMetadata({
  title: 'All Makeup Categories - Lip, Face, Eyes, Cheeks & Kits',
  description:
    'Explore complete makeup taxonomy. Compare prices and deals on foundations, concealers, lipsticks, mascaras, blushes, brushes and beauty kits.',
  canonical: '/categories',
});

export default function AllCategoriesPage() {
  return (
    <div>
      <Breadcrumb items={[{ label: 'All Categories' }]} />

      <div className="mb-8">
        <h1 className="text-2xl sm:text-4xl font-black text-neutral-900 tracking-tight mb-2">
          Explore Makeup by Category
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 max-w-2xl leading-relaxed">
          Find your perfect cosmetics from authentic sellers. Dive into dedicated categories with specialized subcategory filters, shade matching, and cross-store pricing.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {CATEGORIES.map((cat) => (
          <div
            key={cat.slug}
            className="bg-white rounded-3xl border border-pink-100 p-6 flex flex-col justify-between shadow-sm hover-lift"
          >
            <div>
              <div className="relative w-24 h-24 mx-auto mb-4 rounded-2xl bg-pink-50/60 p-2 flex items-center justify-center">
                <Image
                  src={cat.image}
                  alt={cat.name}
                  fill
                  sizes="100px"
                  className="object-contain p-2"
                />
              </div>
              <h2 className="text-lg font-bold text-neutral-900 text-center mb-1">
                {cat.name}
              </h2>
              <p className="text-xs text-neutral-500 text-center mb-4 leading-relaxed line-clamp-2">
                {cat.description}
              </p>

              {/* Subcategories list */}
              <div className="border-t border-pink-50 pt-3 mb-4 space-y-1">
                {cat.subcategories.slice(0, 4).map((sub) => (
                  <Link
                    key={sub.slug}
                    href={`/categories/${cat.slug}/${sub.slug}`}
                    className="block text-xs text-neutral-600 hover:text-pink-600 transition-colors py-0.5"
                  >
                    • {sub.name}
                  </Link>
                ))}
              </div>
            </div>

            <Link
              href={`/categories/${cat.slug}`}
              className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-pink-50 hover:bg-pink-600 hover:text-white text-pink-700 text-xs font-bold transition-all border border-pink-200"
            >
              Browse {cat.name} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

