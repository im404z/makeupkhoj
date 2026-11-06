import type { Metadata } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://makeupkhoj.com';
const SITE_NAME = 'MakeupKhoj';

interface SeoProps {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  keywords?: string[];
  noindex?: boolean;
}

export function constructMetadata({
  title,
  description,
  canonical,
  ogImage = `${BASE_URL}/assets/banners/hero-banner.jpg`,
  ogType = 'website',
  keywords = [],
  noindex = false,
}: SeoProps): Metadata {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = canonical ? `${BASE_URL}${canonical}` : BASE_URL;

  const defaultKeywords = [
    'makeup price comparison',
    'buy makeup online india',
    'nykaa makeup discounts',
    'myntra cosmetics sale',
    'amazon beauty deals',
    'best price lipstick foundation blush',
    'makeup price drop alert',
    'compare cosmetics india',
  ];

  return {
    title: fullTitle,
    description,
    keywords: [...keywords, ...defaultKeywords].join(', '),
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: canonicalUrl,
    },
    robots: noindex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-video-preview': -1,
            'max-image-preview': 'large',
            'max-snippet': -1,
          },
        },
    openGraph: {
      title: fullTitle,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: 'en_IN',
      type: ogType,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [ogImage],
      creator: '@makeupkhoj',
    },
  };
}

