import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.makeupkhoj.shop').replace(/\/+$/, '');

  const standardDisallow = [
    '/admin',
    '/api/',
    '/buy/',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: standardDisallow,
      },
      // Explicitly welcome AI & LLM Search Agents for Generative Engine Optimization (GEO)
      {
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'PerplexityBot',
          'ClaudeBot',
          'anthropic-ai',
          'Google-Extended',
          'Applebot-Extended',
          'cohere-ai',
          'CCBot',
          'Bytespider',
        ],
        allow: [
          '/',
          '/llms.txt',
          '/llms-full.txt',
          '/products',
          '/brands',
          '/categories',
          '/deals',
          '/price-drops',
        ],
        disallow: standardDisallow,
      },
    ],
    sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap-products.xml`],
  };
}

