import { ObjectId } from 'mongodb';
import { isAdmin,sameOrigin,privateJson } from '@/lib/admin/auth';
import { adminDB,validStore } from '@/lib/admin/data';
export const runtime='nodejs';
export async function GET(request:Request){
  if(!await isAdmin())return privateJson({error:'Unauthorized'},401);
  const u=new URL(request.url),store=u.searchParams.get('store');if(!validStore(store))return privateJson({error:'Invalid marketplace'},400);
  const page=Math.max(1,Math.min(100000,Number(u.searchParams.get('page'))||1));
  const q=u.searchParams.get('q')?.slice(0,120)||'';
  const query:Record<string,unknown>={};
  if(q){const regex=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');query.$or=[{title:{$regex:regex,$options:'i'}},{name:{$regex:regex,$options:'i'}},{brand:{$regex:regex,$options:'i'}}];}
  if(u.searchParams.get('status')==='pending')query.pdp_scraped={$ne:true};
  if(u.searchParams.get('status')==='enriched')query.pdp_scraped=true;
  if(u.searchParams.get('status')==='uncategorized')query.$and=[{$or:[{sub_category:{$in:['','General','Unknown',null]}},{sub_sub_category:{$in:['','General','Unknown',null]}}]}];
  try{const db=await adminDB(),col=db.collection(store+'_makeupkhoj');const [rows,total]=await Promise.all([col.find(query,{projection:{id:1,asin:1,title:1,name:1,brand:1,price:1,sub_category:1,sub_sub_category:1,category_path:1,pdp_scraped:1}}).sort({_id:-1}).skip((page-1)*20).limit(20).toArray(),col.countDocuments(query)]);return privateJson({products:rows.map(r=>({...r,_id:String(r._id)})),total,page});}catch{return privateJson({error:'Could not load products'},503);}
}
export async function PATCH(request:Request){
  if(!await isAdmin())return privateJson({error:'Unauthorized'},401);if(!sameOrigin(request))return privateJson({error:'Invalid origin'},403);
  try{const b=await request.json();if(!validStore(b.store)||!ObjectId.isValid(b._id)||typeof b.sub_category!=='string'||typeof b.sub_sub_category!=='string')return privateJson({error:'Invalid product or category'},400);
    const allowed=['Face','Lips','Eyes','Cheeks','Nails','Tools','Makeup Kits','Makeup Remover','General'];
    if(!allowed.includes(b.sub_category)||!b.sub_sub_category.trim()||b.sub_sub_category.length>100)return privateJson({error:'Choose a category and enter a leaf category'},400);
    const db=await adminDB(),leaf=b.sub_sub_category.trim();
    const result=await db.collection(b.store+'_makeupkhoj').updateOne({_id:new ObjectId(b._id)},{$set:{category:'Makeup',sub_category:b.sub_category,sub_sub_category:leaf,category_name:leaf,category_path:`Makeup > ${b.sub_category} > ${leaf}`,category_reviewed:true,category_reviewed_at:new Date().toISOString()}});
    return result.matchedCount?privateJson({ok:true}):privateJson({error:'Product not found'},404);
  }catch{return privateJson({error:'Could not save category'},500);}
}
