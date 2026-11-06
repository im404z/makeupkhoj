import React from 'react';
import type { Metadata } from 'next';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { constructMetadata } from '@/lib/utils/seo';

export const metadata: Metadata = constructMetadata({
  title: 'Terms and Conditions - MakeupKhoj',
  description: 'Terms of use governing the MakeupKhoj beauty discovery and price comparison platform.',
  canonical: '/terms',
});

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto py-4">
      <Breadcrumb items={[{ label: 'Terms & Conditions' }]} />

      <div className="bg-white rounded-3xl border border-pink-100 p-8 sm:p-12 shadow-sm space-y-6 text-sm text-neutral-700 leading-relaxed">
        <h1 className="text-3xl font-black text-neutral-900 tracking-tight">Terms & Conditions</h1>
        <p className="text-xs text-neutral-400">Last updated: November 2026</p>

        <p>
          Welcome to MakeupKhoj. By accessing or using our website, you agree to comply with and be bound by the following terms and conditions.
        </p>

        <h2 className="text-lg font-bold text-neutral-900 pt-2">1. Use of Service</h2>
        <p>
          MakeupKhoj provides an informational price comparison and product discovery platform. We do not sell cosmetics directly, take customer payments, or deliver goods. All purchases are completed on third-party retailer platforms.
        </p>

        <h2 className="text-lg font-bold text-neutral-900 pt-2">2. Accuracy of Information</h2>
        <p>
          While we strive to keep pricing, stock status, ratings, and shades updated in real-time, discrepancies can occur between our last crawled check and the merchant&apos;s live cart. The actual price and terms displayed on the retailer website at checkout always govern the transaction.
        </p>

        <h2 className="text-lg font-bold text-neutral-900 pt-2">3. Intellectual Property</h2>
        <p>
          Product names, logos, and brands are property of their respective owners. Their use on this website is for identification and comparative purposes only and does not imply endorsement.
        </p>
      </div>
    </div>
  );
}

