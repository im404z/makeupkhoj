import React from 'react';
import Link from 'next/link';
import { ArrowRight, Flame } from 'lucide-react';
import HeroBanner from '@/components/home/HeroBanner';
import FeatureCards from '@/components/home/FeatureCards';
import CategoryGrid from '@/components/home/CategoryGrid';
import PromoCards from '@/components/home/PromoCards';
import BrandStrip from '@/components/home/BrandStrip';
import LookBook from '@/components/home/LookBook';
import ProductGrid from '@/components/product/ProductGrid';
import { queryProducts } from '@/lib/utils/products';

export const revalidate = 60; // SSR ISR revalidate every 60s

export default async function HomePage() {
  // Fetch real trending and discount products directly from MongoDB
  const [trendingRes, dealsRes] = await Promise.all([
    queryProducts({ limit: 8, sort: 'popular' }),
    queryProducts({ limit: 8, minDiscount: 20, sort: 'discount_desc' }),
  ]);

  return (
    <div className="space-y-4">
      {/* 1. Hero Section with 4 Marketplace Highlights */}
      <HeroBanner />

      {/* 2. Value Props (Compare Prices, Track Drops, Wide Selection, Trusted) */}
      <FeatureCards />

      {/* 3. Shop by Category (8 main categories with provided asset tiles) */}
      <CategoryGrid />

      {/* 4. Promo Banners (Top Deals, New Arrivals, Price Drop Alerts) */}
      <PromoCards />

      {/* 5. Trending Products Section */}
      <section className="mb-14">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-pink-600">
              <Flame className="w-4 h-4 fill-pink-600" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
                Trending Now
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Most popular makeup products trending across beauty communities
              </p>
            </div>
          </div>
          <Link
            href="/trending"
            className="text-xs sm:text-sm font-bold text-pink-600 hover:text-pink-700 flex items-center gap-1 transition-colors"
          >
            View All Trending <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <ProductGrid products={trendingRes.products} />
      </section>

      {/* 6. Shop by Brands */}
      <BrandStrip />

      {/* 7. Makeup Looks Section */}
      <LookBook />

      {/* 8. Top Deals & Price Drops */}
      {dealsRes.products.length > 0 && (
        <section className="mb-14">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-[11px] font-bold text-pink-600 uppercase tracking-wider">
                Steal Deals
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
                Deepest Discounts Today
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Top rated foundations, lipsticks & cosmetics with 20%+ discount
              </p>
            </div>
            <Link
              href="/deals"
              className="text-xs sm:text-sm font-bold text-pink-600 hover:text-pink-700 flex items-center gap-1 transition-colors"
            >
              All Deals <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <ProductGrid products={dealsRes.products} />
        </section>
      )}
    </div>
  );
}
