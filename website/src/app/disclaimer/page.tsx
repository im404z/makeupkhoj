import React from 'react';
import type { Metadata } from 'next';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { constructMetadata } from '@/lib/utils/seo';

export const metadata: Metadata = constructMetadata({
  title: 'Affiliate Disclaimer - MakeupKhoj',
  description: 'Our full affiliate relationship disclosure and editorial independence statement.',
  canonical: '/disclaimer',
});

export default function DisclaimerPage() {
  return (
    <div className="max-w-4xl mx-auto py-4">
      <Breadcrumb items={[{ label: 'Disclaimer' }]} />

      <div className="bg-white rounded-3xl border border-pink-100 p-8 sm:p-12 shadow-sm space-y-6 text-sm text-neutral-700 leading-relaxed">
        <h1 className="text-3xl font-black text-neutral-900 tracking-tight">Affiliate Disclaimer</h1>
        <p className="text-xs text-neutral-400">Last updated: November 2026</p>

        <p>
          MakeupKhoj participates in various affiliate marketing programs designed to provide a means for sites to earn advertising fees by advertising and linking to official e-commerce merchants.
        </p>

        <h2 className="text-lg font-bold text-neutral-900 pt-2">Affiliate Links Disclosure</h2>
        <p>
          Some of the outbound links on MakeupKhoj are affiliate links. If you click on an affiliate link and make a purchase on a merchant site (such as Amazon, Nykaa, Flipkart, or Myntra), we may receive a small commission at no additional cost to you.
        </p>

        <h2 className="text-lg font-bold text-neutral-900 pt-2">Editorial Independence & Price Neutrality</h2>
        <p>
          Our price comparisons are calculated strictly based on objective price matching algorithms. We always highlight the lowest available price regardless of whether a retailer offers an affiliate commission.
        </p>
      </div>
    </div>
  );
}

