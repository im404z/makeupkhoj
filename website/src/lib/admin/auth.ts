import 'server-only';
import { createHmac, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import { cookies } from 'next/headers';
export const COOKIE='mk_admin';
export const MAX_AGE=60*60*8;
function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function config(){const user=process.env.ADMIN_USERNAME,password=process.env.ADMIN_PASSWORD,secret=process.env.ADMIN_SESSION_SECRET;if(!user||!password||!secret||secret.length<32)throw Error('Admin credentials are not configured');return {user,password,secret};}
export function credentialsMatch(user:string,password:string){const c=config();const key=scryptSync(password,c.secret,32),expected=scryptSync(c.password,c.secret,32);return equal(user,c.user)&&timingSafeEqual(key,expected);}
export function createSession(){const c=config();const payload=Buffer.from(JSON.stringify({user:c.user,expires:Date.now()+MAX_AGE*1000,nonce:randomBytes(16).toString('hex')})).toString('base64url');return payload+'.'+createHmac('sha256',c.secret+c.password).update(payload).digest('base64url');}
export function verifySession(token:string){try{const c=config();const [payload,signature]=token.split('.');if(!payload||!signature)return false;const expected=createHmac('sha256',c.secret+c.password).update(payload).digest('base64url');if(!equal(signature,expected))return false;const session=JSON.parse(Buffer.from(payload,'base64url').toString());return session.user===c.user&&session.expires>Date.now();}catch{return false;}}
export async function isAdmin(){return verifySession((await cookies()).get(COOKIE)?.value||'');}
export function sameOrigin(request:Request){try{const origin=new URL(request.headers.get('origin')||'');return origin.host===(request.headers.get('host')||new URL(request.url).host)&&origin.protocol===new URL(request.url).protocol;}catch{return false;}}
export function privateJson(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
