import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function atomicJson(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+process.pid+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(data,null,2));fs.renameSync(temp,file);}
export function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
export function alive(pid){if(!Number.isSafeInteger(Number(pid))||Number(pid)<1)return false;try{process.kill(Number(pid),0);return true;}catch(e){return e.code==='EPERM';}}
export function runnerLock(file){const value=readJson(file);return typeof value==='number'?{pid:value}:value;}
export function acquireRunnerLock(file,runId){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 for(let attempt=0;attempt<2;attempt++){
  try{const fd=fs.openSync(file,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,runId,startedAt:new Date().toISOString()}));fs.closeSync(fd);return ()=>{const owner=runnerLock(file);if(owner?.pid===process.pid&&owner?.runId===runId)fs.unlinkSync(file);};}
  catch(e){if(e.code!=='EEXIST')throw e;const owner=runnerLock(file);if(!owner?.pid||alive(owner.pid))throw Error('Another crawler is running or the runner lock cannot be verified');fs.unlinkSync(file);}
 }throw Error('Could not acquire crawler lock');
}
export function minimalSource(doc){return Object.fromEntries(['id','asin','product_id','url','name','title','brand','image','price','mrp','category','sub_category','sub_sub_category','category_name','category_path','category_url','shade','size','pack_size','sku'].filter(key=>doc[key]!==undefined).map(key=>[key,doc[key]]));}

export async function runStoreJobs(jobs, parallelStores, signal, runJob) {
  const byStore = new Map();
  for (const job of jobs) {
    if (!byStore.has(job.store)) byStore.set(job.store, []);
    byStore.get(job.store).push(job);
  }
  const batches = byStore.values();
  const workers = await Promise.allSettled(Array.from({ length: Math.min(parallelStores, byStore.size) }, async () => {
    for (const batch of batches) {
      for (const job of batch) {
        if (signal.aborted) return;
        await runJob(job);
      }
    }
  }));
  const rejected = workers.find(worker => worker.status === 'rejected');
  if (rejected) throw rejected.reason;
}
