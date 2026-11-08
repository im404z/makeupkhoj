import 'server-only';
import { connectDB } from '@/lib/mongodb';
export const STORES=['amazon','flipkart','myntra','nykaa'] as const;
export type Store=typeof STORES[number];
export function validStore(s:unknown):s is Store{return typeof s==='string'&&(STORES as readonly string[]).includes(s);}
export async function adminDB(){const connection=await connectDB();const db=connection.connection.db;if(!db||db.databaseName!=='makeupkhoj')throw Error('Admin requires makeupkhoj database');return db;}
export async function marketplaceStats(){const db=await adminDB();return Promise.all(STORES.map(async store=>{
  const col=db.collection(store+'_makeupkhoj');
  const [counts]=await col.aggregate([{$group:{_id:null,total:{$sum:1},enriched:{$sum:{$cond:[{$eq:['$pdp_scraped',true]},1,0]}},uncategorized:{$sum:{$cond:[{$or:[{$in:[{$ifNull:['$sub_category','']},['','General','Unknown']]},{$in:[{$ifNull:['$sub_sub_category','']},['','General','Unknown']]}]},1,0]}}}}]).toArray();
  return {store,listing:counts?.total||0,enriched:counts?.enriched||0,pending:(counts?.total||0)-(counts?.enriched||0),uncategorized:counts?.uncategorized||0};
}));}
