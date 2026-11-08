import {isAdmin,privateJson} from '@/lib/admin/auth';
import {catalogDB} from '@/lib/matching/catalog';
import {root,liveMembers,groupPath} from '@/lib/matching/engine.mjs';
import {merchantUrl} from '@/lib/affiliate-links';
export async function GET(request:Request){
 if(!await isAdmin())return privateJson({error:'Unauthorized'},401);
 const sku=(new URL(request.url).searchParams.get('sku')||'').toUpperCase();if(!/^MK-[A-F0-9]{24}$/.test(sku))return privateJson({error:'Enter a valid MakeupKhoj SKU'},400);
 const db=await catalogDB(),node=await root(db,sku);if(!node)return privateJson({error:'SKU not found'},404);
 const rows=await liveMembers(db,node._id);
 return privateJson({sku:node._id,title:node.displayTitle||node.title,path:groupPath(node),members:rows.map((s:any)=>({_id:s._id,title:s.title,store:s.store,suspended:s.suspended,changed:s.changed,url:merchantUrl(s.doc.url,s.store)||''}))});
}
