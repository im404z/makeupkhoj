import { getProductBySlugOrId } from '@/lib/utils/products';
import { validStore } from '@/lib/admin/data';
import { destination,recordClick } from '@/lib/admin/affiliates';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{store:string;slug:string}>}){
 const {store,slug}=await params;
 const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'};
 if(!validStore(store))return new Response('Marketplace not found',{status:404,headers});
 try{const product=await getProductBySlugOrId(slug,store);if(!product)return new Response('Product not found',{status:404,headers});
 const target=await destination(product);
 const purpose=request.headers.get('purpose')||request.headers.get('sec-purpose')||'';
 if(target.tracking&&!purpose.includes('prefetch')&&!/bot|crawler|spider|preview/i.test(request.headers.get('user-agent')||''))await recordClick(product,target.kind).catch(()=>{});
 return new Response(null,{status:302,headers:{...headers,Location:target.url}});
 }catch{return new Response('This store link is temporarily unavailable. Please return to the product page.',{status:503,headers});}
}
export async function HEAD(_request:Request,{params}:{params:Promise<{store:string;slug:string}>}){
 const {store,slug}=await params;if(!validStore(store))return new Response(null,{status:404});
 const product=await getProductBySlugOrId(slug,store);if(!product)return new Response(null,{status:404});
 try{const target=await destination(product);return new Response(null,{status:302,headers:{Location:target.url,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});}catch{return new Response(null,{status:503});}
}
