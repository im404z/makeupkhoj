import React from 'react';
import ProductCard from './ProductCard';
import { PackageSearch } from 'lucide-react';
import type { Product } from '@/types/product';

interface ProductGridProps {
  products: Product[];
  emptyMessage?: string;
  catalog?: boolean;
}

export default function ProductGrid({
  products,
  emptyMessage = 'No makeup products found matching your criteria.',
  catalog = false,
}: ProductGridProps) {
  if (!products || products.length === 0) {
    return (
      <div className="py-16 text-center bg-white rounded-3xl border border-pink-100 p-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-pink-50 flex items-center justify-center text-2xl">
          <PackageSearch size={26} strokeWidth={1.3} />
        </div>
        <h3 className="text-base font-semibold text-neutral-800 mb-1">No products found</h3>
        <p className="text-xs text-neutral-500 max-w-sm mx-auto">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`product-grid ${catalog ? 'product-grid--catalog' : ''}`}>
      {products.map((product) => (
        <ProductCard key={`${product.marketplace}:${product._id || product.id}`} product={product} />
      ))}
    </div>
  );
}

