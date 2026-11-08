import assert from 'node:assert/strict';
import { load } from 'cheerio';
process.loadEnvFile('.env.local');
const origin=process.env.ADMIN_TEST_URL||'http://localhost:3000';
async function catalog(query=''){const r=await fetch(origin+'/api/products?'+query);assert.equal(r.status,200);return r.json();}
const [first,second,selected,budget,priced,rated]=await Promise.all([
  catalog('limit=24'),catalog('page=2&limit=24'),catalog('marketplace=amazon&marketplace=nykaa&limit=12'),
  catalog('maxPrice=500&limit=12'),catalog('sort=price_asc&minPrice=100&maxPrice=800&limit=24'),catalog('rating=4&limit=12'),
]);
assert.equal(new Set(first.products.map(p=>p.marketplace)).size,4,'Default page includes each marketplace');
assert.ok(selected.products.every(p=>['amazon','nykaa'].includes(p.marketplace)));
const keys=new Set(first.products.map(p=>p.marketplace+':'+p._id));assert.ok(second.products.every(p=>!keys.has(p.marketplace+':'+p._id)),'No repeated records across pages');
assert.ok(budget.products.every(p=>p.price<=500));
assert.ok(priced.products.every(p=>p.price>=100&&p.price<=800));
assert.ok(priced.products.every((p,i,a)=>!i||p.price>=a[i-1].price),'Global numeric price sort');
assert.ok(rated.products.every(p=>p.rating>=4&&p.rating<=5));
const brand=first.products.find(p=>p.brand)?.brand;
const branded=await catalog('brand='+encodeURIComponent(brand)+'&limit=8');
const brandKey=v=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
assert.ok(branded.products.every(p=>brandKey(p.brand)===brandKey(brand)));
const literal=await catalog('q='+encodeURIComponent('.*UNMATCHED_TEST_LITERAL.*'));assert.equal(literal.total,0,'Search treats regex punctuation literally');
const categorySearch=await catalog('category=Face&q=UNMATCHED_TEST_LITERAL');assert.equal(categorySearch.total,0,'Category and search combine with AND');
const page=await fetch(origin+'/products?marketplace=amazon');const dom=load(await page.text());assert.match(dom('meta[name="robots"]').attr('content')||'',/noindex/);
const login=await fetch(origin+'/api/admin/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD})});assert.equal(login.status,200);
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const response=await fetch(origin+'/api/admin/seo',{method:'POST',headers:{Origin:origin,Cookie:cookie}});const auditData=await response.json();assert.equal(response.status,200,auditData.error);
const {report}=auditData;
console.log('PASS: four-store mixing, no page overlap, marketplace/price/rating/brand filters, literal search, AND filters, filtered-page noindex.');
console.log(JSON.stringify(report.summary));
for(const page of report.pages)for(const check of page.checks)if(check.status!=='pass')console.log(JSON.stringify({page:page.path,...check}));
assert.equal(report.summary.errors,0,'Server-rendered SEO audit must have no errors');
