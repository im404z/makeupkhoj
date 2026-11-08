import assert from 'node:assert/strict';
import { balancedWindow,interleave,parseCatalogFilters,escapeRegex } from '../src/lib/utils/catalog-query.ts';
for(const counts of [[20,20,20,20],[0,1,8,3],[2,0,0,10],[0,0,0,0],[3,5,2,1]]){
  const groups=counts.map((count,store)=>Array.from({length:count},(_,i)=>`${store}:${i}`));
  const full=interleave(groups);
  for(let skip=0;skip<full.length;skip++){
    const {row,offset}=balancedWindow(counts,skip),limit=5;
    assert.deepEqual(interleave(groups.map(g=>g.slice(row,row+limit))).slice(offset,offset+limit),full.slice(skip,skip+limit));
  }
}
assert.equal(escapeRegex('L.Oreal (Paris)'), 'L\\.Oreal \\(Paris\\)');
assert.deepEqual(parseCatalogFilters({marketplace:['amazon','nykaa'],minPrice:'100',maxPrice:'500',inStock:'true'}).marketplace,['amazon','nykaa']);
assert.equal(parseCatalogFilters({minPrice:'invalid'}).minPrice,undefined);
console.log('PASS: balanced pagination with uneven/empty stores, stable windows, literal regex, and filter parsing.');
