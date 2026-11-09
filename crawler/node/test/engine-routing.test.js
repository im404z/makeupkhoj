import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {targets,root,stores,resolveEngine} from '../src/config.js';
import {listing,nextUrl} from '../src/adapters.js';

test('auto uses a browser only for Amazon listings; PDP defaults remain browsers',()=>{
  for(const store of stores){assert.equal(resolveEngine(store,'listing',{engine:'auto'}),store==='amazon'?'browser':'http');assert.equal(resolveEngine(store,'pdp',{engine:'auto'}),'browser');}
  assert.equal(resolveEngine('myntra','listing',{engine:'auto',browserStores:['myntra']}),'browser');
});
test('category targets exactly match the four requested marketplace files',()=>{
  for(const store of stores)assert.deepEqual(targets(store),JSON.parse(fs.readFileSync(path.join(root,'crawler',store,store+'_makeup_urls.json'),'utf8')));
});
test('Myntra HTTP page two parses its own embedded response rather than dropping all JSON',()=>{
  const html='<script>window.__myx={"searchData":{"results":{"products":[{"productId":2,"product":"Lipstick","price":100,"landingPageUrl":"/2/buy"}]}}};</script>';
  const rows=listing('myntra',html,'https://www.myntra.com/makeup?p=2',{page:2,http:true});
  assert.equal(rows.length,1);assert.equal(rows[0].id,'2');assert.equal(rows[0].price,100);assert.ok(!('http' in rows[0]));
});
test('Nykaa accessible price labels match Python listing fallbacks',()=>{
  const html='<div class="productWrapper"><a href="/product/p/123"><img alt="Lipstick"></a><span class="css-1yjfidh">Regular price ₹1,000 Discounted price ₹700</span></div>';
  const [row]=listing('nykaa',html,'https://www.nykaa.com');assert.equal(row.price,700);assert.equal(row.mrp,1000);
});
test('Flipkart next-page links survive CSS class changes',()=>{
  assert.equal(nextUrl('flipkart','<a class="jgg0SZ" href="/makeup/pr?sid=abc&page=2">Next</a>','https://www.flipkart.com/makeup/pr?sid=abc'),'https://www.flipkart.com/makeup/pr?sid=abc&page=2');
});
