import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { CATEGORIES } from '@/lib/constants/categories';

export default function CategoryGrid() {
  return (
    <section className="mb-14">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
            Shop by Category
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Browse through lip, face, eye, cheeks, nails and makeup kits
          </p>
        </div>
        <Link
          href="/categories"
          className="text-xs sm:text-sm font-bold text-pink-600 hover:text-pink-700 flex items-center gap-1 transition-colors"
        >
          View All Categories <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.slug}
            href={`/categories/${cat.slug}`}
            className="group flex flex-col items-center p-1 rounded-2xl hover-lift text-center"
          >
            <div className="relative w-full aspect-square mb-2 rounded-xl overflow-hidden bg-pink-50/50 flex items-center justify-center">
              <Image
                src={cat.image}
                alt={cat.name}
                fill
                sizes="(max-width: 640px) 25vw, 12vw"
                className="object-cover group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            <span className="text-xs font-bold text-neutral-800 group-hover:text-pink-600 transition-colors ">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

