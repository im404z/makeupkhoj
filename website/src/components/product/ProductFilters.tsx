'use client';
import {catalogUrl} from '@/lib/utils/catalog-urls';
import {slugify} from '@/lib/utils/format';

import React, { useState } from 'react';
import useSWR from 'swr';
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
  const [brandSearch, setBrandSearch] = useState('');
  const [priceError, setPriceError] = useState('');
  const [filtersOpen,setFiltersOpen]=useState(false);
  const { data: brandData } = useSWR<{brands:Array<{name:string;count:number}>}>('/api/brands', async (url:string) => {const r=await fetch(url);if(!r.ok)throw Error('Could not load brands');return r.json();}, { revalidateOnFocus: false });

  // Selected filters from URL
  const selectedBrands = searchParams.getAll('brand').map(slugify);
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
    router.push(catalogUrl(pathname,params));
  };

  const toggleArrayParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', '1');
    if(key==='brand')value=slugify(value);
    const existing = params.getAll(key).map(v=>key==='brand'?slugify(v):v);
    params.delete(key);
    if (existing.includes(value)) {
      existing.filter((v) => v !== value).forEach((v) => params.append(key, v));
    } else {
      [...existing, value].forEach((v) => params.append(key, v));
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const clearAllFilters = () => {
    router.push(catalogUrl(pathname,{q:searchParams.get('q')||undefined}));
  };

  const fallbackBrands = [
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
  const brandNames=brandData?.brands.map(b=>b.name)||fallbackBrands;
  const topBrands = [...new Set([...selectedBrands.map(value=>brandNames.find(name=>slugify(name)===value)||value), ...brandNames])]
    .filter(b=>b.toLowerCase().includes(brandSearch.toLowerCase())).slice(0,100);

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
    inStockOnly || !!searchParams.get('minPrice') || !!searchParams.get('maxPrice') || !!searchParams.get('finish');

  return (
    <div className={'market-filter-panel'+(filtersOpen?' market-filter-panel--open':'')}><button type="button" className="market-filter-toggle" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(!filtersOpen)}><Filter size={16}/>{filtersOpen?'Close filters':'Filter products'}{hasActiveFilters&&' · Active'}</button><aside className="market-filters bg-white rounded-3xl border border-pink-100 p-5 shadow-sm space-y-6">
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

      <form key={searchParams.toString()} onSubmit={e=>{
        e.preventDefault();const form=new FormData(e.currentTarget),min=String(form.get('minPrice')||''),max=String(form.get('maxPrice')||'');
        if(min&&max&&Number(min)>Number(max)){setPriceError('Maximum must be at least the minimum.');return;}
        const params=new URLSearchParams(searchParams.toString());params.set('page','1');
        for(const [key,value] of [['minPrice',min],['maxPrice',max]]){if(value)params.set(key,value);else params.delete(key);}
        setPriceError('');router.push(catalogUrl(pathname,params));
      }} className="space-y-3">
        <h3 className="eyebrow">Price range · INR</h3>
        <div className="grid grid-cols-2 gap-2"><label><span className="sr-only">Minimum price</span><input name="minPrice" type="number" min="0" inputMode="numeric" placeholder="Min ₹" defaultValue={searchParams.get('minPrice')||''} className="w-full min-w-0 border border-[#deded5] p-2 text-xs"/></label><label><span className="sr-only">Maximum price</span><input name="maxPrice" type="number" min="0" inputMode="numeric" placeholder="Max ₹" defaultValue={searchParams.get('maxPrice')||''} className="w-full min-w-0 border border-[#deded5] p-2 text-xs"/></label></div>
        <button className="w-full border border-[#deded5] py-2 text-xs">Apply price</button>{priceError&&<p role="alert" className="text-xs text-red-700">{priceError}</p>}
      </form>
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
                {r} / 5 & Above
              </button>
            );
          })}
        </div>
      </div>

      {/* Brands */}
      <div>
        <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider mb-2.5">
          Brands
        </h3>
        <input aria-label="Find a brand" placeholder="Find a brand" value={brandSearch} onChange={e=>setBrandSearch(e.target.value)} className="w-full border border-[#deded5] p-2 text-xs mb-3"/>
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
          {topBrands.map((b) => {
            const checked = selectedBrands.includes(slugify(b));
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
      <label className="flex gap-2 text-xs items-center"><input type="checkbox" checked={inStockOnly} onChange={()=>updateParam('inStock',inStockOnly?null:'true')}/>In stock only</label>
      <label className="block"><span className="eyebrow block mb-3">Finish</span><select aria-label="Finish" value={searchParams.get('finish')||''} onChange={e=>updateParam('finish',e.target.value)} className="w-full border border-[#deded5] p-2 text-xs"><option value="">All finishes</option>{['Matte','Dewy','Satin','Glossy','Shimmer','Natural'].map(v=><option key={v}>{v}</option>)}</select></label>
    </aside></div>
  );
}

