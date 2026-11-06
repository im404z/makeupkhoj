import React from 'react';
import type { Metadata } from 'next';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { constructMetadata } from '@/lib/utils/seo';

export const metadata: Metadata = constructMetadata({
  title: 'About MakeupKhoj - India\'s Makeup Discovery Platform',
  description: 'Learn about MakeupKhoj: our mission to provide authentic cosmetics discovery, unbiased multi-marketplace price comparisons, and genuine beauty data.',
  canonical: '/about',
});

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto py-4">
      <Breadcrumb items={[{ label: 'About Us' }]} />

      <div className="bg-white rounded-3xl border border-pink-100 p-8 sm:p-12 shadow-sm space-y-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-pink-600 bg-pink-50 px-2.5 py-1 rounded-full border border-pink-100 inline-block mb-3">
            Our Mission
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-neutral-900 tracking-tight mb-4">
            About Makeup<span className="text-pink-600">Khoj</span>
          </h1>
          <p className="text-base text-neutral-600 leading-relaxed">
            MakeupKhoj was built with a single objective: to bring radical transparency, authentic discovery, and effortless price comparison to makeup lovers across India.
          </p>
        </div>

        <div className="border-t border-pink-100 pt-6 space-y-4 text-sm text-neutral-700 leading-relaxed">
          <h2 className="text-xl font-bold text-neutral-900">Why MakeupKhoj?</h2>
          <p>
            With thousands of beauty products launched every season across Nykaa, Amazon, Flipkart, and Myntra, shoppers often overpay or struggle to find the right shade, formula, or genuine deal. MakeupKhoj continuously indexes official retail listings to provide you:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-neutral-600">
            <li><strong>Live Multi-Store Price Comparison:</strong> See which retailer has the lowest price right now.</li>
            <li><strong>100% Genuine Retailer Links:</strong> We only direct you to authorized marketplaces and verified sellers.</li>
            <li><strong>Unbiased Reviews & Ratings:</strong> Aggregated from genuine verified purchasers.</li>
            <li><strong>Detailed Cosmetics Taxonomy:</strong> Search by formula, finish (matte, dewy), coverage, and skin type.</li>
          </ul>
        </div>

        <div className="border-t border-pink-100 pt-6 space-y-3 text-sm text-neutral-700">
          <h2 className="text-xl font-bold text-neutral-900">Supported Marketplaces</h2>
          <p className="text-neutral-600">
            We currently aggregate products and compare prices across <strong>Nykaa, Amazon India, Flipkart, and Myntra</strong>, with support for Tata CLiQ and brand-direct stores coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}

