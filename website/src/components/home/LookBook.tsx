import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { MAKEUP_LOOKS } from '@/lib/constants/marketplaces';

export default function LookBook() {
  return (
    <section className="mb-14">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
            Shop by Makeup Look
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Discover curated cosmetics for every occasion, aesthetic & skin tone
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {MAKEUP_LOOKS.map((look) => (
          <Link
            key={look.title}
            href={`/categories/${look.category}`}
            className="group relative rounded-2xl overflow-hidden bg-neutral-900 border border-pink-100 flex flex-col justify-end p-3.5 hover-lift aspect-[4/5]"
          >
            <Image
              src={look.image}
              alt={look.title}
              fill
              sizes="(max-width: 640px) 50vw, 16vw"
              className="object-cover group-hover:scale-105 transition-transform duration-500 opacity-80 group-hover:opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-neutral-950/20 to-transparent" />
            <div className="relative z-10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-pink-300">
                {look.tag}
              </span>
              <h4 className="text-sm font-extrabold text-white leading-tight">
                {look.title}
              </h4>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

