import { ObjectId } from 'mongodb';
import { isAdmin,sameOrigin,privateJson } from '@/lib/admin/auth';
import { adminDB,validStore,STORES } from '@/lib/admin/data';
import { configuration,encryptToken,productKey,convertProduct,destination,testEarnkaroConnection,testArbitraryUrl } from '@/lib/admin/affiliates';
import { normalizeProduct } from '@/lib/utils/products';
import { buyPath,externalUrl } from '@/lib/affiliate-links';
export const runtime='nodejs';
async function loadProduct(store:unknown,id:unknown){if(!validStore(store)||typeof id!=='string'||!ObjectId.isValid(id))return null;const db=await adminDB(),doc=await db.collection(store+'_makeupkhoj').findOne({_id:new ObjectId(id)});return doc?normalizeProduct(doc,store):null;}
export async function GET(request:Request){
 if(!await isAdmin())return privateJson({error:'Unauthorized'},401);
 try{const db=await adminDB(),{settings,token}=await configuration(),u=new URL(request.url);
 if(u.searchParams.has('id')){
  const product=await loadProduct(u.searchParams.get('store'),u.searchParams.get('id'));
  if(!product)return privateJson({error:'Product not found'},404);
  const override=await db.collection('affiliate_products').findOne({key:productKey(product)});
  let resolved=null;
  try{resolved=await destination(product);}catch(err:any){resolved={url:product.url,kind:'unavailable',reason:err.message};}
  return privateJson({
    product:{_id:product._id,name:product.name,store:product.marketplace,url:product.url,brand:product.brand},
    buyUrl:buyPath(product),
    override:{mode:override?.mode||'inherit',customUrl:override?.customUrl||'',convertedUrl:override?.convertedUrl||'',convertedAt:override?.convertedAt||null},
    resolved,
    tokenConfigured:!!token
  });
 }
 const since=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
 const [totals,top,daily]=await Promise.all([
 db.collection('affiliate_clicks').aggregate([{$group:{_id:'$store',clicks:{$sum:'$clicks'}}}]).toArray(),
 db.collection('affiliate_clicks').aggregate([{$match:{day:{$gte:since}}},{$group:{_id:{store:'$store',slug:'$slug'},name:{$first:'$name'},clicks:{$sum:'$clicks'}}},{$sort:{clicks:-1}},{$limit:20}]).toArray(),
 db.collection('affiliate_clicks').aggregate([{$match:{day:{$gte:since}}},{$group:{_id:{day:'$day',kind:'$kind'},clicks:{$sum:'$clicks'}}},{$sort:{'_id.day':-1}}]).toArray()]);
 return privateJson({settings,tokenConfigured:!!token,totals,top,daily});
 }catch{return privateJson({error:'Could not load affiliate settings'},503);}
}
export async function POST(request:Request){
 if(!await isAdmin())return privateJson({error:'Unauthorized'},401);if(!sameOrigin(request))return privateJson({error:'Invalid origin'},403);
 try{const b=await request.json(),db=await adminDB();
 if(b.action==='test-earnkaro'){
  const testResult=await testEarnkaroConnection(b.token);
  return privateJson(testResult);
 }
 if(b.action==='test-url'){
  const testResult=await testArbitraryUrl(b.url);
  return privateJson({ok:true,...testResult});
 }
 if(b.action==='settings'){
 const s=b.settings;if(!s||typeof s.enabled!=='boolean'||typeof s.tracking!=='boolean'||typeof s.amazonTag!=='string'||s.amazonTag.length>80||s.amazonTag&&!/^[a-zA-Z0-9-]+$/.test(s.amazonTag))return privateJson({error:'Invalid affiliate settings or Amazon tracking ID'},400);
 for(const store of STORES){const row=s.stores?.[store];if(!row||typeof row.enabled!=='boolean'||!['direct','amazon','ekaro'].includes(row.mode)||row.mode==='amazon'&&store!=='amazon')return privateJson({error:'Invalid marketplace settings'},400);}
 const set:Record<string,unknown>={settings:{enabled:s.enabled,tracking:s.tracking,amazonTag:s.amazonTag,stores:Object.fromEntries(STORES.map(store=>[store,{enabled:s.stores[store].enabled,mode:s.stores[store].mode}]))},updatedAt:new Date()};
 if(typeof b.token==='string'&&b.token.trim()){if(b.token.length>4096)return privateJson({error:'API token is too long'},400);set.encryptedToken=encryptToken(b.token.trim());}
 if(b.clearToken===true)set.encryptedToken=null;
 await db.collection('affiliate_settings').updateOne({key:'global'},{$set:set},{upsert:true});return privateJson({ok:true});
 }
 const product=await loadProduct(b.store,b.id);if(!product)return privateJson({error:'Product not found'},404);
 if(b.action==='product'){
 if(!['inherit','direct','custom'].includes(b.mode)||b.mode==='custom'&&!externalUrl(b.customUrl))return privateJson({error:'Choose a valid mode and HTTPS affiliate URL'},400);
 await db.collection('affiliate_products').updateOne({key:productKey(product)},{$set:{mode:b.mode,customUrl:b.mode==='custom'?externalUrl(b.customUrl):'',name:product.name,store:product.marketplace,slug:product.slug,updatedAt:new Date()}},{upsert:true});return privateJson({ok:true,buyUrl:buyPath(product)});
 }
 if(b.action==='generate'){const convertedUrl=await convertProduct(product);return privateJson({ok:true,convertedUrl,buyUrl:buyPath(product)});}
 if(b.action==='clear'){await db.collection('affiliate_products').updateOne({key:productKey(product)},{$unset:{convertedUrl:'',sourceHash:'',convertedAt:''}});return privateJson({ok:true});}
 return privateJson({error:'Unknown action'},400);
 }catch(e){return privateJson({error:e instanceof Error?e.message:'Could not update affiliate settings'},400);}
}
