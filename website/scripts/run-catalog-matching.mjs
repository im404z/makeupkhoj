import {MongoClient} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {lock} from '../src/lib/matching/engine.mjs';
const args=process.argv.slice(2),value=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const store=value('--store','all'),limit=Number(value('--limit','0')),dryRun=args.includes('--dry-run');
if(!['all','amazon','flipkart','myntra','nykaa'].includes(store)||!Number.isSafeInteger(limit)||limit<0)throw Error('Invalid scope');
const client=await new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000}).connect(),db=client.db(process.env.MASTER_DB||'makeupkhoj');
if(db.databaseName!=='makeupkhoj')throw Error('Unexpected database');
const id=randomUUID();
try{await lock(db,async()=>{if(await db.collection('catalog_runs').findOne({status:{$in:['queued','running']},heartbeat:{$gte:new Date(Date.now()-180000)}}))throw Error('Another run is active');await db.collection('catalog_runs').insertOne({_id:id,store,limit,dryRun,status:'queued',createdAt:new Date(),heartbeat:new Date()});});}finally{await client.close();}
console.log('Starting catalogue run',id,{store,limit,dryRun});process.argv[2]=id;await import('./catalog-worker.mjs');
