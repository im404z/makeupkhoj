import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { auditHtml,type PageAudit } from './audit-html';
import { getAllBrandsList,queryProducts } from '@/lib/utils/products';
const folder=path.join(process.cwd(),' .admin'.trim());
const file=path.join(folder,'seo-audit.json');
export function savedAudit(){return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;}
let running=false;
export async function runAudit(origin:string){
  if(running)throw Error('An SEO audit is already running');
  const host=new URL(origin).hostname;
  const configured=new URL(process.env.NEXT_PUBLIC_SITE_URL||'https://makeupkhoj.com').hostname;
  if(!['localhost','127.0.0.1','[::1]',configured].includes(host))throw Error('Audit origin is not allowed');
  running=true;
  try{
    const [brands,sample]=await Promise.all([getAllBrandsList(),queryProducts({limit:4})]);
    const paths=['/','/products','/products?page=2','/categories','/brands','/deals','/trending','/new-arrivals','/price-drops','/categories/lip-makeup','/categories/face-makeup','/categories/eye-makeup','/categories/lip-makeup/lipstick',...brands.slice(0,2).map(b=>`/brands/${b.slug}`),...sample.products.map(p=>`/product/${p.slug||p.id}`),'/products?marketplace=amazon','/products?minPrice=100&maxPrice=500&sort=price_asc','/categories/lip-makeup/lipstick?marketplace=nykaa','/products?brand=lakme','/search?q=lipstick'];
    const pages:PageAudit[]=[];
    for(let i=0;i<paths.length;i+=3){
      const group=await Promise.all(paths.slice(i,i+3).map(async p=>{try{const r=await fetch(new URL(p,origin),{headers:{'User-Agent':'Googlebot'},cache:'no-store',signal:AbortSignal.timeout(45000)});return auditHtml(p,await r.text(),r.status);}catch(e){return {path:p,status:0,title:'',canonical:'',schemas:[],checks:[{name:'Fetch',status:'error' as const,detail:(e as Error).message}]};}}));
      pages.push(...group);
    }
    const titles=new Map<string,string>();
    for(const page of pages){if(page.indexable===false)continue;if(titles.has(page.title)&&page.title)page.checks.push({name:'Duplicate title',status:'error',detail:`Same title as ${titles.get(page.title)}`});titles.set(page.title,page.path);}
    const summary={pages:pages.length,errors:pages.flatMap(p=>p.checks).filter(c=>c.status==='error').length,warnings:pages.flatMap(p=>p.checks).filter(c=>c.status==='warning').length};
    const report={checkedAt:new Date().toISOString(),summary,pages,note:'Local technical HTML/schema checks. This does not query Google Search Console or certify rich-result eligibility.'};
    fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2));return report;
  }finally{running=false;}
}
