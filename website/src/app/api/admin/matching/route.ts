import {isAdmin,sameOrigin,privateJson} from '@/lib/admin/auth';
import {matchingState,matchingAction} from '@/lib/admin/matching';
import {invalidateComparisonListings} from '@/lib/matching/catalog';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request:Request){
 if(!await isAdmin())return privateJson({error:'Unauthorized'},401);
 const p=new URL(request.url).searchParams,status=p.get('status')||'pending',page=Math.max(1,Math.floor(Number(p.get('page'))||1));
 if(!['pending','approved','rejected'].includes(status))return privateJson({error:'Invalid status'},400);
 try{return privateJson(await matchingState(status,page,p.get('kind')||'all',p.get('store')||'all'));}catch{return privateJson({error:'Could not load matching catalogue'},500);}
}
export async function POST(request:Request){
 if(!await isAdmin())return privateJson({error:'Unauthorized'},401);
 if(!sameOrigin(request))return privateJson({error:'Invalid origin'},403);
 try{const result=await matchingAction(await request.json());invalidateComparisonListings();return privateJson(result);}catch(e){return privateJson({error:e instanceof Error?e.message:'Catalogue action failed'},409);}
}
