import 'server-only';
import {connectDB} from '@/lib/mongodb';
import {normalizeProduct,getProductBySlugOrId} from '@/lib/utils/products';
import {root,members,liveMembers,rootKeyStages,groupPath,queryGroups} from './engine.mjs';
import {fingerprint,identity} from './title-matcher.mjs';
import {cache} from 'react';
export async function catalogDB():Promise<any>{const c=await connectDB();const db=c.connection.db;if(!db)throw Error('Database unavailable');return db;}
export async function catalogEnabled(){return (await (await catalogDB()).collection('catalog_control').findOne({_id:'settings'}))?.enabled===true;}
async function ensureProductSlug(db:any,node:any,product:any){
 if(node.productSlug)return node;
 const proposed=product.slug||node.slug+'-'+String(product.id||product._id).replace(/[^a-z0-9]/gi,'');
 for(const candidate of [proposed,proposed+'-'+String(product._id).slice(-8)]){
  try{const updated=await db.collection('catalog_nodes').findOneAndUpdate({_id:node._id,productSlug:{$exists:false}},{$set:{productSlug:candidate}},{returnDocument:'after'});return updated||await db.collection('catalog_nodes').findOne({_id:node._id});}catch(e:any){if(e.code!==11000)throw e;}
 }throw Error('Could not allocate a unique product URL');
}
export const getComparison=cache(async(slug:string)=>{
 if(!await catalogEnabled())return null;
 const db=await catalogDB(),id=slug.match(/(mk-[a-f0-9]{24})$/i)?.[1]?.toUpperCase();
 const found=id?{_id:id}:await db.collection('catalog_nodes').findOne({$or:[{productSlug:slug},{slug:slug}]});if(!found)return null;
 let node=await root(db,found._id);if(!node)return null;
 const rows=await liveMembers(db,node._id);
 // Identity changes are held out immediately, even before the next scan notices them.
 const eligible=rows.filter((s:any)=>!s.suspended&&(!s.changed||rows.length===1));
 if(!eligible.length)return null;
 const rawOffers=eligible.map((s:any)=>({...normalizeProduct(s.doc,s.store),site_sku:node._id,sourceKey:s._id}));
 rawOffers.sort((a:any,b:any)=>Number(a.in_stock===false)-Number(b.in_stock===false)||(a.price>0?a.price:Infinity)-(b.price>0?b.price:Infinity));
 const seenStores = new Set<string>();
 const offers = rawOffers.filter((o:any)=>{
  const store = String(o.marketplace||o.store||'').toLowerCase();
  if(!store||seenStores.has(store))return false;
  seenStores.add(store);
  return true;
 });
 node=await ensureProductSlug(db,node,offers[0]);
 return {node,path:groupPath(node),offers,held:rows.length-eligible.length};
});
export const getProductPage=cache(async(slug:string):Promise<any>=>{
 const comparison=await getComparison(slug);if(comparison)return comparison;
 const product=await getProductBySlugOrId(slug);if(!product)return null;
 const path=await sourceComparisonPath(product);if(path){const matched=await getComparison(path.split('/').at(-1)!);if(matched)return matched;}
 const source=await (await catalogDB()).collection('catalog_sources').findOne({_id:product.marketplace+':'+product._id});
 return {node:{_id:source?.siteSku||product.sku||product.id,title:product.name},path:'/product/'+product.slug,offers:[product],held:0};
});
export async function sourceComparisonPath(product:{marketplace:string;_id:string}){
 if(!await catalogEnabled())return null;
 const db=await catalogDB(),source=await db.collection('catalog_sources').findOne({_id:product.marketplace+':'+product._id});
 if(!source||source.suspended)return null;
 const doc=await db.collection(product.marketplace+'_makeupkhoj').findOne({_id:source.sourceId});
 if(!doc)return null;
 let node=await root(db,source.siteSku);if(!node)return null;
 if(fingerprint(identity(doc))!==source.identityHash){const rows=await liveMembers(db,node._id);if(rows.length>1)return null;}
 node=await ensureProductSlug(db,node,normalizeProduct(doc,product.marketplace));return groupPath(node);
}
const listings=new Map<string,{until:number;result:Promise<any>}>();
export function invalidateComparisonListings(){listings.clear();}
export async function comparisonListing(params:any){
 params={...params,view:'multi'};
 if(!await catalogEnabled())return {rows:[],total:0,page:params.page||1,totalPages:1};
 const key=JSON.stringify(params),cached=listings.get(key);if(cached&&cached.until>Date.now())return cached.result;
 if(listings.size>=60)listings.delete(listings.keys().next().value!);
 const result=catalogDB().then(async db=>{const result=await queryGroups(db,params);for(const row of result.rows){const source=await db.collection(row.product.store+'_makeupkhoj').findOne({_id:row.product.sourceId});if(source)row.root=await ensureProductSlug(db,row.root,normalizeProduct(source,row.product.store));}return result;}).catch(error=>{listings.delete(key);throw error;});listings.set(key,{until:Date.now()+15000,result});return result;
}
export async function decorateProductComparisons(products:any[]){
 if(!products.length||!await catalogEnabled())return products;
 const db=await catalogDB(),aliases=await db.collection('catalog_nodes').find({parent:{$ne:null}},{projection:{parent:1}}).toArray(),involved=[...new Set(aliases.flatMap((n:any)=>[n._id,n.parent]))];if(!involved.length)return products;
 const keys=products.map(p=>p.marketplace+':'+p._id),sources=await db.collection('catalog_sources').find({_id:{$in:keys},siteSku:{$in:involved},suspended:{$ne:true},missing:{$ne:true}}).toArray();
 const sourceMap=new Map(sources.map((s:any)=>[s._id,s])),groups=new Map<string,Promise<any>>();
 return Promise.all(products.map(async product=>{
  const source:any=sourceMap.get(product.marketplace+':'+product._id);if(!source)return product;
  const node=await root(db,source.siteSku);if(!node)return product;
  if(!groups.has(node._id))groups.set(node._id,(async()=>{const rows=await members(db,node._id),eligible=rows.filter((r:any)=>!r.suspended&&!r.missing),stores=[...new Set(eligible.map((r:any)=>r.store))];if(stores.length<2)return null;return {href:groupPath(await ensureProductSlug(db,node,product)),sku:node._id,stores};})());
  const comparison=await groups.get(node._id);return comparison?{...product,comparison:{...comparison,priceStore:product.marketplace_name||product.marketplace}}:product;
 }));
}
export async function comparisonSitemapCount(){if(!await catalogEnabled())return 0;const db=await catalogDB();const [row]=await db.collection('catalog_sources').aggregate([{$match:{suspended:{$ne:true},missing:{$ne:true}}},...await rootKeyStages(db),{$group:{_id:'$rootSku',stores:{$addToSet:'$store'}}},{$match:{'stores.1':{$exists:true}}},{$count:'n'}]).toArray();return row?.n||0;}
export async function comparisonSitemapRows(skip:number,limit:number){
 if(!await catalogEnabled())return [];
 const db=await catalogDB(),rows=await db.collection('catalog_sources').aggregate([{$match:{suspended:{$ne:true},missing:{$ne:true}}},...await rootKeyStages(db),{$group:{_id:'$rootSku',stores:{$addToSet:'$store'},store:{$first:'$store'},sourceId:{$first:'$sourceId'}}},{$match:{'stores.1':{$exists:true}}},{$sort:{_id:1}},{$skip:skip},{$limit:limit}]).toArray();
 const nodes=await db.collection('catalog_nodes').find({_id:{$in:rows.map((r:any)=>r._id)}}).toArray(),byId=new Map(nodes.map((n:any)=>[n._id,n]));
 return Promise.all(rows.filter((r:any)=>byId.has(r._id)).map(async(r:any)=>{let node=byId.get(r._id);if(!(node as any).productSlug){const doc=await db.collection(r.store+'_makeupkhoj').findOne({_id:r.sourceId});if(doc)node=await ensureProductSlug(db,node,normalizeProduct(doc,r.store));}return {...r,node};}));
}
