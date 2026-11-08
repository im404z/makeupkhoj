import 'server-only';
import path from 'node:path';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {catalogDB} from '@/lib/matching/catalog';
import {prepare,lock,approve,bulkDecide,splitSource,liveMembers,root,rootKeyStages} from '@/lib/matching/engine.mjs';
import {merchantUrl} from '@/lib/affiliate-links';
import {compareIdentity} from '@/lib/matching/title-matcher.mjs';
import {previewAllMatching,launchAllMatching,cancelAllMatching} from './bulk-matching';
export async function matchingState(status='pending',page=1,kind='all',store='all'){
 const db=await catalogDB();
 const stages=await rootKeyStages(db);
 const candidateFilter:any={status,...(kind==='matchable'?{'evidence.conflicts.0':{$exists:false}}:kind==='conflict'?{'evidence.conflicts.0':{$exists:true}}:{})};
 if(['amazon','flipkart','myntra','nykaa'].includes(store))candidateFilter.$or=[{a:new RegExp('^'+store+':')},{b:new RegExp('^'+store+':')}];
 const jobs=db.collection('catalog_runs');
 // A killed process must not permanently block new runs.
 await jobs.updateMany({status:{$in:['queued','running']},heartbeat:{$lt:new Date(Date.now()-180000)}},{$set:{status:'interrupted',error:'Heartbeat expired. Retry to resume safely.'}});
 await db.collection('catalog_bulk_runs').updateMany({status:{$in:['queued','running']},heartbeat:{$lt:new Date(Date.now()-180000)}},{$set:{status:'interrupted',error:'Worker heartbeat expired. Completed approvals are retained.'}});
 const [counts,candidates,total,run,settings,sourceCount,pending,suspended]=await Promise.all([
  db.collection('catalog_sources').aggregate([...stages,{$group:{_id:'$rootSku',stores:{$addToSet:'$store'}}},{$group:{_id:null,skus:{$sum:1},multi:{$sum:{$cond:[{$gt:[{$size:'$stores'},1]},1,0]}}}}]).toArray(),
  db.collection('catalog_candidates').find(candidateFilter).sort({score:-1,_id:1}).skip((page-1)*12).limit(12).toArray(),
  db.collection('catalog_candidates').countDocuments(candidateFilter),jobs.find().sort({createdAt:-1}).limit(1).next(),
  db.collection('catalog_control').findOne({_id:'settings'}),db.collection('catalog_sources').countDocuments(),
  db.collection('catalog_candidates').countDocuments({status:'pending'}),db.collection('catalog_sources').countDocuments({suspended:true}),
 ]);
 const keys=candidates.flatMap((p:any)=>[p.a,p.b]);const sources=await db.collection('catalog_sources').find({_id:{$in:keys}}).toArray();
 const keyed=new Map(await Promise.all(sources.map(async(s:any)=>{const live=await db.collection(s.store+'_makeupkhoj').findOne({_id:s.sourceId},{projection:{url:1,pdp_scraped:1}});return [s._id,{...s,url:merchantUrl(live?.url,s.store),pdp_scraped:live?.pdp_scraped===true}];})));
 const bulkRun=await db.collection('catalog_bulk_runs').find({status:{$ne:'draft'}},{projection:{ids:0}}).sort({createdAt:-1}).limit(1).next();
 return {counts:{sources:sourceCount,skus:counts[0]?.skus||0,multi:counts[0]?.multi||0,single:(counts[0]?.skus||0)-(counts[0]?.multi||0),pending,suspended},candidates:candidates.map((p:any)=>({...p,left:keyed.get(p.a),right:keyed.get(p.b)})),total,page,run,bulkRun,enabled:settings?.enabled===true};
}
export async function matchingAction(input:any){
 const db=await catalogDB();await prepare(db);
 if(input.action==='preview_all')return previewAllMatching(input);
 if(input.action==='start_all')return launchAllMatching(String(input.id));
 if(input.action==='cancel_all')return cancelAllMatching(String(input.id));
 if(input.action==='bulk_approve'||input.action==='bulk_reject')return bulkDecide(db,input.action==='bulk_approve'?'approve':'reject',input.ids);
 if(input.action==='launch')return lock(db,async()=>{
  const active=await db.collection('catalog_runs').findOne({status:{$in:['queued','running']},heartbeat:{$gte:new Date(Date.now()-180000)}});if(active)throw Error('A matching run is already active');
  const store=String(input.store||'all'),limit=Number(input.limit||0);if(!['all','amazon','flipkart','myntra','nykaa'].includes(store)||!Number.isSafeInteger(limit)||limit<0||limit>1000000)throw Error('Invalid scan scope');
  const id=randomUUID(),job={_id:id,status:'queued',store,limit,dryRun:input.dryRun===true,createdAt:new Date(),heartbeat:new Date(),synced:0,scanned:0,suggestions:0};
  await db.collection('catalog_runs').insertOne(job);
  const website=process.cwd().endsWith('website')?process.cwd():path.join(process.cwd(),'website'),folder=path.join(website,'.admin');fs.mkdirSync(folder,{recursive:true});
  const log=fs.openSync(path.join(folder,'matching-'+id+'.log'),'a');
  const env={...process.env};for(const key of Object.keys(env))if(/ADMIN_|EARNKARO|AFFILIATE|PROXY/.test(key))delete env[key];
  try{const child=spawn(process.execPath,[path.join(website,'scripts/catalog-worker.mjs'),id],{cwd:website,env,windowsHide:true,detached:true,stdio:['ignore',log,log]});
   child.once('error',()=>{void db.collection('catalog_runs').updateOne({_id:id},{$set:{status:'failed',error:'Could not start worker'}});});child.unref();
  }finally{fs.closeSync(log);}return {run:job};
 });
 if(input.action==='cancel'){await db.collection('catalog_runs').updateOne({_id:String(input.id),status:{$in:['queued','running']}},{$set:{cancelRequested:true}});return {ok:true};}
 if(input.action==='title'){const title=String(input.title||'').trim();if(!title||title.length>300)throw Error('Title must be 1–300 characters');const node=await root(db,String(input.sku));if(!node)throw Error('SKU missing');await db.collection('catalog_nodes').updateOne({_id:node._id},{$set:{displayTitle:title},$push:{history:{action:'title',title,at:new Date(),actor:'admin'}}});return {ok:true};}
 if(input.action==='publish'){await db.collection('catalog_control').updateOne({_id:'settings'},{$set:{enabled:input.enabled===true,updatedAt:new Date()}},{upsert:true});return {ok:true};}
 if(input.action==='approve')return {sku:await approve(db,String(input.id))};
 if(input.action==='reject'){await db.collection('catalog_candidates').updateOne({_id:String(input.id),status:'pending'},{$set:{status:'rejected',decidedAt:new Date()},$push:{history:{action:'reject',at:new Date(),actor:'admin'}}});return {ok:true};}
 if(input.action==='reopen'){await db.collection('catalog_candidates').updateOne({_id:String(input.id),status:'rejected'},{$set:{status:'pending'}});return {ok:true};}
 if(input.action==='split')return {sku:await splitSource(db,String(input.sourceKey))};
 if(input.action==='verify')return lock(db,async()=>{
  const source=await db.collection('catalog_sources').findOne({_id:String(input.sourceKey)});if(!source)throw Error('Source missing');const node=await root(db,source.siteSku);const rows=await liveMembers(db,node._id);
  for(const x of rows)for(const y of rows){if(x._id!==y._id&&compareIdentity(x.currentIdentity,y.currentIdentity).conflicts.length)throw Error('Conflicting variants. Split the affected listing instead.');}
  if(rows.some(r=>r.changed))throw Error('Run an incremental scan before reconfirming identity');
  await db.collection('catalog_sources').updateOne({_id:source._id},{$set:{suspended:false},$push:{history:{action:'verify',at:new Date(),actor:'admin'}}});return {ok:true};
 });
 throw Error('Unknown catalogue action');
}
