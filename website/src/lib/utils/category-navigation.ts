import 'server-only';
import {cache} from 'react';
import {connectDB} from '@/lib/mongodb';
import {getModelByMarketplace} from '@/lib/models/Product';
import {CATEGORY_LEAVES,categoryLeafMatch} from '@/lib/constants/category-leaves';
import {CATALOG_STORES} from './catalog-query';
import {cachedCatalogRead} from '@/lib/catalog-cache';

export const categoryNavigation = cache((category:string) => cachedCatalogRead('category-navigation', category, async () => {
  await connectDB();
  const results = await Promise.all(CATALOG_STORES.map(store =>
    getModelByMarketplace(store)!.aggregate([
      {$match:categoryLeafMatch(category)},
      {$group:{_id:{$toLower:'$sub_sub_category'},count:{$sum:1}}},
    ])
  ));
  const counts = new Map<string,number>();
  for(const rows of results) for(const row of rows) counts.set(row._id,(counts.get(row._id)||0)+row.count);
  const items=(CATEGORY_LEAVES[category]||[]).map(leaf=>({
    slug:leaf.slug,name:leaf.name,count:leaf.labels.reduce((sum,label)=>sum+(counts.get(label.toLowerCase())||0),0),
  })).filter(leaf=>leaf.count>0);
  return {items,total:items.reduce((sum,item)=>sum+item.count,0)};
}));
