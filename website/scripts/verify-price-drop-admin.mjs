import assert from 'node:assert/strict';
import {load} from 'cheerio';
process.loadEnvFile('.env.local');
const base=process.env.ADMIN_TEST_URL||'http://127.0.0.1:7858';
const endpoint='/api/admin/price-drops';
const post=(url,body,cookie='',origin=base)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(body)});
assert.equal((await fetch(base+endpoint)).status,401);
assert.equal((await post(endpoint,{})).status,401);
const login=await post('/api/admin/login',{username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD});assert.equal(login.status,200);
const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const original=await (await fetch(base+endpoint,{headers:{Cookie:cookie}})).json();
assert.equal((await post(endpoint,original.settings,cookie,'https://invalid.example')).status,403);
assert.equal((await post(endpoint,{...original.settings,windowHours:0},cookie)).status,400);
async function save(settings){const r=await post(endpoint,settings,cookie);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);}
try{
  const settings={enabled:true,windowHours:48,maxProducts:7,perPage:5};await save(settings);
  for(const [path,count]of [['/price-drops',5],['/price-drops?page=2',2]]){
    const r=await fetch(base+path,{headers:{'User-Agent':'Googlebot'}});assert.equal(r.status,200);const $=load(await r.text());
    assert.equal($('.product-card').length,count);assert.match($('body').text(),/last 48 hours/);
    $('.product-card').each((_,el)=>assert.match($(el).text(),/Down ₹/));
    console.log('PASS '+path+' product cap and recorded reduction labels');
  }
  assert.equal((await fetch(base+'/price-drops?page=3',{headers:{'User-Agent':'Googlebot'}})).status,404);
  await save({...settings,enabled:false});
  const $=load(await (await fetch(base+'/price-drops')).text());assert.equal($('.product-card').length,0);assert.match($('body').text(),/currently paused/);
  console.log('PASS authentication, origin validation, settings bounds, 48-hour window, pagination cap and disabled state');
}finally{await save(original.settings);console.log('Restored original price-drop settings');}
