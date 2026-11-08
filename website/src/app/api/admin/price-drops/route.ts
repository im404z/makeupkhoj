import {isAdmin,sameOrigin,privateJson} from '@/lib/admin/auth';
import {getPriceDropSettings,savePriceDropSettings} from '@/lib/price-drops';
export const runtime='nodejs';
export async function GET(){if(!await isAdmin())return privateJson({error:'Unauthorized'},401);return privateJson({settings:await getPriceDropSettings()});}
export async function POST(request:Request){
  if(!await isAdmin())return privateJson({error:'Unauthorized'},401);
  if(!sameOrigin(request))return privateJson({error:'Invalid origin'},403);
  try{return privateJson({settings:await savePriceDropSettings(await request.json())});}
  catch(e){return privateJson({error:e instanceof Error?e.message:'Could not save settings'},400);}
}
