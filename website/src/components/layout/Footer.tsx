import React from 'react';
import Link from 'next/link';
import { CATEGORIES } from '@/lib/constants/categories';

export default function Footer() {
  return (
    <footer className="bg-neutral-900 text-neutral-300 pt-16 pb-12 border-t border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-neutral-800">
          {/* Brand info */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="inline-block">
              <span className="text-2xl font-extrabold text-white tracking-tight">
                Makeup<span className="text-pink-500">Khoj</span>
                <span className="text-pink-400 text-xl ml-0.5">✦</span>
              </span>
            </Link>
            <p className="text-sm text-neutral-400 max-w-sm leading-relaxed">
              India&apos;s premier makeup discovery & price comparison platform. Find the lowest prices on authentic cosmetics across Nykaa, Amazon, Flipkart, and Myntra.
            </p>

            <div className="pt-2">
              <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Supported Marketplaces
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {['Nykaa', 'Amazon', 'Flipkart', 'Myntra'].map((m) => (
                  <span
                    key={m}
                    className="px-2.5 py-1 rounded-md bg-neutral-800/80 border border-neutral-700/60 text-neutral-300 font-medium"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Categories
            </h4>
            <ul className="space-y-2 text-sm">
              {CATEGORIES.slice(0, 6).map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/categories/${c.slug}`}
                    className="hover:text-pink-400 transition-colors"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/categories" className="text-pink-400 hover:underline text-xs">
                  All Categories →
                </Link>
              </li>
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Explore
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/deals" className="hover:text-pink-400 transition-colors">
                  Top Deals & Discounts
                </Link>
              </li>
              <li>
                <Link href="/price-drops" className="hover:text-pink-400 transition-colors">
                  Price Drops
                </Link>
              </li>
              <li>
                <Link href="/trending" className="hover:text-pink-400 transition-colors">
                  Trending Products
                </Link>
              </li>
              <li>
                <Link href="/new-arrivals" className="hover:text-pink-400 transition-colors">
                  New Arrivals
                </Link>
              </li>
              <li>
                <Link href="/brands" className="hover:text-pink-400 transition-colors">
                  All Brands
                </Link>
              </li>
              <li>
                <Link href="/products" className="hover:text-pink-400 transition-colors">
                  All Products
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal & About */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Company
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="hover:text-pink-400 transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-pink-400 transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-pink-400 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-pink-400 transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/disclaimer" className="hover:text-pink-400 transition-colors">
                  Affiliate Disclaimer
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright & disclaimer */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-neutral-500 gap-4">
          <p>© {new Date().getFullYear()} MakeupKhoj. All rights reserved.</p>
          <p className="max-w-xl text-center md:text-right">
            Disclaimer: Product prices and availability are accurate as of the date/time indicated and are subject to change. Any price and availability information displayed on the merchant&apos;s site at the time of purchase will apply.
          </p>
        </div>
      </div>
    </footer>
  );
}

