import fs from 'node:fs';
import { load } from 'cheerio';
import sharp from 'sharp';
const dir='public/assets/brands/';
const manifest=JSON.parse(fs.readFileSync(dir+'sources.json','utf8'));
const fetchResource=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'}});if(!r.ok)throw Error('HTTP '+r.status);return r;};
async function save(entry,bytes,sourceUrl){
 const meta=await sharp(bytes,{density:180}).metadata();if(!meta.width||meta.width<30||!meta.height||meta.height<10)throw Error('Invalid logo dimensions');
 await sharp(bytes,{density:180}).resize({width:500,height:180,fit:'inside',withoutEnlargement:true}).png().toFile(dir+entry.id+'.png');
 const {data,info}=await sharp(dir+entry.id+'.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});let light=0,count=0,transparent=0;
 for(let i=0;i<data.length;i+=4){if(data[i+3]<10){transparent++;continue;}light+=(data[i]+data[i+1]+data[i+2])/3;count++;}
 Object.assign(entry,{status:'downloaded',asset:'/assets/brands/'+entry.id+'.png',sourceUrl,dark:transparent>info.width*info.height*.03&&light/count>190});
 delete entry.error;delete entry.candidates;
}
async function complete(entry){
 try{
  if(entry.status==='downloaded'){
   if(/\.svg(?:\?|$)/i.test(entry.sourceUrl)){const r=await fetchResource(entry.sourceUrl);await save(entry,Buffer.from(await r.arrayBuffer()),entry.sourceUrl);}return;
  }
  const r=await fetchResource(entry.website),html=await r.text(),$=load(html),candidates=[];
  $('img,source').each((_,el)=>{const node=$(el);const src=[node.attr('data-src'),node.attr('src'),node.attr('srcset')?.split(',')[0]?.trim().split(/\s+/)[0]].find(v=>v&&!v.startsWith('data:'));if(!src)return;const descriptor=src+' '+node.attr('alt')+' '+node.attr('class')+' '+node.parent().attr('class');if(/logo/i.test(descriptor))candidates.push(new URL(src,r.url).href);});
  $('script[type="application/ld+json"]').each((_,el)=>{try{const walk=v=>{if(!v||typeof v!=='object')return;if(v.logo){const url=typeof v.logo==='string'?v.logo:v.logo.url;if(url)candidates.unshift(new URL(url,r.url).href);}Object.values(v).filter(x=>x&&typeof x==='object').forEach(walk);};walk(JSON.parse($(el).text()));}catch{}});
  const svgs=[];
  $('svg').each((_,el)=>{const svg=$(el),context=[svg.attr('class'),svg.attr('id'),svg.parent().attr('class'),svg.parent().attr('aria-label'),svg.parent().attr('title')].join(' ');if(/logo/i.test(context)&&svg.find('path,text').length){svg.attr('xmlns','http://www.w3.org/2000/svg');svg.find('script,foreignObject,iframe,image,use').remove();svgs.push($.html(el));}});
  for(const svg of svgs){try{await save(entry,Buffer.from(svg),entry.website+'#inline-logo');console.log(entry.id+': inline official logo');return;}catch{}}
  for(const url of [...new Set(candidates)].slice(0,10)){try{const asset=await fetchResource(url);await save(entry,Buffer.from(await asset.arrayBuffer()),url);console.log(entry.id+': official image');return;}catch{}}
  console.log(entry.id+': unavailable');
 }catch(e){console.log(entry.id+': '+e.message);}
}
for(let i=0;i<manifest.length;i+=5)await Promise.all(manifest.slice(i,i+5).map(complete));
fs.writeFileSync(dir+'sources.json',JSON.stringify(manifest,null,2));
