import { NextResponse } from 'next/server';
import { credentialsMatch,createSession,COOKIE,MAX_AGE,sameOrigin,privateJson } from '@/lib/admin/auth';
export const runtime='nodejs';
const attempts={count:0,reset:0};
export async function POST(request:Request){
  if(!sameOrigin(request))return privateJson({error:'Invalid origin'},403);
  if(Date.now()>attempts.reset){attempts.count=0;attempts.reset=Date.now()+15*60*1000;}
  if(attempts.count>=20)return privateJson({error:'Too many attempts. Try again in 15 minutes.'},429);
  try{const body=await request.json();if(typeof body.username!=='string'||typeof body.password!=='string'||body.password.length>256)return privateJson({error:'Invalid credentials'},400);
    attempts.count++;
    if(!credentialsMatch(body.username,body.password))return privateJson({error:'Invalid username or password'},401);
    attempts.count=0;
    const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
    response.cookies.set(COOKIE,createSession(),{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production'||new URL(request.url).protocol==='https:',maxAge:MAX_AGE,path:'/'});return response;
  }catch{return privateJson({error:'Login unavailable. Check server admin configuration.'},503);}
}
