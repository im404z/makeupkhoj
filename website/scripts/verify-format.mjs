import assert from 'node:assert/strict';
import { formatRating } from '../src/lib/utils/format.ts';
for (const value of [4.5,'4.5','4.5 out of 5 stars']) assert.equal(formatRating(value),'4.5');
for (const value of [undefined,null,{},[],0,'N/A','',6,'12',Infinity]) assert.equal(formatRating(value),null);
console.log('PASS: numeric/text Amazon ratings and missing/invalid values.');
