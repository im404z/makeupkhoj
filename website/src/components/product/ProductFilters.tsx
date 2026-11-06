'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Filter, RotateCcw } from 'lucide-react';
import { CATEGORIES } from '@/lib/constants/categories';

interface ProductFiltersProps {
  currentCategory?: string;
  currentSub?: string;
}

export default function ProductFilters({ currentCategory, currentSub }: ProductFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Selected filters from URL
  const selectedBrands = searchParams.getAll('brand');
  const selectedMarketplaces = searchParams.getAll('marketplace');
  const selectedMinDiscount = searchParams.get('minDiscount') || '';
  const selectedRating = searchParams.get('rating') || '';
  const inStockOnly = searchParams.get('inStock') === 'true';

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', '1'); // reset page on filter change
    if (value === null || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const toggleArrayParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', '1');
    const existing = params.getAll(key);
    params.delete(key);
    if (existing.includes(value)) {
      existing.filter((v) => v !== value).forEach((v) => params.append(key, v));
    } else {
      [...existing, value].forEach((v) => params.append(key, v));
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearAllFilters = () => {
    router.push(pathname);
  };

  const topBrands = [
    'Lakmé',
    'Maybelline New York',
    'Charlotte Tilbury',
    'Insight Cosmetics',
    'Makeup Revolution',
    'PAC',
    'M.A.C',
    'Swiss Beauty',
    'Daily Life Forever52',
    'NARS',
    'Benefit Cosmetics',
    'e.l.f. Cosmetics',
    'MARS',
    'Kay Beauty',
  ];

  const marketplaces = [
    { id: 'nykaa', label: 'Nykaa' },
    { id: 'amazon', label: 'Amazon' },
    { id: 'flipkart', label: 'Flipkart' },
    { id: 'myntra', label: 'Myntra' },
  ];

  const hasActiveFilters =
    selectedBrands.length > 0 ||
    selectedMarketplaces.length > 0 ||
    selectedMinDiscount !== '' ||
    selectedRating !== '' ||
    inStockOnly;

  return (
    <aside className="bg-white rounded-3xl border border-pink-100 p-5 shadow-sm space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-pink-100">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-pink-600" />
          <h2 className="text-sm font-bold text-neutral-900">Filters</h2>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-pink-600 hover:text-pink-700 font-semibold flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Reset All
          </button>
        )}
      </div>

      {/* Marketplaces */}
      <div>
        <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-2.5">
          Marketplace
        </h3>
        <div className="space-y-1.5">
          {marketplaces.map((m) => {
            const checked = selectedMarketplaces.includes(m.id);
            return (
              <label
                key={m.id}
                className="flex items-center gap-2.5 text-xs text-neutral-700 hover:text-neutral-900 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleArrayParam('marketplace', m.id)}
                  className="rounded text-pink-600 focus:ring-pink-500 border-pink-300 w-3.5 h-3.5"
                />
                <span>{m.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Discount */}
      <div>
        <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-2.5">
          Minimum Discount
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {['10', '20', '30', '40', '50'].map((d) => {
            const active = selectedMinDiscount === d;
            return (
              <button
                key={d}
                onClick={() => updateParam('minDiscount', active ? null : d)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                  active
                    ? 'bg-pink-600 text-white border-pink-600 font-bold'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-pink-300'
                }`}
              >
                {d}%+
              </button>
            );
          })}
        </div>
      </div>

      {/* Customer Rating */}
      <div>
        <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-2.5">
          Customer Rating
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {['4', '3', '2'].map((r) => {
            const active = selectedRating === r;
            return (
              <button
                key={r}
                onClick={() => updateParam('rating', active ? null : r)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                  active
                    ? 'bg-pink-600 text-white border-pink-600 font-bold'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:border-pink-300'
                }`}
              >
                ★ {r} & Above
              </button>
            );
          })}
        </div>
      </div>

      {/* Brands */}
      <div>
        <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-2.5">
          Popular Brands
        </h3>
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {topBrands.map((b) => {
            const checked = selectedBrands.includes(b);
            return (
              <label
                key={b}
                className="flex items-center gap-2.5 text-xs text-neutral-700 hover:text-neutral-900 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleArrayParam('brand', b)}
                  className="rounded text-pink-600 focus:ring-pink-500 border-pink-300 w-3.5 h-3.5"
                />
                <span className="truncate">{b}</span>
              </label>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

