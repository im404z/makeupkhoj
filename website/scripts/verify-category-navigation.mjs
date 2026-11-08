import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {CATEGORY_LEAVES} from '../src/lib/constants/category-leaves.ts';

const origin=process.env.CATEGORY_TEST_URL||'http://127.0.0.1:7858';
async function check(path,category,active=''){
  const response=await fetch(origin+path,{headers:{'User-Agent':'Googlebot'},signal:AbortSignal.timeout(90000)});
  assert.equal(response.status,200,path);
  const $=load(await response.text()),nav=$('.category-browser__links');
  assert.equal(nav.length,1,path);
  assert(nav.find('a').length>1,path+' has data-backed subcategories');
  const allowed=new Set(['',...CATEGORY_LEAVES[category].map(item=>item.slug)]);
  let sum=0;
  nav.find('a').each((index,element)=>{
    const link=$(element),url=new URL(link.attr('href'),origin),slug=url.pathname.split('/')[3]||'';
    assert(allowed.has(slug),'Unexpected subcategory: '+url.pathname);
    const count=Number(link.find('small').text().replaceAll(',',''));
    assert(count>0,'Empty subcategory link');
    if(index)sum+=count;
    assert.equal(url.searchParams.has('page'),false,'Navigation must reset pagination');
  });
  assert.equal(Number(nav.find('a').first().find('small').text().replaceAll(',','')),sum,'Parent count must equal distinct children');
  const selected=new URL(nav.find('[aria-current="page"]').attr('href'),origin);
  assert.equal(selected.pathname,'/categories/'+category+(active?'/'+active:''));
  assert($('.catalog-results .product-card').length>0,path+' must have products');
  if(path.includes('marketplace=nykaa'))nav.find('a').each((_,el)=>assert.equal(new URL($(el).attr('href'),origin).searchParams.get('marketplace'),'nykaa'));
  console.log('PASS '+path+' ('+(nav.find('a').length-1)+' subcategories)');
}
const tasks=Object.keys(CATEGORY_LEAVES).map(category=>()=>check('/categories/'+category,category));
tasks.push(()=>check('/categories/face-makeup/foundation?marketplace=nykaa','face-makeup','foundation'));
tasks.push(()=>check('/categories/lip-makeup/lip-tint','lip-makeup','lip-tint'));
tasks.push(()=>check('/categories/eye-makeup/eyebrow-pencil','eye-makeup','eyebrow-pencil'));
for(let i=0;i<tasks.length;i+=2)await Promise.all(tasks.slice(i,i+2).map(task=>task()));
for(const path of ['/categories/makeup-kits/bridal-kit','/categories/tools-and-brushes/foundation-brush']){
  const response=await fetch(origin+path,{redirect:'manual',headers:{'User-Agent':'Googlebot'}});
  assert.equal(response.status,308,path);
  assert.equal(response.headers.get('location'),path.split('/').slice(0,3).join('/'));
  console.log('PASS legacy redirect '+path);
}
