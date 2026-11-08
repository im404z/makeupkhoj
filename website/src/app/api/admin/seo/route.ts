import { isAdmin,privateJson,sameOrigin } from '@/lib/admin/auth';
import { runAudit,savedAudit } from '@/lib/seo/run-audit';
export const runtime='nodejs';
export const maxDuration=120;
export async function GET(){if(!await isAdmin())return privateJson({error:'Unauthorized'},401);return privateJson({report:savedAudit()});}
export async function POST(request:Request){if(!await isAdmin())return privateJson({error:'Unauthorized'},401);if(!sameOrigin(request))return privateJson({error:'Invalid origin'},403);try{return privateJson({report:await runAudit(request.headers.get('origin')!)});}catch(e){return privateJson({error:(e as Error).message},409);}}
