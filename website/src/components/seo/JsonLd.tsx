import React from 'react';
import type { Product } from '@/types/product';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://makeupkhoj.com';

interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// Organization Schema
export function OrganizationJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'MakeupKhoj',
    url: BASE_URL,
    logo: `${BASE_URL}/assets/icons/trusted-stores-card.png`,
    description: 'India\'s leading makeup price comparison and beauty discovery platform. Compare prices across Nykaa, Amazon, Flipkart, Myntra, and Tata CLiQ.',
    sameAs: [
      'https://www.instagram.com/makeupkhoj',
      'https://twitter.com/makeupkhoj',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      email: 'support@makeupkhoj.com',
    },
  };
  return <JsonLd data={data} />;
}

// Website & SearchAction Schema
export function WebSiteJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
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
      item: item.url.startsWith('http') ? item.url : `${BASE_URL}${item.url}`,
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
    offers: {
      '@type': 'Offer',
      priceCurrency: product.currency || 'INR',
      price: product.price,
      priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      itemCondition: 'https://schema.org/NewCondition',
      availability: product.in_stock !== false
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: product.url,
      seller: {
        '@type': 'Organization',
        name: product.marketplace_name || 'Nykaa',
      },
    },
  };

  // Only include genuine AggregateRating when verified rating data exists
  if (product.rating && product.rating > 0 && product.rating_count && product.rating_count > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating,
      reviewCount: product.rating_count,
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
}: {
  name: string;
  description: string;
  products: Product[];
}) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    description,
    numberOfItems: products.length,
    itemListElement: products.map((p, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: p.name,
      url: `${BASE_URL}/products/${p.slug || p.id}`,
      image: p.image,
    })),
  };
  return <JsonLd data={data} />;
}

