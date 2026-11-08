import { NextResponse } from 'next/server';
import { COOKIE,sameOrigin,privateJson } from '@/lib/admin/auth';
export async function POST(request:Request){if(!sameOrigin(request))return privateJson({error:'Invalid origin'},403);const response=NextResponse.json({ok:true});response.cookies.set(COOKIE,'',{maxAge:0,path:'/'});return response;}
