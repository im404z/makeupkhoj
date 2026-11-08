import fs from 'node:fs';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import sharp from 'sharp';
const origin=process.env.ADMIN_TEST_URL||'http://localhost:3000';
const response=await fetch(origin);assert.equal(response.status,200);
const $=load(await response.text());
const categories=$('.category-photo-card');assert.equal(categories.length,8);
for(const node of categories.toArray()){
  const src=$(node).find('img').attr('src');assert.ok(src);assert.ok($(node).find('img').attr('alt'));
  const url=new URL(src,origin),file=url.searchParams.get('url')||url.pathname;
  assert.ok(fs.existsSync('public'+file));const metadata=await sharp('public'+file).metadata();assert.ok(metadata.width>=600&&metadata.height>=600);
}
const brands=$('.brand-logo-card');assert.equal(brands.length,20);
const sources=JSON.parse(fs.readFileSync('public/assets/brands/sources.json'));
assert.equal(sources.filter(s=>s.status==='downloaded').length,17);
assert.equal(brands.find('img').length,17);
const hrefs=[...new Set(brands.toArray().map(node=>$(node).attr('href')))];
for(let i=0;i<hrefs.length;i+=5){await Promise.all(hrefs.slice(i,i+5).map(async href=>{const r=await fetch(new URL(href,origin));assert.equal(r.status,200,'Brand target '+href);}));}
console.log('PASS: eight local high-resolution category photos, 17 sourced logo images, 20 valid brand links.');
