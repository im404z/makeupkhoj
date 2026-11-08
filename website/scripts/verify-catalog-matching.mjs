import assert from 'node:assert/strict';
import {MongoClient,ObjectId} from 'mongodb';
import {randomBytes} from 'node:crypto';
import {prepare,syncBatch,approve,bulkDecide,runBulkJob,splitSource,root,members,queryGroups,scanCandidates} from '../src/lib/matching/engine.mjs';
const name='makeupkhoj_catalog_test_'+randomBytes(6).toString('hex');
const client=await new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000}).connect(),db=client.db(name);
try{
 await prepare(db);
 const A={_id:new ObjectId(),title:'Testbrand Velvet Liquid Blush Rose 10ml',brand:'Testbrand',shade:'Rose',price:200,in_stock:true},B={...A,_id:new ObjectId(),price:180,in_stock:false},C={...A,_id:new ObjectId(),price:500,shade:'Coral'};
 for(const [store,doc] of [['amazon',A],['nykaa',B],['myntra',C]]){await db.collection(store+'_makeupkhoj').insertOne(doc);await syncBatch(db,store,[doc]);}
 const a=await db.collection('catalog_sources').findOne({store:'amazon'}),b=await db.collection('catalog_sources').findOne({store:'nykaa'}),c=await db.collection('catalog_sources').findOne({store:'myntra'});
 await syncBatch(db,'amazon',[A]);assert.equal((await db.collection('catalog_sources').findOne({_id:a._id})).siteSku,a.siteSku);
 await scanCandidates(db);assert((await db.collection('catalog_candidates').countDocuments())>0);
 const pair=await db.collection('catalog_candidates').findOne({$or:[{a:a._id,b:b._id},{a:b._id,b:a._id}]});assert(pair);
 const merged=await approve(db,pair._id);assert.equal((await root(db,b.siteSku))._id,merged);assert.equal((await members(db,merged)).length,2);
 assert.equal((await queryGroups(db,{view:'multi'})).total,1);assert.equal((await queryGroups(db,{view:'single'})).total,1);
 // Cross-offer filters cannot combine Amazon's stock with Nykaa's lower price.
 assert.equal((await queryGroups(db,{marketplace:['nykaa'],inStock:true})).total,0);
 assert.equal((await queryGroups(db,{maxPrice:190,inStock:true})).total,0);
 assert.equal((await queryGroups(db,{marketplace:['amazon'],maxPrice:210,inStock:true})).total,1);
 const conflict={_id:'conflict',a:a._id,b:c._id,status:'pending'};await db.collection('catalog_candidates').insertOne(conflict);await assert.rejects(()=>approve(db,'conflict'),/Conflicting variants/);
 await db.collection('nykaa_makeupkhoj').updateOne({_id:B._id},{$set:{shade:'Coral'}});
 await syncBatch(db,'nykaa',[{...B,shade:'Coral'}]);assert.equal((await db.collection('catalog_sources').findOne({_id:b._id})).suspended,true);
 const newSku=await splitSource(db,b._id);assert.notEqual(newSku,merged);assert.equal((await queryGroups(db,{view:'multi'})).total,0);
 assert.equal((await root(db,a.siteSku))._id,merged);assert.equal((await db.collection('catalog_sources').findOne({_id:b._id})).history.at(-1).action,'split');
 const D={...A,_id:new ObjectId(),price:210};await db.collection('flipkart_makeupkhoj').insertOne(D);await syncBatch(db,'flipkart',[D]);const d=await db.collection('catalog_sources').findOne({store:'flipkart'});
 await db.collection('catalog_candidates').insertOne({_id:'bulk-valid',a:a._id,b:d._id,status:'pending'});
 const bulk=await bulkDecide(db,'approve',['bulk-valid','conflict','missing']);assert.equal(bulk.succeeded,1);assert.equal(bulk.failed,2);assert.equal((await queryGroups(db,{view:'multi'})).total,1);
 assert.equal((await bulkDecide(db,'approve',['bulk-valid'])).succeeded,1,'Repeated approval is idempotent');
 await db.collection('catalog_candidates').insertOne({_id:'bulk-reject',a:b._id,b:c._id,status:'pending'});assert.equal((await bulkDecide(db,'reject',['bulk-reject'])).succeeded,1);
 assert.equal((await db.collection('catalog_sources').distinct('store')).length,4);await assert.rejects(()=>bulkDecide(db,'approve',Array(51).fill('x')),/between 1 and 50/);
 await db.collection('catalog_bulk_runs').insertOne({_id:'worker-test',status:'queued',ids:['bulk-valid','missing']});const job=await runBulkJob(db,'worker-test');assert.equal(job.status,'completed');assert.equal(job.succeeded,1);assert.equal(job.failed,1);assert.equal(job.processed,2);assert.equal(await runBulkJob(db,'worker-test'),null);
 await db.collection('catalog_bulk_runs').insertOne({_id:'cancel-test',status:'queued',ids:['bulk-valid'],cancelRequested:true});const cancelled=await runBulkJob(db,'cancel-test');assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.processed,0);
 console.log('Catalogue integration: four stores, stable SKUs, approved merge, conflicts, same-offer filters, held PDP changes, split, bulk approval/rejection and idempotency passed.');
}finally{if(!/^makeupkhoj_catalog_test_[a-f0-9]{12}$/.test(db.databaseName))throw Error('Unsafe test cleanup target');await db.dropDatabase();await client.close();}
