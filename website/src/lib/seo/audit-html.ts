import {hasCatalogFilters,searchValues} from '@/lib/utils/catalog-urls';
import { load } from 'cheerio';
export type AuditCheck={name:string;status:'pass'|'warning'|'error';detail:string};
export type PageAudit={path:string;status:number;title:string;canonical:string;schemas:string[];indexable?:boolean;checks:AuditCheck[]};

export function auditHtml(path:string,html:string,status:number):PageAudit{
  const $=load(html),checks:AuditCheck[]=[];
  const check=(name:string,ok:boolean,detail:string,warning=false)=>checks.push({name,status:ok?'pass':warning?'warning':'error',detail});
  const title=$('title').text().trim(),canonical=$('link[rel="canonical"]').attr('href')||'';
  check('HTTP response',status===200,`HTTP ${status}`);
  check('Unique title',$('title').length===1&&!!title&&title.split('MakeupKhoj').length<=2,title||'Missing title');
  check('Title length',title.length<=75&&title.length>=10,`${title.length} characters`,true);
  const description=$('meta[name="description"]').attr('content')||'';
  check('Meta description',!!description,description||'Missing description');
  check('Description length',description.length>=50&&description.length<=180,`${description.length} characters`,true);
  check('One rendered H1',$('h1').length===1,`${$('h1').length} H1 headings`);
  check('Canonical URL',$('link[rel="canonical"]').length===1&&/^https?:\/\//.test(canonical),canonical||'Missing canonical');
  const requested=new URL(path,'http://audit.local');
  const robots=$('meta[name="robots"]').attr('content')||'';
  const indexable=!/noindex/i.test(robots);
  const filtered=requested.pathname==='/search'||hasCatalogFilters(requested.pathname,searchValues(requested.searchParams));
  if(filtered)check('Filtered URL indexing',!indexable&&/follow/.test(robots),'Search and filter combinations use noindex, follow');
  const page=requested.searchParams.get('page');
  if(page&&Number(page)>1)check('Pagination canonical',new URL(canonical||'http://missing').searchParams.get('page')===page,'Each unfiltered paginated page needs its own canonical');
  check('Social sharing metadata',!!$('meta[property="og:title"]').attr('content')&&!!$('meta[property="og:description"]').attr('content')&&!!$('meta[property="og:image"]').attr('content'),'Open Graph title, description and image');
  const schemas=new Set<string>(),nodes:any[]=[];let valid=true;
  function walk(v:any){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}if(v['@type']){for(const type of [v['@type']].flat())schemas.add(type);nodes.push(v);}for(const child of Object.values(v))if(child&&typeof child==='object')walk(child);}
  $('script[type="application/ld+json"]').each((_,el)=>{try{walk(JSON.parse($(el).text()));}catch{valid=false;}});
  check('Valid JSON-LD',valid&&schemas.size>0,[...schemas].join(', ')||'No schema found');
  check('Organization and website schema',schemas.has('Organization')&&schemas.has('WebSite'),'Site identity in server-rendered JSON-LD');
  const isProduct=path.startsWith('/product/')||path.startsWith('/products/'),isCollection=/^\/(products(?:\?|$)|categories\/|brands\/|deals|trending|new-arrivals|price-drops)/.test(path);
  if(isProduct){check('Product schema',schemas.has('Product'),'Product structured data present');check('Recorded product offer',nodes.some(n=>n['@type']==='Offer'&&Number(n.price)>0&&n.priceCurrency==='INR'),'Positive recorded offer price in INR',true);}
  if(isCollection){check('Collection schema',schemas.has('CollectionPage')&&schemas.has('ItemList'),'CollectionPage and ItemList in HTML');check('Server-rendered products',$('article.product-card').length>0,`${$('article.product-card').length} rendered product cards`,true);}
  if(path.startsWith('/brands/'))check('Brand schema',schemas.has('Brand'),'Collection identifies the real brand');
  if(path!=='/')check('Breadcrumb schema',schemas.has('BreadcrumbList'),'BreadcrumbList present',true);
  const imageCount=$('img').length,missingAlt=$('img').toArray().filter(el=>$(el).attr('alt')===undefined).length;
  check('Image alternative text',missingAlt===0,`${imageCount} images; ${missingAlt} missing alt attributes`);
  const next=$('a[aria-label="Next page"]');
  if(next.length)check('Crawlable pagination',!!next.attr('href'),'Next page is an HTML link');
  check('HTML language',!!$('html').attr('lang'),$('html').attr('lang')||'Missing lang');
  return {path,status,title,canonical,schemas:[...schemas],indexable,checks};
}
