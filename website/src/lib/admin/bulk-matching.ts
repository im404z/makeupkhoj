import 'server-only';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {catalogDB} from '@/lib/matching/catalog';
import {lock} from '@/lib/matching/engine.mjs';
export async function previewAllMatching(input:any){
 const db=await catalogDB(),store=String(input.store||'all'),kind=String(input.kind||'matchable');
 if(!['all','amazon','flipkart','myntra','nykaa'].includes(store)||!['matchable','conflict','all'].includes(kind))throw Error('Invalid review scope');
 const filter:any={status:'pending',...(kind==='matchable'?{'evidence.conflicts.0':{$exists:false}}:kind==='conflict'?{'evidence.conflicts.0':{$exists:true}}:{})};
 if(store!=='all')filter.$or=[{a:new RegExp('^'+store+':')},{b:new RegExp('^'+store+':')}];
 const pairs=await db.collection('catalog_candidates').find(filter,{projection:{a:1,b:1}}).sort({score:-1,_id:1}).limit(50001).toArray();
 if(!pairs.length)throw Error('There are no pending suggestions in this scope');if(pairs.length>50000)throw Error('More than 50,000 suggestions. Narrow the marketplace filter first.');
 await db.collection('catalog_bulk_runs').createIndex({expiresAt:1},{expireAfterSeconds:0});
 const id=randomUUID(),job={_id:id,status:'draft',ids:pairs.map((p:any)=>p._id),scope:{store,kind},count:pairs.length,processed:0,succeeded:0,failed:0,createdAt:new Date(),expiresAt:new Date(Date.now()+3600000)};
 await db.collection('catalog_bulk_runs').insertOne(job);
 const examples=pairs.slice(0,8),sources=await db.collection('catalog_sources').find({_id:{$in:examples.flatMap((p:any)=>[p.a,p.b])}},{projection:{title:1,store:1}}).toArray(),byId=new Map(sources.map((s:any)=>[s._id,s]));
 return {bulkPreview:{id,count:job.count,scope:job.scope,pairs:examples.map((p:any)=>({_id:p._id,left:byId.get(p.a),right:byId.get(p.b)}))}};
}
export async function launchAllMatching(id:string){
 const db=await catalogDB();return lock(db,async()=>{
  if(await db.collection('catalog_bulk_runs').findOne({status:{$in:['queued','running']},heartbeat:{$gte:new Date(Date.now()-180000)}}))throw Error('A bulk approval run is already active');
  const job=await db.collection('catalog_bulk_runs').findOneAndUpdate({_id:id,status:'draft',expiresAt:{$gt:new Date()}},{$set:{status:'queued',heartbeat:new Date()},$unset:{expiresAt:''}},{returnDocument:'after'});if(!job)throw Error('Preview expired or already used. Preview the scope again.');
  const website=process.cwd().endsWith('website')?process.cwd():path.join(process.cwd(),'website'),folder=path.join(website,'.admin');fs.mkdirSync(folder,{recursive:true});const log=fs.openSync(path.join(folder,'bulk-matching-'+id+'.log'),'a'),env={...process.env};for(const key of Object.keys(env))if(/ADMIN_|EARNKARO|AFFILIATE|PROXY/.test(key))delete env[key];
  try{const child=spawn(process.execPath,[path.join(website,'scripts/bulk-matching-worker.mjs'),id],{cwd:website,env,detached:true,windowsHide:true,stdio:['ignore',log,log]});child.once('error',()=>{void db.collection('catalog_bulk_runs').updateOne({_id:id},{$set:{status:'failed',error:'Worker could not start'}});});child.unref();}finally{fs.closeSync(log);}return {bulkRun:{id,status:'queued',count:job.count}};
 });
}
export async function cancelAllMatching(id:string){const db=await catalogDB();await db.collection('catalog_bulk_runs').updateOne({_id:id,status:{$in:['draft','queued','running']}},{$set:{cancelRequested:true}});return {ok:true};}
