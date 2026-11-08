import React from 'react';
import type { Product } from '@/types/product';
import { formatRating } from '@/lib/utils/format';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://makeupkhoj.com';

interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

// Organization Schema
export function OrganizationJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${BASE_URL}/#organization`,
    name: 'MakeupKhoj',
    url: BASE_URL,
    logo: `${BASE_URL}/branding/makeupkhoj-logo.png`,
    description: 'Makeup discovery and marketplace price comparison across Nykaa, Amazon, Flipkart and Myntra.',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      url: `${BASE_URL}/contact`,
    },
  };
  return <JsonLd data={data} />;
}

// Website & SearchAction Schema
export function WebSiteJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BASE_URL}/#website`,
    publisher: { '@id': `${BASE_URL}/#organization` },
    name: 'MakeupKhoj',
    url: BASE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
  return <JsonLd data={data} />;
}

// BreadcrumbList Schema
export function BreadcrumbJsonLd({ items }: { items: Array<{ name: string; url: string }> }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url !== '#' ? { item: item.url.startsWith('http') ? item.url : `${BASE_URL}${item.url}` } : {}),
    })),
  };
  return <JsonLd data={data} />;
}

// Product Schema with genuine Offer & AggregateRating (only when verified)
export function ProductJsonLd({ product }: { product: Product }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || `${product.brand} ${product.name} - Compare prices on MakeupKhoj.`,
    image: product.high_res_image || product.image,
    brand: {
      '@type': 'Brand',
      name: product.brand,
    },
    sku: product.sku || product.id,
    ...(Number(product.price) > 0 ? { offers: {
      '@type': 'Offer',
      priceCurrency: product.currency || 'INR',
      price: Number(product.price),
      itemCondition: 'https://schema.org/NewCondition',
      ...(typeof product.in_stock === 'boolean' ? { availability: product.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } : {}),
      url: product.url,
      seller: {
        '@type': 'Organization',
        name: product.marketplace_name || product.marketplace,
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'IN',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 15,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
      },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: '0',
          currency: 'INR',
        },
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'IN',
        },
      },
    } } : {}),
  };

  // Only include genuine AggregateRating when verified rating data exists
  const rating = formatRating(product.rating);
  if (rating && Number(product.rating_count) > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(rating),
      ratingCount: Number(product.rating_count),
      bestRating: 5,
      worstRating: 1,
    };
  }

  return <JsonLd data={schema} />;
}

// ItemList Schema for Category and Listing Pages
export function ItemListJsonLd({
  name,
  description,
  products,
  url,
  total,
  page = 1,
  brand,
}: {
  name: string;
  description: string;
  products: Product[];
  url?: string;
  total?: number;
  page?: number;
  brand?: string;
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    description,
    numberOfItems: total ?? products.length,
    itemListElement: products.map((p, index) => ({
      '@type': 'ListItem',
      position: (page - 1) * 24 + index + 1,
      name: p.name,
      url: `${BASE_URL}${p.comparison?.href || "/product/"+(p.slug || p.id)}`,
      image: p.image,
    })),
  };
  if (!url) return <JsonLd data={data} />;
  const canonical = new URL(url, BASE_URL).href;
  return <JsonLd data={{ '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', '@id': canonical + '#collection', url: canonical, name, description,
      isPartOf: { '@id': `${BASE_URL}/#website` }, mainEntity: { '@id': canonical + '#items' },
      ...(brand ? { about: { '@type': 'Brand', name: brand } } : {}),
    },
    { ...data, '@id': canonical + '#items' },
  ] }} />;
}

// FAQPage Schema for Informational, Category & Brand Pages
export function FAQJsonLd({ faqs }: { faqs: Array<{ question: string; answer: string }> }) {
  if (!faqs || faqs.length === 0) return null;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
  return <JsonLd data={data} />;
}

