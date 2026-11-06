import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import type { Product } from '@/types/product';
import { formatPrice, formatDiscount } from '@/lib/utils/format';
import { MARKETPLACES } from '@/lib/constants/marketplaces';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const marketplace = MARKETPLACES[product.marketplace] || {
    name: product.marketplace_name || 'Store',
    color: '#e91e8c',
    badgeBg: 'bg-pink-100 text-pink-700 border-pink-200',
  };

  const productUrl = `/products/${product.slug || product.id}`;
  const imgUrl = product.image || '/assets/banners/hero-banner.jpg';

  return (
    <div className="group relative bg-white rounded-2xl border border-pink-100/70 p-3 flex flex-col justify-between hover-lift shadow-sm hover:border-pink-200">
      {/* Top badges */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 items-start">
        {product.discount_percentage && product.discount_percentage > 0 ? (
          <span className="bg-gradient-to-r from-pink-600 to-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            {formatDiscount(product.discount_percentage)}
          </span>
        ) : null}

        {product.bestseller_tag ? (
          <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
            ★ Bestseller
          </span>
        ) : null}
      </div>

      {/* Product Image */}
      <Link href={productUrl} className="block relative w-full pt-[100%] rounded-xl overflow-hidden bg-pink-50/30 mb-3">
        <Image
          src={imgUrl}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-contain p-2 group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
      </Link>

      {/* Product Details */}
      <div className="flex-1 flex flex-col">
        {/* Brand */}
        <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
          {product.brand || 'Beauty'}
        </div>

        {/* Title */}
        <Link href={productUrl} className="block group-hover:text-pink-600 transition-colors mb-2">
          <h3 className="text-xs sm:text-sm font-semibold text-neutral-800 line-clamp-2 leading-snug" title={product.name}>
            {product.name}
          </h3>
        </Link>

        {/* Rating if available */}
        {product.rating && product.rating > 0 ? (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="inline-flex items-center gap-0.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold px-1.5 py-0.5 rounded border border-emerald-200">
              {product.rating.toFixed(1)}
              <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
            </span>
            {product.rating_count ? (
              <span className="text-[11px] text-neutral-400">
                ({product.rating_count > 999 ? `${(product.rating_count / 1000).toFixed(0)}k` : product.rating_count})
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Price & MRP */}
        <div className="mt-auto pt-2 flex items-baseline gap-2">
          <span className="text-base sm:text-lg font-extrabold text-neutral-900">
            {formatPrice(product.price)}
          </span>
          {product.mrp && product.mrp > product.price ? (
            <span className="text-xs text-neutral-400 line-through">
              {formatPrice(product.mrp)}
            </span>
          ) : null}
        </div>

        {/* Marketplace & Compare footer */}
        <div className="mt-3 pt-2 border-t border-pink-50 flex items-center justify-between">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${marketplace.badgeBg}`}>
            {marketplace.name}
          </span>
          <span className="text-[11px] text-pink-600 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
            Compare 4 Stores →
          </span>
        </div>
      </div>
    </div>
  );
}

