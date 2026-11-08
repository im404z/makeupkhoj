import {randomBytes,randomUUID} from 'node:crypto';
import {identity,fingerprint,compareIdentity,MATCH_VERSION,normalize} from './title-matcher.mjs';
export const sku=()=> 'MK-'+randomBytes(12).toString('hex').toUpperCase();
export const slugify=value=>normalize(value).replace(/ /g,'-').slice(0,100)||'makeup';
export const groupPath=group=>'/product/'+(group.productSlug||group.slug+'-'+group._id.toLowerCase());
export async function prepare(db){
 await Promise.all([
  db.collection('catalog_sources').createIndex({siteSku:1}),
  db.collection('catalog_sources').createIndex({'identity.brand':1,'identity.tokens':1,store:1}),
  db.collection('catalog_sources').createIndex({store:1,sourceId:1},{unique:true}),
  db.collection('catalog_nodes').createIndex({parent:1}),
  db.collection('catalog_nodes').createIndex({productSlug:1},{unique:true,sparse:true}),
  db.collection('catalog_candidates').createIndex({status:1,score:-1,_id:1}),
 ]);
}
// A merge is ONE atomic parent-pointer write. It works on standalone MongoDB too.
// Membership reads resolve the tree; no partially rewritten membership table exists.
export async function root(db,id){
 const seen=new Set();
 for(let i=0;i<64;i++){if(seen.has(id))throw Error('Catalogue cycle detected');seen.add(id);const n=await db.collection('catalog_nodes').findOne({_id:id});if(!n)return null;if(!n.parent)return n;id=n.parent;}
 throw Error('Catalogue nesting limit reached');
}
export function resolvedPipeline(){return [
 {$graphLookup:{from:'catalog_nodes',startWith:'$siteSku',connectFromField:'parent',connectToField:'_id',as:'ancestors',maxDepth:63}},
 {$set:{root:{$arrayElemAt:[{$filter:{input:'$ancestors',as:'n',cond:{$eq:[{$ifNull:['$$n.parent',null]},null]}}},0]}}},
 {$match:{'root._id':{$exists:true}}},{$project:{ancestors:0}},
 ];}
// Resolve only merged aliases once, rather than issuing a graph lookup per listing.
export async function rootKeyStages(db){
 const aliases=await db.collection('catalog_nodes').find({parent:{$ne:null}},{projection:{parent:1}}).toArray(),parents=new Map(aliases.map(n=>[n._id,n.parent]));
 const keys=[],values=[];
 for(const alias of aliases){let id=alias._id;const seen=new Set();while(parents.has(id)){if(seen.has(id))throw Error('Catalogue cycle detected');seen.add(id);id=parents.get(id);}keys.push(alias._id);values.push(id);}
 if(!keys.length)return [{$set:{rootSku:'$siteSku'}}];
 return [{$set:{rootSku:{$let:{vars:{i:{$indexOfArray:[{$literal:keys},'$siteSku']}},in:{$cond:[{$gte:['$$i',0]},{$arrayElemAt:[{$literal:values},'$$i']},'$siteSku']}}}}}];
}
export async function members(db,id){
 const [tree]=await db.collection('catalog_nodes').aggregate([{$match:{_id:id}},{$graphLookup:{from:'catalog_nodes',startWith:'$_id',connectFromField:'_id',connectToField:'parent',as:'descendants',maxDepth:63}},{$project:{ids:{$concatArrays:[['$_id'],'$descendants._id']}}}]).toArray();
 return tree?db.collection('catalog_sources').find({siteSku:{$in:tree.ids}}).toArray():[];
}
export async function lock(db,task){
 const owner=randomUUID(),now=new Date();
 try{await db.collection('catalog_control').updateOne({_id:'mutation',expires:{$lt:now}},{$set:{owner,expires:new Date(Date.now()+120000)}},{upsert:true});}
 catch(e){if(e.code===11000)throw Error('Catalogue is busy. Try again shortly.');throw e;}
 try{return await task();}finally{await db.collection('catalog_control').deleteOne({_id:'mutation',owner});}
}
export async function sourceProduct(db,source){return db.collection(source.store+'_makeupkhoj').findOne({_id:source.sourceId});}
export async function liveMembers(db,id){
 const rows=await members(db,id);
 return (await Promise.all(rows.map(async s=>{const doc=await sourceProduct(db,s);return doc?{...s,doc,currentIdentity:identity(doc),changed:fingerprint(identity(doc))!==s.identityHash}:null;}))).filter(Boolean);
}
export async function approve(db,pairId){return lock(db,async()=>{
 const pair=await db.collection('catalog_candidates').findOne({_id:pairId});if(!pair||!['pending','approved'].includes(pair.status))throw Error('This suggestion is no longer pending');
 const [a,b]=await Promise.all([db.collection('catalog_sources').findOne({_id:pair.a}),db.collection('catalog_sources').findOne({_id:pair.b})]);
 if(!a||!b)throw Error('Source listing missing');
 const [left,right]=await Promise.all([root(db,a.siteSku),root(db,b.siteSku)]);if(!left||!right)throw Error('SKU missing');
 if(left._id===right._id){await db.collection('catalog_candidates').updateOne({_id:pairId},{$set:{status:'approved'}});return left._id;}
 const [A,B]=await Promise.all([liveMembers(db,left._id),liveMembers(db,right._id)]);
 if(!A.length||!B.length)throw Error('Source listing missing');
 if([...A,...B].some(s=>s.changed))throw Error('Identity changed since the scan. Run an incremental scan before approval.');
 for(const x of A)for(const y of B){const evidence=compareIdentity(x.currentIdentity,y.currentIdentity);if(evidence.conflicts.length)throw Error('Conflicting variants: '+evidence.conflicts.join('; '));}
 const storesA=new Set(A.map(x=>x.store));const dups=B.filter(y=>storesA.has(y.store));if(dups.length)throw Error('Cannot merge: both groups already contain an offer from '+dups.map(d=>d.store).join(', '));
 if(A.length+B.length>100)throw Error('Group exceeds 100 listings; review duplicate source records first');
 const target=A.length>=B.length?left:right,other=A.length>=B.length?right:left;
 const event={action:'merge',from:other._id,to:target._id,pairId,evidence:pair.evidence,at:new Date(),actor:'admin',version:MATCH_VERSION};
 const result=await db.collection('catalog_nodes').updateOne({_id:other._id,parent:null},{$set:{parent:target._id,updatedAt:new Date()},$push:{history:event}});
 if(!result.modifiedCount)throw Error('Group changed; reload before approving');
 await db.collection('catalog_candidates').updateOne({_id:pairId},{$set:{status:'approved',decidedAt:new Date()}});
 return target._id;
 });}
export async function bulkDecide(db,action,ids){
 if(!['approve','reject'].includes(action)||!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(id=>typeof id!=='string'||id.length>250))throw Error('Select between 1 and 50 valid suggestions');
 const results=[];
 for(const id of [...new Set(ids)]){
  try{if(action==='approve')results.push({id,status:'approved',sku:await approve(db,id)});
   else{const result=await db.collection('catalog_candidates').updateOne({_id:id,status:'pending'},{$set:{status:'rejected',decidedAt:new Date()},$push:{history:{action:'reject',at:new Date(),actor:'admin',bulk:true}}});results.push({id,status:result.modifiedCount?'rejected':'skipped'});}
  }catch(e){results.push({id,status:'failed',error:e.message});}
 }return {results,succeeded:results.filter(r=>['approved','rejected'].includes(r.status)).length,failed:results.filter(r=>r.status==='failed').length};
}
export async function runBulkJob(db,id){
 const jobs=db.collection('catalog_bulk_runs'),job=await jobs.findOneAndUpdate({_id:id,status:'queued'},{$set:{status:'running',heartbeat:new Date(),startedAt:new Date()}},{returnDocument:'after'});
 if(!job)return null;
 let processed=0,succeeded=0,failed=0;const failures=[];
 for(const pairId of job.ids){
  if((await jobs.findOne({_id:id},{projection:{cancelRequested:1}}))?.cancelRequested)break;
  const result=await bulkDecide(db,'approve',[pairId]);processed++;succeeded+=result.succeeded;failed+=result.failed;
  if(result.failed&&failures.length<30)failures.push(result.results[0]);
  await jobs.updateOne({_id:id},{$set:{processed,succeeded,failed,failures,heartbeat:new Date()}});
 }
 const cancelled=(await jobs.findOne({_id:id},{projection:{cancelRequested:1}}))?.cancelRequested;
 await jobs.updateOne({_id:id},{$set:{status:cancelled?'cancelled':'completed',processed,succeeded,failed,finishedAt:new Date()}});
 return jobs.findOne({_id:id},{projection:{ids:0}});
}
export async function splitSource(db,sourceKey){return lock(db,async()=>{
 const source=await db.collection('catalog_sources').findOne({_id:sourceKey});if(!source)throw Error('Source not found');
 const id=sku(),node={_id:id,parent:null,slug:slugify(source.title),title:source.title,createdAt:new Date()};
 await db.collection('catalog_nodes').insertOne(node);
 await db.collection('catalog_sources').updateOne({_id:sourceKey,siteSku:source.siteSku},{$set:{siteSku:id,suspended:false},$push:{history:{action:'split',from:source.siteSku,to:id,at:new Date(),actor:'admin'}}});
 // Preserve a rejection so a rerun does not re-suggest the undone merge.
 await db.collection('catalog_candidates').updateMany({$or:[{a:sourceKey},{b:sourceKey}],status:'approved'},{$set:{status:'rejected',decidedAt:new Date()}});
 return id;
 });}
export async function syncBatch(db,store,docs,{dryRun=false}={}){
 const sources=db.collection('catalog_sources');if(dryRun)return docs.length;
 const keys=docs.map(d=>store+':'+String(d._id)),old=await sources.find({_id:{$in:keys}}).toArray(),byKey=new Map(old.map(s=>[s._id,s]));
 const writes=[],nodes=[];
 for(const doc of docs){const key=store+':'+String(doc._id),prev=byKey.get(key),ident=identity(doc),hash=fingerprint(ident),siteSku=prev?.siteSku||sku();
  const changed=prev&&prev.identityHash!==hash;
  let suspended=prev?.suspended||false;
  if(changed){const r=await root(db,siteSku);if(r&&(await members(db,r._id)).length>1)suspended=true;}
  const cleanTitle=(v)=>String(v||'').replace(/^(?:sponsored\s*ad\s*[-–\u2014:]*\s*|sponsored\s*[-–\u2014:]*\s*|deal\s+of\s+the\s+day\s*[-–\u2014:]*\s*|buy\s+)/i,'').trim();
  const cleanDocTitle=cleanTitle(doc.title||doc.name)||'Makeup',cleanDocName=cleanTitle(doc.name||doc.title)||'Makeup';
  const snapshot={title:cleanDocTitle,name:cleanDocName,brand:doc.brand||'',url:doc.url||'',pdp_scraped:doc.pdp_scraped===true,brandSlug:slugify(doc.brand||''),finish:normalize(doc.finish),coverage:normalize(doc.coverage),skinType:normalize(Array.isArray(doc.skin_type)?doc.skin_type.join(' '):doc.skin_type),image:String(doc.high_res_image||doc.image||doc.mainImage||doc.images?.[0]||'').replace(/^http:\/\//,'https://'),price:number(doc.price??doc.currentPrice),mrp:number(doc.mrp),in_stock:doc.in_stock,category:[doc.category,doc.sub_category,doc.sub_sub_category,doc.category_name].filter(Boolean).join(' '),rating:number(doc.rating),discount:number(doc.discount_percentage),checkedAt:doc.price_last_checked||doc.updated_at||doc.crawled_at||null};
  writes.push({updateOne:{filter:{_id:key},update:{$set:{store,sourceId:doc._id,identity:ident,identityHash:hash,...snapshot,suspended,missing:false,syncedAt:new Date()},$setOnInsert:{siteSku,createdAt:new Date()}},upsert:true}});
  nodes.push({updateOne:{filter:{_id:siteSku},update:{$setOnInsert:{parent:null,slug:slugify(snapshot.title),title:snapshot.title,createdAt:new Date()}},upsert:true}});
 }
 if(nodes.length)await db.collection('catalog_nodes').bulkWrite(nodes,{ordered:false});
 if(writes.length)await sources.bulkWrite(writes,{ordered:false});return writes.length;
}
export function number(value){const m=String(value??'').replace(/,/g,'').match(/\d+(?:\.\d+)?/);return m?Number(m[0]):0;}
export async function scanCandidates(db,{store='all',limit=0,onProgress=async()=>{},cancelled=async()=>false}={}){
 const all=await db.collection('catalog_sources').find({suspended:{$ne:true},missing:{$ne:true},'identity.brand':{$nin:['','unknown']}},{projection:{identity:1,identityHash:1,store:1,siteSku:1}}).sort({_id:1}).toArray();
 const postings=new Map(),nodes=await db.collection('catalog_nodes').find({},{projection:{parent:1}}).toArray(),parents=new Map(nodes.map(n=>[n._id,n.parent]));
 const resolved=id=>{for(let i=0;i<64&&parents.get(id);i++)id=parents.get(id);return id;};
 for(const row of all)for(const token of row.identity.tokens){const key=row.identity.brand+'|'+token;if(!postings.has(key))postings.set(key,[]);postings.get(key).push(row);}
 let scanned=0,suggestions=0,batch=[],seen=new Set();
 async function flush(){if(!batch.length)return;const previous=await db.collection('catalog_candidates').find({_id:{$in:batch.map(p=>p._id)}}).toArray(),byId=new Map(previous.map(p=>[p._id,p]));const writes=[];
  for(const p of batch){const old=byId.get(p._id);if(old?.hashes?.join()===p.hashes.join())continue;writes.push({updateOne:{filter:{_id:p._id},update:{$set:{...p,status:'pending',updatedAt:new Date()},$setOnInsert:{createdAt:new Date()}},upsert:true}});}
  if(writes.length)await db.collection('catalog_candidates').bulkWrite(writes,{ordered:false});suggestions+=writes.length;batch=[];
 }
 const scope=all.filter(s=>store==='all'||s.store===store).slice(0,limit||all.length);
 for(const a of scope){
  if(scanned%200===0){if(await cancelled())break;await flush();await onProgress({scanned,suggestions});}
  const keys=a.identity.tokens.filter(t=>t.length>=3&&!/^\d+$/.test(t)).map(t=>a.identity.brand+'|'+t).sort((a,b)=>postings.get(a).length-postings.get(b).length).slice(0,4);
  const candidates=new Map();for(const key of keys)for(const b of postings.get(key).slice(0,800))if(b.store!==a.store&&resolved(a.siteSku)!==resolved(b.siteSku))candidates.set(b._id,b);
  const ranked=[...candidates.values()].map(b=>({b,e:compareIdentity(a.identity,b.identity)})).filter(x=>x.e.score>=50&&x.e.common.length>=2).sort((x,y)=>y.e.score-x.e.score).slice(0,4);
  for(const {b,e} of ranked){const [x,y]=[a,b].sort((x,y)=>x._id.localeCompare(y._id)),id=x._id+'|'+y._id;if(seen.has(id))continue;seen.add(id);batch.push({_id:id,a:x._id,b:y._id,hashes:[x.identityHash,y.identityHash],evidence:e,score:e.score,version:MATCH_VERSION});}
  scanned++;if(batch.length>=500)await flush();
 }
 await flush();await onProgress({scanned,suggestions});return {scanned,suggestions};
}
export async function queryGroups(db,params={}){
 const page=Math.max(1,Number(params.page)||1),limit=Math.min(100,Math.max(1,Number(params.limit)||25));
 const conditions={suspended:{$ne:true},missing:{$ne:true}};
 const pipe=[{$match:conditions},{$project:{siteSku:1,sourceId:1,store:1,price:1,mrp:1,title:1,brand:1,brandSlug:1,image:1,in_stock:1,category:1,rating:1,discount:1,finish:1,coverage:1,skinType:1,syncedAt:1,createdAt:1}},...await rootKeyStages(db)];
 const match={};
 if(params.marketplace?.length)match.store={$in:params.marketplace};
 if(params.brand?.length)match.brandSlug={$in:params.brand};
 for(const [field,value] of [['category',params.category],['title',params.q]])if(value)match[field]={$regex:String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'};
 if(params.minPrice||params.maxPrice!==undefined)match.price={...(params.minPrice?{$gte:Number(params.minPrice)}:{}),...(params.maxPrice!==undefined?{$lte:Number(params.maxPrice)}:{})};
 if(params.inStock)match.in_stock=true;
 if(params.rating)match.rating={$gte:Number(params.rating)};
 if(params.minDiscount)match.discount={$gte:Number(params.minDiscount)};
 for(const key of ['finish','coverage','skinType'])if(params[key])match[key]={$regex:normalize(params[key]),$options:'i'};
 if(params.sub_category)match.category={$regex:normalize(params.sub_category).replace(/ /g,'.*'),$options:'i'};
 const filtered=Object.keys(match).length>0;
 // First collect all stores for filtered queries; every offer predicate applies to the same row.
 if(filtered){pipe.push({$group:{_id:'$rootSku',all:{$push:'$$ROOT'},stores:{$addToSet:'$store'}}},{$unwind:'$all'},{$replaceRoot:{newRoot:{$mergeObjects:['$all',{allStores:'$stores'}]}}},{$match:match});}
 pipe.push({$set:{priceRank:{$cond:[{$and:[{$gt:['$price',0]},{$ne:['$in_stock',false]}]},0,1]}}},{$sort:{priceRank:1,price:1,_id:1}},{$group:{_id:'$rootSku',product:{$first:'$$ROOT'},stores:filtered?{$first:'$allStores'}:{$addToSet:'$store'},offers:{$sum:1},price:{$first:'$price'},syncedAt:{$min:'$syncedAt'},createdAt:{$min:'$createdAt'}}});
 if(params.view==='multi')pipe.push({$match:{'stores.1':{$exists:true}}});if(params.view==='single')pipe.push({$match:{'stores.1':{$exists:false}}});
 pipe.push({$set:{storeCount:{$size:'$stores'}}});
 const sort=params.sort==='price_asc'?{price:1,_id:1}:params.sort==='price_desc'?{price:-1,_id:1}:params.sort==='newest'?{createdAt:-1,_id:1}:params.sort==='rating_desc'?{'product.rating':-1,_id:1}:params.sort==='discount_desc'?{'product.discount':-1,_id:1}:{storeCount:-1,_id:1};
 pipe.push({$sort:sort},{$facet:{rows:[{$skip:(page-1)*limit},{$limit:limit}],total:[{$count:'n'}]}});
 const [result]=await db.collection('catalog_sources').aggregate(pipe,{allowDiskUse:true}).toArray();
 const nodes=await db.collection('catalog_nodes').find({_id:{$in:(result?.rows||[]).map(r=>r._id)}}).toArray(),byId=new Map(nodes.map(n=>[n._id,n]));
 return {rows:(result?.rows||[]).map(r=>({...r,root:byId.get(r._id)})).filter(r=>r.root),total:result?.total[0]?.n||0,page,totalPages:Math.max(1,Math.ceil((result?.total[0]?.n||0)/limit))};
}
