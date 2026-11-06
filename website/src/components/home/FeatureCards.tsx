import React from 'react';
import Image from 'next/image';

const features = [
  {
    icon: '/assets/icons/compare-prices-card.png',
    title: 'Compare Prices',
    description: 'Across Nykaa, Amazon, Flipkart & Myntra',
  },
  {
    icon: '/assets/icons/track-price-drops-card.png',
    title: 'Track Price Drops',
    description: 'See current offers across stores',
  },
  {
    icon: '/assets/icons/wide-selection-card.png',
    title: 'Wide Selection',
    description: 'Explore shades, finishes & brands',
  },
  {
    icon: '/assets/icons/trusted-stores-card.png',
    title: 'Shop at Your Store',
    description: 'Go directly to the retailer',
  },
];

export default function FeatureCards() {
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-12">
      {features.map((f, i) => (
        <div
          key={i}
          className="flex items-center gap-3.5 p-4 rounded-2xl bg-[#fcf1f5]"
        >
          <div className="relative w-11 h-11 flex-shrink-0">
            <Image
              src={f.icon}
              alt={f.title}
              fill
              className="object-contain"
            />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-neutral-800 leading-tight">
              {f.title}
            </h4>
            <p className="text-[11px] text-neutral-500 leading-tight mt-0.5">
              {f.description}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

