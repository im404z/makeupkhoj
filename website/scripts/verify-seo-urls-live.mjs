import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {load} from 'cheerio';
const origin=process.env.ADMIN_TEST_URL||'http://127.0.0.1:3001';
const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/constants/categories.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const categoryPaths=exports.CATEGORIES.flatMap(c=>['/categories/'+c.slug,...c.subcategories.map(s=>'/categories/'+c.slug+'/'+s.slug)]);
for(let i=0;i<categoryPaths.length;i+=4){await Promise.all(categoryPaths.slice(i,i+4).map(async path=>{const response=await fetch(origin+path);assert.equal(response.status,200,path);const $=load(await response.text());assert.equal(new URL($('link[rel=canonical]').attr('href')).pathname,path);assert.equal($('h1').length,1,path);assert.ok(!/noindex/.test($('meta[name=robots]').attr('content')||''),path);}));}
for(const [path,target]of [
 ['/products?page=1&sort=popular','/products'],
 ['/products?marketplace=nykaa&marketplace=amazon&marketplace=amazon&page=02','/products?marketplace=amazon&marketplace=nykaa&page=2'],
 ['/products?brand=Lakm%C3%A9','/products?brand=lakme'],
 ['/products?utm_source=test','/products'],
 ['/new-arrivals?sort=newest','/new-arrivals'],
 ['/deals?sort=discount_desc','/deals'],
]){const r=await fetch(origin+path,{redirect:'manual'});assert.equal(r.status,308,path);assert.equal(r.headers.get('location'),target,path);}
for(const path of ['/categories/not-a-real-category','/categories/lip-makeup/not-a-real-subcategory','/products?page=9999999','/products?minPrice=500&maxPrice=100'])assert.equal((await fetch(origin+path)).status,404,path);
for(const path of ['/products?marketplace=amazon','/categories/lip-makeup/lipstick?marketplace=nykaa','/search?q=lipstick']){const r=await fetch(origin+path);assert.equal(r.status,200);const $=load(await r.text());assert.match($('meta[name=robots]').attr('content'),/noindex, follow/);const canonical=new URL($('link[rel=canonical]').attr('href'));assert.equal(canonical.pathname+canonical.search,path);}
const paged=load(await (await fetch(origin+'/products?page=2')).text());assert.ok(!/noindex/.test(paged('meta[name=robots]').attr('content')||''));assert.equal(new URL(paged('link[rel=canonical]').attr('href')).search,'?page=2');
const filtered=load(await (await fetch(origin+'/products?marketplace=amazon')).text());const next=filtered('a[aria-label="Next page"]').attr('href');assert.equal(next,'/products?marketplace=amazon&page=2');
const sitemap=await (await fetch(origin+'/sitemap.xml')).text();for(const path of categoryPaths)assert.ok(sitemap.includes(path),path+' in sitemap');assert.ok(!sitemap.includes('sort='));assert.ok(!sitemap.includes('/buy/'));
console.log('PASS: '+categoryPaths.length+' category/subcategory URLs; canonical redirects; invalid routes/ranges/pages return 404; filter/search noindex and canonicals; crawlable filtered pagination; category sitemap coverage.');
