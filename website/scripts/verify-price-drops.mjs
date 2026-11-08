import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import mongoose from 'mongoose';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
function compile(file,require=()=>{throw Error('Unexpected dependency');}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,Date});return exports;}
const helpers=compile('src/lib/utils/catalog-query.ts');
const {priceDropPipeline}=compile('src/lib/utils/price-drop-query.ts',()=>helpers);
const now=new Date('2026-11-08T12:00:00Z'),stamp=hours=>new Date(+now-hours*3600000).toISOString();
const event=(hours,old_price=200,price=100)=>({timestamp:stamp(hours),old_price,price});
const docs=[
  {_id:'recent',price:'₹100',price_history:[event(2,'₹200')]},
  {_id:'two-days',price:100,price_history:[event(26)]},
  {_id:'expired',price:100,price_history:[event(49)]},
  {_id:'first',price:100,price_history:[event(1,null)]},
  {_id:'mrp-only',price:100,mrp:500},
  {_id:'rise',price:150,price_history:[event(1)]},
  {_id:'future',price:100,price_history:[event(-1)]},
  {_id:'date-only',price:100,price_history:[{date:'2026-11-08',old_price:200,price:100}]},
  {_id:'out-of-stock',price:100,in_stock:false,price_history:[event(1)]},
  {_id:'unchanged',price:100,price_history:[event(1,100)]},
  {_id:'invalid',price:100,price_history:'unavailable'},
];
await mongoose.connect(process.env.MONGODB_URI,{dbName:process.env.MASTER_DB||'makeupkhoj'});
try{
  for(const hours of [24,48]){
    const rows=await mongoose.connection.db.aggregate([{$documents:docs},...helpers.normalizePipeline('amazon'),...priceDropPipeline(new Date(+now-hours*3600000),now)]).toArray();
    assert.deepEqual(rows.map(r=>r._id).sort(),hours===24?['recent']:['recent','two-days']);
    assert.equal(rows.find(r=>r._id==='recent').price_drop_amount,100);
    assert.equal(rows.find(r=>r._id==='recent').price_drop_percent,50);
  }
  console.log('PASS: 24/48-hour windows, string prices, missing baselines, MRP-only discounts, price rebounds, future/missing timestamps and out-of-stock exclusions. No database writes.');
  for(const store of ['amazon','flipkart','myntra','nykaa']){
    const rows=await mongoose.connection.db.collection(store+'_makeupkhoj').aggregate([...helpers.normalizePipeline(store),...priceDropPipeline(new Date(Date.now()-24*3600000)),{$count:'count'}]).toArray();
    console.log(store+': '+(rows[0]?.count||0)+' qualifying records in 24 hours');
  }
}finally{await mongoose.disconnect();}
