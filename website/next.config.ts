import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  // Target search bots specifically for metadata resolution, allowing streaming HTML for human users
  htmlLimitedBots: /Googlebot|bingbot|Baiduspider|YandexBot|DuckDuckBot|Slurp/i,
  images: {
    imageSizes: [32, 48, 64, 96, 128, 144, 160, 192, 224, 256, 320, 384],
    qualities: [60, 75],
    remotePatterns: [
      { protocol: 'https', hostname: '*.myntassets.com' },
      { protocol: 'https', hostname: '*.flixcart.com' },
      { protocol: 'https', hostname: 'images-na.ssl-images-amazon.com' },
      { protocol: 'https', hostname: 'images-eu.ssl-images-amazon.com' },
      {
        protocol: "https",
        hostname: "images-static.nykaa.com",
      },
      {
        protocol: "https",
        hostname: "rukminim2.flixcart.com",
      },
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
      },
      {
        protocol: "https",
        hostname: "assets.myntassets.com",
      },
      {
        protocol: "https",
        hostname: "www.tatacliq.com",
      },
      {
        protocol: "https",
        hostname: "*.nykaa.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },
};

export default nextConfig;
