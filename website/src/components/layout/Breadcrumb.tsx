import React from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const jsonLdItems = [
    { name: 'Home', url: '/' },
    ...items.map((it) => ({
      name: it.label,
      url: it.href || '#',
    })),
  ];

  return (
    <>
      <BreadcrumbJsonLd items={jsonLdItems} />
      <nav aria-label="Breadcrumb" className="py-3 text-xs text-neutral-500 overflow-x-auto whitespace-nowrap">
        <ol className="flex items-center gap-1.5">
          <li className="flex items-center">
            <Link
              href="/"
              className="text-neutral-400 hover:text-pink-600 transition-colors flex items-center gap-1"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </Link>
          </li>

          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (
              <li key={idx} className="flex items-center gap-1.5">
                <ChevronRight className="w-3 h-3 text-neutral-300 flex-shrink-0" />
                {isLast || !item.href ? (
                  <span className="font-semibold text-neutral-800 truncate max-w-[200px] sm:max-w-xs">
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className="hover:text-pink-600 transition-colors truncate max-w-[150px] sm:max-w-xs"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

