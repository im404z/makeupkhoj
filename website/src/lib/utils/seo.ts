import {validateListingPage} from '@/lib/seo/listing-request';
import {stripEmoji} from './plain-text.mjs';
import {catalogUrl,hasCatalogFilters,catalogParams} from './catalog-urls';
import type { Metadata } from 'next';

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://makeupkhoj.com').replace(/\/+$/, '');
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
  ogImage = `${BASE_URL}/assets/banners/editorial-hero.webp`,
  ogType = 'website',
  keywords = [],
  noindex = false,
}: SeoProps): Metadata {
  title = stripEmoji(title).replace(/\u2014/g, '-');
  description = stripEmoji(description).replace(/\u2014/g, '-');
  ogImage = ogImage || `${BASE_URL}/assets/banners/editorial-hero.webp`;
  const baseTitle = title.replace(/\s*\|\s*MakeupKhoj/g, '').trim();
  const shortTitle = baseTitle.length > 60 ? baseTitle.slice(0, 57).replace(/\s+\S*$/, '') + '…' : baseTitle;
  const fullTitle = shortTitle.includes(SITE_NAME) ? shortTitle : `${shortTitle} | ${SITE_NAME}`;
  description = description.trim();
  if (description.length > 170) description = description.slice(0, 167).replace(/\s+\S*$/, '') + '…';
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
    title: { absolute: fullTitle },
    description,
    keywords: [...keywords, ...defaultKeywords].join(', '),
    metadataBase: new URL(BASE_URL),
    alternates: {
      canonical: canonicalUrl,
    },
    robots: noindex
      ? { index: false, follow: true }
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
          width: 1536,
          height: 1024,
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

export type ListingSearchParams = Record<string, string | string[] | undefined>;
export async function collectionMetadata(title: string, description: string, path: string, params: ListingSearchParams = {}): Promise<Metadata> {
  await validateListingPage(path,params);
  const page = Math.max(1, Number(catalogParams(path,params).get('page'))||1);
  const filtered = path==='/search'||hasCatalogFilters(path,params);
  return constructMetadata({
    title: `${title}${page > 1 ? ` - Page ${page}` : ''}`,
    description: `${description}${page > 1 ? ` Browse page ${page}.` : ''}`,
    canonical: catalogUrl(path,params),
    noindex: filtered,
  });
}

