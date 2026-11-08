import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';
import sharp from 'sharp';
const sources=[
 ['maybelline','Maybelline New York','https://www.maybelline.co.in/'],
 ['loreal','L’Oréal Paris','https://www.lorealparis.co.in/'],
 ['lakme','Lakmé','https://www.lakmeindia.com/'],
 ['nyx','NYX Professional Makeup','https://www.nyxcosmetics.com/'],
 ['elf','e.l.f. Cosmetics','https://www.elfcosmetics.com/'],
 ['swiss-beauty','Swiss Beauty','https://swissbeauty.in/'],
 ['mac','M.A.C','https://www.maccosmetics.in/'],
 ['sugar','SUGAR Cosmetics','https://www.sugarcosmetics.com/'],
 ['charlotte-tilbury','Charlotte Tilbury','https://www.charlottetilbury.com/'],
 ['makeup-revolution','Makeup Revolution','https://www.revolutionbeauty.com/'],
 ['insight','Insight Cosmetics','https://insightcosmetics.in/'],
 ['pac','PAC','https://www.paccosmetics.com/'],
 ['nars','NARS','https://www.narscosmetics.com/'],
 ['forever52','Daily Life Forever52','https://www.forever52.in/'],
 ['benefit','Benefit Cosmetics','https://www.benefitcosmetics.com/'],
 ['mars','MARS','https://marscosmetics.in/'],
 ['kay-beauty','Kay Beauty','https://www.kaybeauty.com/'],
 ['dior','Dior','https://www.dior.com/en_in/beauty'],
 ['colorbar','Colorbar','https://www.colorbarcosmetics.com/'],
 ['blue-heaven','Blue Heaven','https://www.blueheavencosmetics.in/'],
];
const dir=path.resolve('public/assets/brands');fs.mkdirSync(dir,{recursive:true});
const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const fetchAsset=async url=>{const r=await fetch(url,{headers:{'User-Agent':ua},signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error(`HTTP ${r.status}`);return r;};
const manifest=[];
async function processBrand([id,name,website]){
 const entry={id,name,website,status:'unavailable'};
 try{
  const r=await fetchAsset(website),html=await r.text(),$=load(html),candidates=[];
  $('img').each((_,el)=>{const img=$(el),src=img.attr('src')||img.attr('data-src')||'',alt=img.attr('alt')||'',context=(img.attr('class')||'')+' '+(img.parent().attr('class')||'');
    if(!src||src.startsWith('data:'))return;
    let score=0;if(/logo/i.test(src))score+=5;if(/logo/i.test(alt))score+=5;if(/header.*logo|logo.*header/i.test(context))score+=6;if(img.closest('header').length)score+=5;
    if(/footer|payment|trust|shipping|sale|icon|mobile-menu/i.test(src))score-=5;
    if(score>3)candidates.push({url:new URL(src,r.url).href,score,alt});
  });
  candidates.sort((a,b)=>b.score-a.score);
  for(const candidate of candidates.slice(0,8)){
   try{const asset=await fetchAsset(candidate.url),bytes=Buffer.from(await asset.arrayBuffer());if(bytes.length>2000000)continue;
    const meta=await sharp(bytes).metadata();if(!meta.width||!meta.height||meta.width<40||meta.height<12)continue;
    await sharp(bytes).resize({width:500,height:180,fit:'inside',withoutEnlargement:true}).png().toFile(path.join(dir,id+'.png'));
    Object.assign(entry,{status:'downloaded',asset:'/assets/brands/'+id+'.png',sourceUrl:candidate.url,sourceAlt:candidate.alt,width:meta.width,height:meta.height});break;
   }catch{}
  }
  if(entry.status!=='downloaded')entry.candidates=candidates.slice(0,3);
 }catch(e){entry.error=e.message;}
 manifest.push(entry);console.log(JSON.stringify({id,status:entry.status,error:entry.error}));
}
for(let i=0;i<sources.length;i+=5)await Promise.all(sources.slice(i,i+5).map(processBrand));
manifest.sort((a,b)=>sources.findIndex(s=>s[0]===a.id)-sources.findIndex(s=>s[0]===b.id));
fs.writeFileSync(path.join(dir,'sources.json'),JSON.stringify(manifest,null,2));
