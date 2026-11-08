import fs from 'node:fs';
import { load } from 'cheerio';
import sharp from 'sharp';
const dir='public/assets/brands/',manifest=JSON.parse(fs.readFileSync(dir+'sources.json'));
const sources=[
 {id:'nyx',url:'https://www.loreal.com/en/consumer-products-division/nyx-professional-makeup/',match:/nyx/i},
 {id:'benefit',url:'https://www.lvmh.com/en/our-maisons/perfumes-cosmetics/benefit-cosmetics',match:/benefit/i},
 {id:'dior',url:'https://www.lvmh.com/en/our-maisons/perfumes-cosmetics/parfums-christian-dior',match:/dior/i},
 {id:'blue-heaven',url:'https://openstrategy.design/work/blue-heaven',match:/blue.?heaven/i},
 {id:'charlotte-tilbury',url:'https://commons.wikimedia.org/wiki/File:CharlotteTilbury_logo.svg',match:/CharlotteTilbury_logo\.svg/i,license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',author:'Charlotte Tilbury'},
];
async function get(url){const r=await fetch(url,{headers:{'User-Agent':'MakeupKhoj asset preparation (logo attribution stored with assets)'},signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error('HTTP '+r.status);return r;}
for(const item of sources){
 const entry=manifest.find(e=>e.id===item.id);if(entry.status==='downloaded')continue;
 try{
  const response=await get(item.url),html=await response.text(),$=load(html),candidates=[];
  $('img').each((_,el)=>{const img=$(el),src=img.attr('src')||img.attr('data-src')||'',alt=img.attr('alt')||'';if(!src||src.startsWith('data:'))return;const text=src+' '+alt;if(item.match.test(text)){let score=/logo/i.test(text)?10:0;if(img.closest('header').length)score-=4;if(/icon|brand.?mark|wordmark/i.test(text))score+=5;candidates.push({url:new URL(src,item.url).href,score,alt});}});
  if(item.id==='charlotte-tilbury')$('a.internal').each((_,el)=>{const href=$(el).attr('href');if(href&&href.endsWith('.svg'))candidates.unshift({url:new URL(href,item.url).href,score:100,alt:'Charlotte Tilbury logo'});});
  candidates.sort((a,b)=>b.score-a.score);
  for(const candidate of candidates.slice(0,6)){
   try{const r=await get(candidate.url),bytes=Buffer.from(await r.arrayBuffer()),meta=await sharp(bytes,{density:180}).metadata();if(!meta.width||meta.width<50||!meta.height||meta.height>meta.width)continue;
    // Company/agency pages can also contain campaign photography; only accept
    // explicitly identified logos, not arbitrary images of a brand campaign.
    if(item.id!=='charlotte-tilbury'&&candidate.score<5)continue;
    await sharp(bytes,{density:180}).resize({width:500,height:180,fit:'inside'}).png().toFile(dir+item.id+'.png');
    Object.assign(entry,{status:'downloaded',asset:'/assets/brands/'+item.id+'.png',sourceUrl:candidate.url,sourcePage:item.url,sourceAlt:candidate.alt,dark:false,...(item.license?{license:item.license,licenseUrl:item.licenseUrl,author:item.author,modifications:'Rasterized and resized for web presentation'}:{})});
    delete entry.error;delete entry.candidates;break;
   }catch{}
  }
  console.log(item.id+': '+entry.status);
 }catch(e){console.log(item.id+': '+e.message);}
}
fs.writeFileSync(dir+'sources.json',JSON.stringify(manifest,null,2));
