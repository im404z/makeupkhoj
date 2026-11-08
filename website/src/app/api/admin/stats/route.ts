import { isAdmin,privateJson } from '@/lib/admin/auth';
import { marketplaceStats } from '@/lib/admin/data';
export const runtime='nodejs';
export async function GET(){if(!await isAdmin())return privateJson({error:'Unauthorized'},401);try{return privateJson({marketplaces:await marketplaceStats(),checkedAt:new Date().toISOString()});}catch{return privateJson({error:'Could not read marketplace counts. Check MongoDB connection.'},503);}}
