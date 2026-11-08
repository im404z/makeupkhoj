import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
function load(path,dependencies,globals={}){
 const source=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(source,{exports,require:name=>{if(!(name in dependencies))throw Error('Unexpected import '+name);return dependencies[name];},URL,Buffer,process:{env:{ADMIN_SESSION_SECRET:'test-key-for-isolated-unit-verification'}},AbortSignal,...globals});return exports;
}
const format=load('../src/lib/utils/format.ts',{});
assert.equal(format.createProductSlug({id:'NYK-7883822',name:'Infinite Spray'}),'infinite-spray-7883822');
const links=load('../src/lib/affiliate-links.ts',{'@/lib/utils/format':format});
assert.equal(links.merchantUrl('https://amazon.in.evil.test/item','amazon'),'');
assert.equal(links.externalUrl('javascript:alert(1)'),'');
assert.equal(links.externalUrl('https://user:pass@example.com/'),'');
assert.ok(!links.buyPath({marketplace:'nykaa',id:'-7883822',name:'Infinite Spray',slug:'infinite/p/7883822'}).includes('/p/'));
assert.equal(new URL(links.amazonLink('https://www.amazon.in/dp/B123?tag=old-21','scentkhoj-21')).searchParams.get('tag'),'scentkhoj-21');
let settings,encryptedToken,override=null,rate=0,calls=0,requestBody,record;
const db={collection:name=>({
 createIndex:async()=>{},
 findOne:async()=>name==='affiliate_settings'?{settings,encryptedToken}:override,
 findOneAndUpdate:async()=>({count:++rate}),
 updateOne:async(filter,update)=>{if(name==='affiliate_products')override={...override,...update.$set};if(name==='affiliate_clicks')record={filter,update};return {};},
})};
const affiliate=load('../src/lib/admin/affiliates.ts',{
 'server-only':{},'node:crypto':crypto,'./data':{adminDB:async()=>db,STORES:['amazon','flipkart','myntra','nykaa']},'@/lib/affiliate-links':links,
},{fetch:async(url,options)=>{calls++;assert.equal(url,'https://ekaro-api.affiliaters.in/api/converter/public');requestBody=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer isolated-test-token');return {ok:true,json:async()=>({success:1,data:'https://ekaro.in/test-converted'})};}});
settings=JSON.parse(JSON.stringify(affiliate.defaults));settings.enabled=true;settings.stores.nykaa.mode='ekaro';settings.amazonTag='scentkhoj-21';
encryptedToken=affiliate.encryptToken('isolated-test-token');assert.ok(!encryptedToken.includes('isolated-test-token'));assert.equal((await affiliate.configuration()).token,'isolated-test-token');
const product={_id:'test-product',id:'7883822',name:'Spray',slug:'spray-7883822',marketplace:'nykaa',url:'https://www.nykaa.com/spray/p/7883822'};
assert.equal((await affiliate.destination(product)).kind,'direct');
await affiliate.convertProduct(product);assert.equal(calls,1);assert.equal(requestBody.deal,product.url);assert.equal(requestBody.convert_option,'convert_only');assert.equal((await affiliate.destination(product)).kind,'ekaro');
await affiliate.convertProduct(product);assert.equal(calls,1,'Cached conversions must not call the provider');
product.url='https://www.nykaa.com/changed/p/7883822';assert.equal((await affiliate.destination(product)).kind,'direct','Changed merchant URL invalidates conversion');
override.mode='direct';assert.equal((await affiliate.destination(product)).kind,'direct');
override.mode='custom';override.customUrl='https://affiliate.example.com/approved';assert.equal((await affiliate.destination(product)).kind,'custom');
settings.enabled=false;assert.equal((await affiliate.destination(product)).kind,'direct');settings.enabled=true;
rate=60;await assert.rejects(affiliate.convertProduct(product),/limit reached/);assert.equal(calls,1,'Rate limit prevents the external request');
await affiliate.recordClick(product,'direct');assert.equal(record.update.$inc.clicks,1);assert.equal(record.update.$set.store,'nykaa');assert.equal(record.update.$set.kind,'direct');assert.ok(!JSON.stringify(record).includes('ipAddress'));
console.log('PASS: merchant validation, clean buy paths, tag replacement, encrypted token round-trip, convert_only payload, conversion caching/invalidation, overrides, global disable, shared rate limit, aggregate click writes.');
