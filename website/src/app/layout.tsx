import type { Metadata } from 'next';
import './globals.css';
import {nohemi} from './fonts';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { OrganizationJsonLd, WebSiteJsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://makeupkhoj.com'),
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/fav.png', sizes: '900x900', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  title: {
    default: 'MakeupKhoj - Discover & Compare Makeup Prices Across Stores',
    template: '%s | MakeupKhoj',
  },
  description:
    'Compare makeup prices across Nykaa, Amazon, Flipkart, and Myntra. Explore recorded prices, makeup shades, store offers and customer ratings.',
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
        url: '/assets/banners/editorial-hero.webp',
        width: 1536,
        height: 1024,
        alt: 'MakeupKhoj Makeup Discovery',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MakeupKhoj - Compare Makeup Prices',
    description: 'Find lowest prices across Nykaa, Amazon, Myntra & Flipkart.',
    images: ['/assets/banners/editorial-hero.webp'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={nohemi.variable}>
      <head>
        <OrganizationJsonLd />
        <WebSiteJsonLd />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        <Header />
        <main className="site-main">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
