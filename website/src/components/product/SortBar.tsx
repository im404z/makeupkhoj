'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ArrowUpDown } from 'lucide-react';

interface SortBarProps {
  total: number;
}

export default function SortBar({ total }: SortBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSort = searchParams.get('sort') || 'popular';

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', e.target.value);
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 sm:px-5 rounded-2xl border border-pink-100 shadow-sm mb-5">
      <div className="text-xs sm:text-sm text-neutral-600">
        Showing <span className="font-bold text-neutral-900">{total}</span> makeup products
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        <ArrowUpDown className="w-3.5 h-3.5 text-pink-500 hidden sm:block" />
        <label htmlFor="sort-select" className="text-xs text-neutral-500 font-medium whitespace-nowrap">
          Sort by:
        </label>
        <select
          id="sort-select"
          value={currentSort}
          onChange={handleSortChange}
          className="text-xs font-semibold text-neutral-800 bg-pink-50/50 border border-pink-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
        >
          <option value="popular">Most Popular</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="discount_desc">Highest Discount</option>
          <option value="rating_desc">Highest Rated</option>
          <option value="newest">Newest Arrivals</option>
        </select>
      </div>
    </div>
  );
}

