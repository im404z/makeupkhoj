import 'server-only';
import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'node:crypto';
import { adminDB,STORES } from './data';
import { externalUrl,merchantUrl,amazonLink } from '@/lib/affiliate-links';
import type { Product } from '@/types/product';
export type AffiliateSettings={enabled:boolean;tracking:boolean;amazonTag:string;stores:Record<string,{enabled:boolean;mode:'direct'|'amazon'|'ekaro'}>};
export const defaults:AffiliateSettings={enabled:false,tracking:true,amazonTag:'',stores:Object.fromEntries(STORES.map(s=>[s,{enabled:true,mode:s==='amazon'?'amazon':'ekaro'}]))};
function key(){const secret=process.env.AFFILIATE_ENCRYPTION_KEY||process.env.ADMIN_SESSION_SECRET;if(!secret)throw Error('Server encryption key is not configured');return createHash('sha256').update(secret).digest();}
export function encryptToken(token:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');}
function decryptToken(token:string){const [iv,tag,data]=token.split('.').map(s=>Buffer.from(s,'base64'));const cipher=createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString();}
let indexes:Promise<unknown>|undefined;
async function ensureIndexes(){const db=await adminDB();if(!indexes)indexes=Promise.all([db.collection('affiliate_settings').createIndex({key:1},{unique:true}),db.collection('affiliate_products').createIndex({key:1},{unique:true}),db.collection('affiliate_clicks').createIndex({day:1,store:1}),db.collection('affiliate_rate_limits').createIndex({expiresAt:1},{expireAfterSeconds:0})]).catch(e=>{indexes=undefined;throw e;});await indexes;}
export async function configuration(){await ensureIndexes();const db=await adminDB(),doc=await db.collection('affiliate_settings').findOne({key:'global'});return {settings:{...defaults,...doc?.settings,stores:{...defaults.stores,...doc?.settings?.stores}} as AffiliateSettings,token:doc?.encryptedToken?decryptToken(doc.encryptedToken):process.env.EARNKARO_API_TOKEN||''};}
export const productKey=(p:Product)=>p.marketplace+':'+p._id;
export const sourceHash=(url:string)=>createHash('sha256').update(url).digest('hex');
export async function destination(product:Product){
 const direct=merchantUrl(product.url,product.marketplace);if(!direct)throw Error('Store URL is missing or invalid');
 const {settings,token}=await configuration();const db=await adminDB(),override=await db.collection('affiliate_products').findOne({key:productKey(product)});
 const store=settings.stores[product.marketplace];let url=direct,kind='direct',reason='Original merchant store link (Direct)';
 if(!settings.enabled){
  reason='Affiliate links are globally disabled';
 }else if(!store?.enabled){
  reason=`Affiliate links disabled for ${product.marketplace}`;
 }else if(override?.mode==='direct'){
  reason='Product override is set to direct store link';
 }else if(override?.mode==='custom'&&externalUrl(override.customUrl)){
  url=externalUrl(override.customUrl);kind='custom';reason='Custom product affiliate URL';
 }else if(store.mode==='amazon'&&product.marketplace==='amazon'&&settings.amazonTag){
  url=amazonLink(direct,settings.amazonTag);kind='amazon';reason=`Amazon Associates tag active (${settings.amazonTag})`;
 }else if(store.mode==='ekaro'){
  if(override?.convertedUrl&&override.sourceHash===sourceHash(direct)&&externalUrl(override.convertedUrl)){
   url=externalUrl(override.convertedUrl);kind='ekaro';reason='EarnKaro converted affiliate link (cached)';
  }else if(token){
   try{
    const converted=await convertProduct(product);
    if(converted){url=converted;kind='ekaro';reason='EarnKaro affiliate link (converted via API)';}
   }catch(err:any){
    reason=`EarnKaro conversion failed: ${err.message}. Using direct link.`;
   }
  }else{
   reason='EarnKaro mode selected, but API token is not configured. Falling back to direct URL.';
  }
 }
 return {url,kind,reason,directUrl:direct,tracking:settings.tracking};
}
export async function convertProduct(product:Product){
 const {settings,token}=await configuration();if(!settings.enabled||!settings.stores[product.marketplace]?.enabled)throw Error('Enable affiliate links for this store first');if(!token)throw Error('Configure an EarnKaro API token first');
 const direct=merchantUrl(product.url,product.marketplace);if(!direct)throw Error('Product has no valid store URL');
 const db=await adminDB(),key=productKey(product),col=db.collection('affiliate_products');const previous=await col.findOne({key});
 if(previous?.convertedUrl&&previous.sourceHash===sourceHash(direct))return previous.convertedUrl;
 // Global per-minute reservation, shared by all admin sessions and server processes.
 const minute=Math.floor(Date.now()/60000),rates=db.collection('affiliate_rate_limits');
 const used=await rates.findOneAndUpdate({_id:('ekaro:'+minute) as any},{$inc:{count:1},$set:{expiresAt:new Date((minute+2)*60000)}},{upsert:true,returnDocument:'after'});
 if((used?.count||0)>60)throw Error('EarnKaro limit reached. Retry next minute.');
 const response=await fetch('https://ekaro-api.affiliaters.in/api/converter/public',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({deal:direct,convert_option:'convert_only'}),signal:AbortSignal.timeout(20000),cache:'no-store'});
 const result=await response.json();if(!response.ok||result.success!==1||typeof result.data!=='string')throw Error(response.status===429?'EarnKaro rate limit reached. Retry next minute.':'EarnKaro conversion failed. Check the token and seller support.');
 const matches=result.data.match(/https:\/\/[^\s<>"']+/g)||[];if(matches.length!==1)throw Error('EarnKaro returned an unexpected link format');const url=externalUrl(matches[0]);if(!url)throw Error('EarnKaro returned an invalid link');
 await col.updateOne({key},{$set:{convertedUrl:url,sourceHash:sourceHash(direct),convertedAt:new Date(),store:product.marketplace,slug:product.slug,name:product.name}},{upsert:true});return url;
}
export async function recordClick(product:Product,kind:string){
 const db=await adminDB(),day=new Date().toISOString().slice(0,10),key=productKey(product);
 await db.collection('affiliate_clicks').updateOne({_id:(day+':'+key+':'+kind) as any},{$inc:{clicks:1},$set:{day,store:product.marketplace,slug:product.slug,name:product.name,kind,lastClickedAt:new Date()}},{upsert:true});
}
export async function testEarnkaroConnection(tokenInput?: string) {
 const {token: savedToken} = await configuration();
 const token = tokenInput?.trim() || savedToken;
 if (!token) throw Error('No EarnKaro API token provided or configured');
 const start = Date.now();
 const testDeal = 'https://www.myntra.com';
 const response = await fetch('https://ekaro-api.affiliaters.in/api/converter/public', {
  method: 'POST',
  headers: {
   Authorization: 'Bearer ' + token,
   'Content-Type': 'application/json'
  },
  body: JSON.stringify({ deal: testDeal, convert_option: 'convert_only' }),
  signal: AbortSignal.timeout(15000),
  cache: 'no-store'
 });
 const duration = Date.now() - start;
 const result = await response.json().catch(() => null);
 if (!response.ok || !result || result.success !== 1 || typeof result.data !== 'string') {
  const errMsg = result?.message || result?.error || (response.status === 429 ? 'EarnKaro rate limit reached' : `EarnKaro HTTP ${response.status}`);
  throw Error(`EarnKaro API Error: ${errMsg}`);
 }
 const matches = result.data.match(/https:\/\/[^\s<>"']+/g) || [];
 if (!matches.length) throw Error('EarnKaro API responded successfully but returned no link');
 return {
  ok: true,
  sampleUrl: testDeal,
  convertedUrl: matches[0],
  durationMs: duration,
  message: `EarnKaro API verified active! Test link generated in ${duration}ms.`
 };
}

export async function testArbitraryUrl(inputUrl: string) {
 const raw = String(inputUrl || '').trim();
 const safe = externalUrl(raw);
 if (!safe) throw Error('Enter a valid HTTPS URL');
 const u = new URL(safe);
 let store = '';
 for (const [s, domain] of Object.entries({amazon:'amazon.in',flipkart:'flipkart.com',myntra:'myntra.com',nykaa:'nykaa.com'})) {
  if (u.hostname === domain || u.hostname.endsWith('.' + domain)) { store = s; break; }
 }
 if (!store) throw Error('URL domain must be Amazon.in, Flipkart.com, Myntra.com, or Nykaa.com');
 const { settings, token } = await configuration();
 const storeConfig = settings.stores[store];
 if (!settings.enabled) {
  return { inputUrl: safe, store, kind: 'direct', outputUrl: safe, reason: 'Affiliate links are globally disabled in settings' };
 }
 if (!storeConfig?.enabled) {
  return { inputUrl: safe, store, kind: 'direct', outputUrl: safe, reason: `Affiliate links are disabled for ${store}` };
 }
 if (storeConfig.mode === 'amazon' && store === 'amazon' && settings.amazonTag) {
  const tagged = amazonLink(safe, settings.amazonTag);
  return { inputUrl: safe, store, kind: 'amazon', outputUrl: tagged, reason: `Tagged with Amazon Associates tag (${settings.amazonTag})` };
 }
 if (storeConfig.mode === 'ekaro') {
  if (!token) {
   return { inputUrl: safe, store, kind: 'direct', outputUrl: safe, reason: 'EarnKaro mode selected, but no EarnKaro API token is configured. Falling back to direct URL.' };
  }
  const response = await fetch('https://ekaro-api.affiliaters.in/api/converter/public', {
   method: 'POST',
   headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
   body: JSON.stringify({ deal: safe, convert_option: 'convert_only' }),
   signal: AbortSignal.timeout(15000),
   cache: 'no-store'
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.success !== 1 || typeof result.data !== 'string') {
   const err = result?.message || result?.error || `HTTP ${response.status}`;
   return { inputUrl: safe, store, kind: 'direct', outputUrl: safe, reason: `EarnKaro conversion failed (${err}). Falling back to direct URL.` };
  }
  const matches = result.data.match(/https:\/\/[^\s<>"']+/g) || [];
  if (matches.length) {
   return { inputUrl: safe, store, kind: 'ekaro', outputUrl: matches[0], reason: 'Successfully converted via EarnKaro API!' };
  }
 }
 return { inputUrl: safe, store, kind: 'direct', outputUrl: safe, reason: 'Original direct store link' };
}
