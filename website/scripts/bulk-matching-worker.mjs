import {MongoClient} from 'mongodb';
import {runBulkJob,prepare} from '../src/lib/matching/engine.mjs';
const id=process.argv[2],client=await new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:15000,maxPoolSize:5}).connect(),db=client.db(process.env.MASTER_DB||'makeupkhoj');
if(db.databaseName!=='makeupkhoj')throw Error('Unexpected database');
const jobs=db.collection('catalog_bulk_runs');
try{
 await prepare(db);const job=await runBulkJob(db,id);if(job)console.log('Bulk matching finished',id,{processed:job.processed,succeeded:job.succeeded,failed:job.failed});
}catch(e){await jobs.updateOne({_id:id},{$set:{status:'failed',error:'Worker interrupted. Completed decisions are retained; pending pairs can be previewed again.',finishedAt:new Date()}});console.error('Bulk matching worker stopped');process.exitCode=1;}finally{await client.close();}
