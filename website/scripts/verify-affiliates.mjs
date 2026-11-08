import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');
const base=process.env.ADMIN_TEST_URL||'http://127.0.0.1:3001';
const legacy=await fetch(base+'/products/makeup-revolution-infinite-fixing-spray/p/7883822',{redirect:'manual'});
assert.equal(legacy.status,308);const canonical=legacy.headers.get('location');assert.ok(canonical&&!canonical.includes('/p/'));
const page=await fetch(new URL(canonical,base));assert.equal(page.status,200);assert.ok((await page.text()).includes('/buy/nykaa/'));
assert.equal((await fetch(base+'/api/admin/affiliates')).status,401);
const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});
assert.equal(login.status,200);const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const get=async path=>{const r=await fetch(base+path,{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();};
const post=async body=>{const r=await fetch(base+'/api/admin/affiliates',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,200,d.error);return d;};
assert.equal((await fetch(base+'/api/admin/affiliates',{method:'POST',headers:{Cookie:cookie,Origin:'https://example.com','Content-Type':'application/json'},body:'{}'})).status,403);
const initial=await get('/api/admin/affiliates');assert.equal(initial.token,undefined);assert.equal(initial.encryptedToken,undefined);
const settings={...initial.settings,enabled:true,tracking:true,amazonTag:'scentkhoj-21'};settings.stores.amazon={enabled:true,mode:'amazon'};await post({action:'settings',settings});
const products=await get('/api/admin/products?store=amazon');const p=products.products[0];assert.ok(p);
const detailPath='/api/admin/affiliates?store=amazon&id='+p._id;const original=await get(detailPath);
try{
 await post({action:'product',store:'amazon',id:p._id,mode:'inherit'});
 let detail=await get(detailPath);assert.equal(new URL(detail.resolved.url).searchParams.get('tag'),'scentkhoj-21');assert.equal(detail.resolved.kind,'amazon');
 const before=await get('/api/admin/affiliates');const head=await fetch(base+detail.buyUrl,{method:'HEAD',redirect:'manual'});assert.equal(head.status,302);assert.equal(new URL(head.headers.get('location')).searchParams.get('tag'),'scentkhoj-21');assert.match(head.headers.get('x-robots-tag'),/noindex/);assert.match(head.headers.get('cache-control'),/no-store/);const after=await get('/api/admin/affiliates');assert.deepEqual(after.totals,before.totals,'HEAD must not record clicks');
 await post({action:'product',store:'amazon',id:p._id,mode:'direct'});detail=await get(detailPath);assert.equal(detail.resolved.kind,'direct');
 settings.enabled=false;await post({action:'settings',settings});detail=await get(detailPath);assert.equal(detail.resolved.kind,'direct');
 assert.equal((await fetch(base+'/buy/notastore/example',{redirect:'manual'})).status,404);
 const bad=await fetch(base+'/api/admin/affiliates',{method:'POST',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'product',store:'amazon',id:p._id,mode:'custom',customUrl:'javascript:alert(1)'})});assert.equal(bad.status,400);
}finally{await post({action:'product',store:'amazon',id:p._id,mode:original.override.mode,customUrl:original.override.customUrl});settings.enabled=true;await post({action:'settings',settings});}
console.log('PASS: legacy Nykaa redirect, canonical render, buy links, auth and origin checks, Amazon tag, product/global disable, HEAD without clicks, unsafe URL rejection.');
console.log('Amazon links enabled with scentkhoj-21. No external conversion was made.');
