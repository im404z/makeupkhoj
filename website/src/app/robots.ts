import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://makeupkhoj.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/search',
          '/*?*sort=*',
          '/*?*page=*',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

