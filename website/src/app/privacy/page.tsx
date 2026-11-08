import React from 'react';
import type { Metadata } from 'next';
import Breadcrumb from '@/components/layout/Breadcrumb';
import { constructMetadata } from '@/lib/utils/seo';

export const metadata: Metadata = constructMetadata({
  title: 'Privacy Policy - MakeupKhoj',
  description: 'Understand how MakeupKhoj collects, uses, and protects your information.',
  canonical: '/privacy',
});

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto py-4">
      <Breadcrumb items={[{ label: 'Privacy Policy' }]} />

      <div className="bg-white rounded-3xl border border-pink-100 p-8 sm:p-12 shadow-sm space-y-6 text-sm text-neutral-700 leading-relaxed">
        <h1 className="text-3xl font-black text-neutral-900 tracking-tight">Privacy Policy</h1>
        <p className="text-xs text-neutral-400">Last updated: November 2026</p>

        <p>
          At MakeupKhoj, we respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect and use data when you browse our website.
        </p>

        <h2 className="text-lg font-bold text-neutral-900 pt-2">1. Information We Collect</h2>
        <p>
          We do not require user accounts to browse, compare prices, or discover makeup. We may collect anonymous aggregate analytical data such as page views, browser type, device information, and search queries to improve our platform performance.
        </p>

        <h2 className="text-lg font-bold text-neutral-900 pt-2">2. Cookies and Tracking</h2>
        <p>
          We use functional cookies to remember your sorting and display preferences. We also use analytics tools (such as Google Analytics) to understand aggregated traffic patterns.
        </p>

        <h2 className="text-lg font-bold text-neutral-900 pt-2">3. Outbound Retailer Links</h2>
        <p>
          When outbound click tracking is enabled, we store aggregate daily counts by product, marketplace and link method. These counts do not include visitor IP addresses, identities or tracking cookies. Some store links are affiliate links, which may earn us a commission. When you click on a store link (e.g., Nykaa, Amazon, Flipkart, Myntra), you leave MakeupKhoj and are redirected to the merchant&apos;s site. Please consult the privacy policy of each retailer for their specific data handling practices.
        </p>

        <h2 className="text-lg font-bold text-neutral-900 pt-2">4. Contact</h2>
        <p>
          For privacy-related queries, please email us at <strong>privacy@makeupkhoj.com</strong>.
        </p>
      </div>
    </div>
  );
}

