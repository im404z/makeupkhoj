import {MongoClient} from 'mongodb';
import {prepare,syncBatch,scanCandidates,lock} from '../src/lib/matching/engine.mjs';
import {STORES} from '../src/lib/matching/title-matcher.mjs';
const id=process.argv[2],client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000,maxPoolSize:5});
let db;
try{
 await client.connect();db=client.db(process.env.MASTER_DB||'makeupkhoj');if(db.databaseName!=='makeupkhoj')throw Error('Unexpected database');
 const jobs=db.collection('catalog_runs'),job=await jobs.findOne({_id:id});if(!job||job.status!=='queued')throw Error('No queued job');
 await jobs.updateOne({_id:id},{$set:{status:'running',pid:process.pid,startedAt:new Date(),heartbeat:new Date()}});
 const cancelled=async()=>Boolean((await jobs.findOne({_id:id}))?.cancelRequested);
 const progress=async fields=>{await jobs.updateOne({_id:id},{$set:{...fields,heartbeat:new Date()}});};
 await prepare(db);let synced=0;
 for(const store of STORES.filter(s=>job.store==='all'||job.store===s)){
  if(await cancelled())break;
  const storeStarted=new Date();
  let cursor=db.collection(store+'_makeupkhoj').find({}).sort({_id:1});if(job.limit)cursor=cursor.limit(job.limit);
  let batch=[];
  for await(const doc of cursor){batch.push(doc);if(batch.length===1000){
   if(await cancelled())break;
   await lock(db,()=>syncBatch(db,store,batch,{dryRun:job.dryRun}));synced+=batch.length;batch=[];await progress({phase:job.dryRun?'audit':'sync',currentStore:store,synced});
  }}
  if(batch.length&&!await cancelled()){await lock(db,()=>syncBatch(db,store,batch,{dryRun:job.dryRun}));synced+=batch.length;}
  if(!job.limit&&!job.dryRun&&!await cancelled())await db.collection('catalog_sources').updateMany({store,syncedAt:{$lt:storeStarted}},{$set:{missing:true}});
  await progress({synced,phase:'sync',currentStore:store});
 }
 if(!job.dryRun&&!await cancelled()){
  await progress({phase:'matching'});
  await scanCandidates(db,{store:job.store,limit:job.limit,onProgress:progress,cancelled});
 }
 await progress({status:await cancelled()?'cancelled':'completed',phase:'finished',finishedAt:new Date()});
 console.log('Catalogue run finished:',id);
}catch(e){
 console.error('Catalogue worker failed:',e.message?.replace(/mongodb(?:\+srv)?:\/\/\S+/g,'[database]'));
 if(db)await db.collection('catalog_runs').updateOne({_id:id},{$set:{status:'failed',error:'Worker stopped. Retry the idempotent scan; see server log for diagnostics.',finishedAt:new Date()}}).catch(()=>{});
 process.exitCode=1;
}finally{await client.close();}
