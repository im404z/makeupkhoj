import React from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Star, ExternalLink, ShieldCheck, Truck, RotateCcw, Sparkles } from 'lucide-react';
import Breadcrumb from '@/components/layout/Breadcrumb';
import ProductGrid from '@/components/product/ProductGrid';
import { ProductJsonLd } from '@/components/seo/JsonLd';
import { getProductBySlugOrId, getCrossMarketplaceOffers, queryProducts } from '@/lib/utils/products';
import { formatPrice, formatDiscount } from '@/lib/utils/format';
import { MARKETPLACES } from '@/lib/constants/marketplaces';
import { constructMetadata } from '@/lib/utils/seo';

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlugOrId(slug);
  if (!product) {
    return { title: 'Product Not Found | MakeupKhoj' };
  }

  const bestPrice = formatPrice(product.price);
  return constructMetadata({
    title: `${product.brand} ${product.name} Best Price Online (${bestPrice})`,
    description: `Buy ${product.brand} ${product.name} at lowest price ${bestPrice}. Compare prices, offers, and discounts across Nykaa, Amazon, Flipkart & Myntra.`,
    canonical: `/products/${product.slug || product.id}`,
    ogImage: product.high_res_image || product.image,
  });
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { slug } = await params;
  const product = await getProductBySlugOrId(slug);

  if (!product) {
    notFound();
  }

  // Cross-marketplace price comparison offers
  const offers = await getCrossMarketplaceOffers(product);
  const cheapestOffer = offers.length > 0 ? offers[0] : product;

  // Similar products from same brand or category
  const similarRes = await queryProducts({
    sub_category: product.sub_category || product.sub_sub_category,
    limit: 4,
  });
  const similarProducts = similarRes.products.filter((p) => p.id !== product.id);

  const breadcrumbs = [
    { label: product.category || 'Makeup', href: '/products' },
    { label: product.sub_category || 'Cosmetics', href: `/categories/${(product.sub_category || '').toLowerCase()}` },
    { label: product.brand, href: `/brands/${encodeURIComponent((product.brand || '').toLowerCase())}` },
    { label: product.name },
  ];

  const mainImage = product.high_res_image || product.image || '/assets/banners/hero-banner.jpg';

  return (
    <div>
      <Breadcrumb items={breadcrumbs} />
      <ProductJsonLd product={product} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 mb-14 bg-white rounded-3xl border border-pink-100 p-6 sm:p-8 lg:p-10 shadow-sm">
        {/* Left: Product Images Gallery */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-pink-50/40 border border-pink-100">
            <Image
              src={mainImage}
              alt={product.name}
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-contain p-4"
              priority
            />
            {product.discount_percentage && product.discount_percentage > 0 ? (
              <span className="absolute top-4 left-4 bg-gradient-to-r from-pink-600 to-rose-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                {formatDiscount(product.discount_percentage)}
              </span>
            ) : null}
          </div>

          {/* Customer Photos strip if available */}
          {product.customer_photos && product.customer_photos.length > 0 && (
            <div>
              <div className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-2">
                Real Customer Photos ({product.customer_photos.length})
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.customer_photos.slice(0, 5).map((photo, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-pink-100">
                    <Image src={photo} alt="Customer Review" fill className="object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Product Info & Price Comparison */}
        <div className="lg:col-span-7 flex flex-col">
          {/* Brand & Title */}
          <div className="mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-pink-600 bg-pink-50 px-2.5 py-1 rounded-full border border-pink-100 inline-block mb-2">
              {product.brand}
            </span>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-neutral-900 tracking-tight leading-snug">
              {product.name}
            </h1>
          </div>

          {/* Rating & Reviews */}
          {product.rating && product.rating > 0 ? (
            <div className="flex items-center gap-3 mb-5">
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-1 rounded-lg border border-emerald-200">
                {product.rating.toFixed(1)}
                <Star className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
              </span>
              {product.rating_count ? (
                <span className="text-xs text-neutral-500 font-medium">
                  {product.rating_count.toLocaleString()} verified ratings & reviews
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Best Price Highlight Box */}
          <div className="bg-gradient-to-r from-pink-50 via-rose-50 to-pink-50 rounded-2xl border border-pink-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-pink-700">
                Lowest Available Price
              </span>
              <span className="text-xs text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full font-bold">
                ✓ Best Deal
              </span>
            </div>

            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-3xl sm:text-4xl font-black text-neutral-900">
                {formatPrice(cheapestOffer.price)}
              </span>
              {cheapestOffer.mrp && cheapestOffer.mrp > cheapestOffer.price ? (
                <span className="text-sm text-neutral-400 line-through">
                  MRP {formatPrice(cheapestOffer.mrp)}
                </span>
              ) : null}
              {cheapestOffer.discount_percentage ? (
                <span className="text-xs font-bold text-pink-600">
                  Save {cheapestOffer.discount_percentage}%
                </span>
              ) : null}
            </div>

            <div className="text-xs text-neutral-600 flex items-center gap-2">
              <span>Cheapest on:</span>
              <span className="font-bold text-neutral-900">{cheapestOffer.marketplace_name || 'Nykaa'}</span>
            </div>
          </div>

          {/* Multi-Store Price Comparison Table */}
          <div className="mb-6">
            <h3 className="text-sm font-bold text-neutral-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-pink-600" />
              Live Marketplace Price Comparison
            </h3>

            <div className="border border-pink-100 rounded-2xl overflow-hidden divide-y divide-pink-100">
              {offers.map((offer, idx) => {
                const isCheapest = offer.price === cheapestOffer.price;
                const mp = MARKETPLACES[offer.marketplace] || {
                  name: offer.marketplace_name,
                  badgeBg: 'bg-pink-100 text-pink-700',
                  deliveryDays: '2-4 Days',
                };

                return (
                  <div
                    key={idx}
                    className={`p-3.5 sm:p-4 flex items-center justify-between gap-4 transition-colors ${
                      isCheapest ? 'bg-pink-50/40' : 'bg-white hover:bg-neutral-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${mp.badgeBg}`}>
                        {mp.name}
                      </span>
                      {isCheapest && (
                        <span className="hidden sm:inline-block text-[10px] font-extrabold uppercase tracking-wider text-pink-600 bg-pink-100 px-2 py-0.5 rounded-full">
                          Lowest Price
                        </span>
                      )}
                    </div>

                    <div className="text-right flex items-center gap-4">
                      <div>
                        <div className="text-base font-extrabold text-neutral-900">
                          {formatPrice(offer.price)}
                        </div>
                        {offer.mrp && offer.mrp > offer.price ? (
                          <div className="text-[11px] text-neutral-400 line-through">
                            {formatPrice(offer.mrp)}
                          </div>
                        ) : null}
                      </div>

                      <a
                        href={offer.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          isCheapest
                            ? 'bg-pink-600 hover:bg-pink-700 text-white shadow-sm'
                            : 'bg-neutral-900 hover:bg-neutral-800 text-white'
                        }`}
                      >
                        Buy on {mp.name} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Makeup Specifications if available */}
          {(product.shade || product.finish || product.coverage || product.formulation || product.skin_type) && (
            <div className="mb-6 border-t border-pink-100 pt-5">
              <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-3">
                Makeup Attributes & Specs
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {product.shade && (
                  <div className="bg-pink-50/40 p-2.5 rounded-xl border border-pink-100">
                    <span className="text-neutral-400 block text-[10px]">Shade</span>
                    <span className="font-bold text-neutral-800">{product.shade}</span>
                  </div>
                )}
                {product.finish && (
                  <div className="bg-pink-50/40 p-2.5 rounded-xl border border-pink-100">
                    <span className="text-neutral-400 block text-[10px]">Finish</span>
                    <span className="font-bold text-neutral-800">{product.finish}</span>
                  </div>
                )}
                {product.coverage && (
                  <div className="bg-pink-50/40 p-2.5 rounded-xl border border-pink-100">
                    <span className="text-neutral-400 block text-[10px]">Coverage</span>
                    <span className="font-bold text-neutral-800">{product.coverage}</span>
                  </div>
                )}
                {product.formulation && (
                  <div className="bg-pink-50/40 p-2.5 rounded-xl border border-pink-100">
                    <span className="text-neutral-400 block text-[10px]">Formulation</span>
                    <span className="font-bold text-neutral-800">{product.formulation}</span>
                  </div>
                )}
                {product.pack_size && (
                  <div className="bg-pink-50/40 p-2.5 rounded-xl border border-pink-100">
                    <span className="text-neutral-400 block text-[10px]">Pack Size</span>
                    <span className="font-bold text-neutral-800">{product.pack_size}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-pink-100 text-[11px] text-neutral-600">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-pink-600 flex-shrink-0" />
              <span>100% Genuine</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-pink-600 flex-shrink-0" />
              <span>Fast Shipping</span>
            </div>
            <div className="flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-pink-600 flex-shrink-0" />
              <span>Easy Returns</span>
            </div>
          </div>
        </div>
      </div>

      {/* Product Description */}
      {product.description && (
        <div className="bg-white rounded-3xl border border-pink-100 p-6 sm:p-8 mb-14 shadow-sm">
          <h2 className="text-lg font-bold text-neutral-900 mb-4">Product Details & How to Apply</h2>
          <div className="prose prose-sm prose-pink max-w-none text-neutral-600 leading-relaxed whitespace-pre-line">
            {product.description}
          </div>
        </div>
      )}

      {/* Similar Products */}
      {similarProducts.length > 0 && (
        <section className="mb-14">
          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight">
              Similar {product.sub_category || 'Cosmetics'}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Discover alternatives in the same category and price bracket
            </p>
          </div>
          <ProductGrid products={similarProducts} />
        </section>
      )}
    </div>
  );
}

