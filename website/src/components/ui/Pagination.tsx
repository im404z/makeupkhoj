'use client';

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

export default function Pagination({ currentPage, totalPages }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`${pathname}?${params.toString()}`);
  };

  const pages = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-1.5 mt-10">
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        className="p-2 rounded-xl border border-pink-200 bg-white text-neutral-600 hover:bg-pink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        aria-label="Previous Page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {start > 1 && (
        <>
          <button
            onClick={() => goToPage(1)}
            className="w-9 h-9 text-xs rounded-xl border border-pink-200 bg-white text-neutral-700 hover:bg-pink-50"
          >
            1
          </button>
          {start > 2 && <span className="text-neutral-400 text-xs px-1">...</span>}
        </>
      )}

      {pages.map((p) => {
        const active = p === currentPage;
        return (
          <button
            key={p}
            onClick={() => goToPage(p)}
            className={`w-9 h-9 text-xs font-semibold rounded-xl transition-all ${
              active
                ? 'bg-pink-600 text-white shadow-sm'
                : 'border border-pink-200 bg-white text-neutral-700 hover:bg-pink-50'
            }`}
          >
            {p}
          </button>
        );
      })}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span className="text-neutral-400 text-xs px-1">...</span>}
          <button
            onClick={() => goToPage(totalPages)}
            className="w-9 h-9 text-xs rounded-xl border border-pink-200 bg-white text-neutral-700 hover:bg-pink-50"
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="p-2 rounded-xl border border-pink-200 bg-white text-neutral-600 hover:bg-pink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        aria-label="Next Page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

