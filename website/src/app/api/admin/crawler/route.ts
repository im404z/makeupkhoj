import { isAdmin,sameOrigin,privateJson } from '@/lib/admin/auth';
import { crawlerStatus,launchCrawler } from '@/lib/admin/crawler';
export const runtime='nodejs';
export async function GET(){if(!await isAdmin())return privateJson({error:'Unauthorized'},401);try{return privateJson(crawlerStatus());}catch{return privateJson({error:'Could not read crawler state'},500);}}
export async function POST(request:Request){if(!await isAdmin())return privateJson({error:'Unauthorized'},401);if(!sameOrigin(request))return privateJson({error:'Invalid origin'},403);try{return privateJson({job:launchCrawler(await request.json())},202);}catch(e){return privateJson({error:e instanceof Error?e.message:'Could not launch crawler'},409);}}
