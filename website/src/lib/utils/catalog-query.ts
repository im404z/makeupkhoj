export const CATALOG_PAGE_SIZE = 25;
export const CATALOG_STORES = ['nykaa', 'amazon', 'flipkart', 'myntra'] as const;
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function numericExpression(input: unknown) {
  return {
    $convert: {
      input: {
        $let: {
          vars: {
            value: {
              $regexFind: {
                input: { $replaceAll: { input: { $convert: { input, to: 'string', onError: '', onNull: '' } }, find: ',', replacement: '' } }, regex: '[0-9]+(?:\\.[0-9]+)?',
              }
            }
          }, in: '$$value.match'
        }
      }, to: 'double', onError: null, onNull: null
    }
  };
}

export const catalogRatingFields = {
  rating: numericExpression({ $ifNull: ['$rating', '$averageRating'] }),
  rating_count: numericExpression({ $ifNull: ['$rating_count', { $ifNull: ['$ratingsCount', '$reviews_count'] }] }),
};

export function normalizePipeline(store: string, ratingNormalized = false) {
  return [{
    $set: {
      marketplace: store, marketplace_name: store === 'nykaa' ? 'Nykaa' : store[0].toUpperCase() + store.slice(1),
      id: { $convert: { input: { $ifNull: ['$id', { $ifNull: ['$asin', '$_id'] }] }, to: 'string', onError: '', onNull: '' } },
      name: { $ifNull: ['$name', { $ifNull: ['$title', 'Makeup'] }] },
      price: numericExpression({ $ifNull: ['$price', '$currentPrice'] }), mrp: numericExpression('$mrp'),
      ...(ratingNormalized ? {} : catalogRatingFields),
      discount_percentage: numericExpression('$discount_percentage'),
    }
  }, {
    $set: {
      discount_percentage: {
        $cond: [{ $gt: ['$discount_percentage', 0] }, '$discount_percentage', {
          $cond: [
            { $and: [{ $gt: ['$mrp', 0] }, { $gt: ['$price', 0] }, { $gt: ['$mrp', '$price'] }] },
            { $round: [{ $multiply: [{ $divide: [{ $subtract: ['$mrp', '$price'] }, '$mrp'] }, 100] }, 0] }, 0,
          ]
        }]
      },
    }
  }];
}

// Number of completed round-robin rows before a global offset. This lets each
// collection skip directly to the requested window instead of refetching page 1.
export function balancedWindow(counts: number[], skip: number) {
  let low = 0, high = Math.max(0, ...counts);
  const before = (row: number) => counts.reduce((n, count) => n + Math.min(count, row), 0);
  while (low < high) { const middle = Math.ceil((low + high) / 2); if (before(middle) <= skip) low = middle; else high = middle - 1; }
  return { row: low, offset: skip - before(low) };
}
export function interleave<T>(groups: T[][]): T[] {
  const result: T[] = [];
  for (let row = 0; row < Math.max(0, ...groups.map(g => g.length)); row++) for (const group of groups) if (row < group.length) result.push(group[row]);
  return result;
}

export function parseCatalogFilters(sp: Record<string, string | string[] | undefined>) {
  const value = (key: string) => typeof sp[key] === 'string' ? sp[key] as string : undefined;
  const numeric = (key: string) => { const v = value(key); return v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined; };
  return {
    page: Math.max(1, Math.floor(numeric('page') || 1)),
    brand: sp.brand, marketplace: sp.marketplace,
    minPrice: numeric('minPrice'), maxPrice: numeric('maxPrice'), minDiscount: numeric('minDiscount'), rating: numeric('rating'),
    inStockOnly: value('inStock') === 'true', hasImageOnly: value('hasImage') === 'true' || value('hasImageOnly') === 'true', finish: value('finish'), coverage: value('coverage'), skinType: value('skinType'),
    search: value('q') || value('search'), category: value('category'), sub_category: value('sub_category'),
  };
}
