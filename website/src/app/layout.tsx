import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { OrganizationJsonLd, WebSiteJsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://makeupkhoj.com'),
  title: {
    default: 'MakeupKhoj - Discover & Compare Makeup Prices Across Stores',
    template: '%s | MakeupKhoj',
  },
  description:
    'Compare makeup prices across Nykaa, Amazon, Flipkart, and Myntra. Find real-time price drops, authentic cosmetic deals, shades, and verified beauty ratings.',
  keywords: [
    'makeup price comparison',
    'compare cosmetics india',
    'nykaa makeup sale',
    'myntra makeup deals',
    'amazon beauty discounts',
    'flipkart cosmetics offer',
    'lipstick price compare',
    'foundation price drop',
  ],
  authors: [{ name: 'MakeupKhoj Team' }],
  creator: 'MakeupKhoj',
  publisher: 'MakeupKhoj',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: 'https://makeupkhoj.com',
    siteName: 'MakeupKhoj',
    title: 'MakeupKhoj - Discover & Compare Makeup Prices Across Stores',
    description:
      'Compare makeup prices across Nykaa, Amazon, Flipkart, and Myntra. Find real-time price drops and beauty deals.',
    images: [
      {
        url: '/assets/banners/hero-banner.jpg',
        width: 1200,
        height: 630,
        alt: 'MakeupKhoj Makeup Discovery',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MakeupKhoj - Compare Makeup Prices',
    description: 'Find lowest prices across Nykaa, Amazon, Myntra & Flipkart.',
    images: ['/assets/banners/hero-banner.jpg'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <OrganizationJsonLd />
        <WebSiteJsonLd />
      </head>
      <body className="min-h-screen flex flex-col bg-[#fffafa] text-neutral-900 antialiased">
        <Header />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
