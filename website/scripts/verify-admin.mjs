import assert from 'node:assert/strict';
process.loadEnvFile('.env.local');
const base=process.env.ADMIN_TEST_URL||'http://localhost:3000';
const send=(url,body,extra={})=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...extra},body:JSON.stringify(body)});
for(const url of ['/api/admin/stats','/api/admin/products?store=amazon','/api/admin/crawler']) {
  assert.equal((await fetch(base+url)).status,401,`Unauthenticated ${url}`);
}
assert.equal((await send('/api/admin/login',{username:'admin',password:'wrong'},{Origin:'https://example.com'})).status,403);
assert.equal((await send('/api/admin/login',{username:'admin',password:'wrong'})).status,401);
const login=await send('/api/admin/login',{username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});
assert.equal(login.status,200,'Environment login');
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));
assert.ok(login.headers.get('set-cookie').includes('SameSite=strict'));
const get=url=>fetch(base+url,{headers:{Cookie:cookie}});
const stats=await get('/api/admin/stats');assert.equal(stats.status,200);
const data=await stats.json();assert.equal(data.marketplaces.length,4);
for(const m of data.marketplaces)assert.equal(m.listing,m.enriched+m.pending);
const products=await get('/api/admin/products?store=amazon&status=pending');assert.equal(products.status,200);
const rows=await products.json();assert.ok(Array.isArray(rows.products));assert.ok(rows.products.every(p=>p.pdp_scraped!==true));
assert.equal((await get('/api/admin/crawler')).status,200);
assert.equal((await send('/api/admin/crawler',{platform:'invalid',type:'pdp',pages:1,limit:1,concurrency:1},{Cookie:cookie})).status,409);
assert.equal((await fetch(base+'/api/admin/products',{method:'PATCH',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({store:'amazon',_id:'invalid',sub_category:'Face',sub_sub_category:'Foundation'})})).status,400);
assert.equal((await send('/api/admin/logout',{}, {Cookie:cookie})).status,200);
const page=await fetch(base+'/products?page=1&marketplace=amazon');assert.equal(page.status,200);assert.ok(!(await page.text()).includes('toFixed is not a function'));
console.log('PASS: auth, origin checks, four-store count invariants, pending filter, crawler validation, category validation, logout, Amazon rating page.');
console.log(JSON.stringify(data.marketplaces));
