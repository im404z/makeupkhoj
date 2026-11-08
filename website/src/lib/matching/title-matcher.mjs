import {createHash} from 'node:crypto';
export const MATCH_VERSION='title-v1';
export const STORES=['amazon','flipkart','myntra','nykaa'];
export const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases={'maybelline new york':'maybelline','l oreal paris':'loreal','loreal paris':'loreal','lakme absolute':'lakme','m a c':'mac','swiss beauty cosmetics':'swiss beauty'};
export const brandKey=value=>aliases[normalize(value)]||normalize(value);
const stop=new Set('a an the for with and of to in by new makeup cosmetics cosmetic long lasting waterproof smudgeproof sponsored ad original professional all skin types'.split(' '));
export function identity(doc){
 const raw=String(doc.title||doc.name||'').replace(/^sponsored\s*(?:ad)?\s*[-:]/i,'');
 const title=normalize(raw),brand=brandKey(doc.brand);
 const quantities=[];
 const unitPattern=/(\d+(?:\.\d+)?)\s*(ml|millilit(?:re|er)s?|lit(?:re|er)s?|l|mg|milligrams?|kg|kilograms?|g|gm|gms|grams?)\b/gi;
 for(const match of (raw+' '+(doc.pack_size||doc.size||'')).matchAll(unitPattern)){
  const unit=match[2].toLowerCase();let n=Number(match[1]),u=/^(ml|millilit)/.test(unit)?'ml':/^(l|lit)/.test(unit)?'ml':'g';
  if(/^(l|lit|kg|kilo)/.test(unit))n*=1000;if(/^(mg|milli)/.test(unit)&&u==='g')n/=1000;
  quantities.push(Number(n.toFixed(4))+u);
 }
 const quantity=[...new Set(quantities)].sort().join('+');
 const pack=raw.match(/(?:pack|set)\s*(?:of\s*)?(\d+)/i)?.[1]||raw.match(/(\d+)\s*(?:pcs|pieces)\b/i)?.[1]||'';
 const spf=raw.match(/\bspf\s*[-:]?\s*(\d+)/i)?.[1]||String(doc.spf||'').match(/\d+/)?.[0]||'';
 const shade=normalize(doc.shade).replace(/^(shade|color|colour) /,'');
 const codes=[...new Set((normalize(raw.replace(unitPattern,' ')).match(/\b\d+[a-z]?\b/g)||[]))].sort().join(' ');
 const types=['foundation','concealer','lipstick','eyeliner','kajal','mascara','blush','primer','powder','remover','brush','palette','fixer','spray','gloss','tint'];
 const type=types.find(t=>title.split(' ').includes(t))||'';
 const tokenTitle=normalize(raw.replace(unitPattern,' '))+' '+quantity;
 const tokens=[...new Set(tokenTitle.split(' ').filter(t=>t.length>1&&!stop.has(t)&&!normalize(doc.brand).split(' ').includes(t)))];
 return {title,raw,brand,quantity,pack,spf,shade,codes,type,tokens,finish:normalize(doc.finish),formulation:normalize(doc.formulation)};
}
export function fingerprint(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export function compareIdentity(a,b){
 const conflicts=[],missing=[];
 for(const key of ['brand','quantity','pack','spf','shade','type','finish','formulation']){
  if(a[key]&&b[key]&&a[key]!==b[key])conflicts.push(key+': '+a[key]+' ≠ '+b[key]);
  else if(Boolean(a[key])!==Boolean(b[key]))missing.push(key);
 }
 const A=new Set(a.tokens),B=new Set(b.tokens),common=[...A].filter(t=>B.has(t));
 const overlap=common.length/Math.max(1,Math.min(A.size,B.size));
 const jaccard=common.length/Math.max(1,new Set([...A,...B]).size);
 const exact=a.title===b.title;
 const score=Math.round(100*(.55*jaccard+.35*overlap+.1*(a.brand&&a.brand===b.brand?1:0)));
 if(a.codes&&b.codes&&a.codes!==b.codes)missing.push('different numeric title tokens');
 if(!a.shade||!b.shade)missing.push('shade not verified on both listings');
 if(!a.quantity||!b.quantity)missing.push('quantity not verified on both listings');
 if(!a.pack||!b.pack)missing.push('pack count not explicit on both listings');
 return {score,exact,common,conflicts,missing,band:conflicts.length?'conflict':exact?'exact title':score>=80?'strong suggestion':'needs review',version:MATCH_VERSION};
}
