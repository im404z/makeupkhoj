import {load} from 'cheerio';
import {stripEmoji} from './plain-text.mjs';
const placeholder=/^(?:not available|not applicable|n\/?a|none|null|undefined|unknown|[-–\u2014])$/i;
export function text(value){
 if(value===null||value===undefined)return '';
 if(typeof value==='boolean')return value?'Yes':'No';
 if(typeof value!=='string'&&typeof value!=='number')return '';
 const raw=String(value).trim();if(!raw||placeholder.test(raw))return '';
 const $=load(raw);$('script,style,iframe,form,button').remove();$('br').replaceWith('\n');$('p,li,div').append('\n');
 return stripEmoji($.root().text()).replace(/\u2014/g,'-').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim();
}
const list=value=>Array.isArray(value)?value.map(text).filter(Boolean):text(value)?[text(value)]:[];
const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const numeric=value=>{const n=Number(String(value??'').replace(/,/g,''));return Number.isFinite(n)?n:null;};
const key=value=>String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
export function galleryImages(product){
 const seen=new Set(),images=[];const main=String(product.high_res_image||product.image||'');
 const prefix=url=>{try{return new URL(url).pathname.split('/').at(-1).split(/(?:-resized)?-original-/)[0];}catch{return '';}};
 const mainPrefix=prefix(main);
 for(const raw of [main,product.image,...(Array.isArray(product.images)?product.images:[])]){
  if(typeof raw!=='string')continue;let u;try{u=new URL(raw.replace(/^http:\/\//,'https://'));}catch{continue;}if(u.protocol!=='https:')continue;
  // Flipkart's crawler also collected recommendation images: retain selected-product filename variants only.
  if(product.marketplace==='flipkart'&&raw!==main&&raw!==product.image&&(!mainPrefix||mainPrefix.length<12||prefix(u.href)!==mainPrefix))continue;
  const identity=u.origin+u.pathname;if(seen.has(identity))continue;seen.add(identity);images.push(u.href);
 }return images;
}
export function productDetails(product){
 const p=record(product),specs=new Map();
 const add=(label,value)=>{const clean=text(value),id=key(label);if(!clean||!id||specs.has(id)||id==='salespackage'&&clean==='0')return;specs.set(id,{label:text(label),value:clean});};
 for(const [label,value] of Object.entries(record(p.specifications)))add(label,value);
 for(const [label,value] of Object.entries(record(p.specsTable)))add(label,value);
 for(const values of Object.values(record(p.specifications_grouped)))for(const [label,value] of Object.entries(record(values)))add(label,value);
 const get=(...labels)=>labels.map(label=>specs.get(key(label))?.value).find(Boolean)||'';
 const facts=[['Shade',text(p.shade)||get('Brand Color','Shade')],['Colour',get('Color','Colour')],['Size',text(p.pack_size||p.size)||get('Net Quantity')],['Formula',text(p.formulation)||get('Form','Formulation','Item Form')],['Finish',text(p.finish)||get('Finish')],['Skin type',list(p.skin_type).join(', ')||get('Skin Type')],['Coverage',text(p.coverage)||get('Coverage')],['SPF',text(p.spf)||get('SPF','Sun Protection')],['Country of origin',text(p.country_of_origin)||get('Country of Origin')]];
 for(const [label,value] of [['Brand',p.brand],['Model',p.model_name],['Gender',p.gender],['Manufacturer',p.manufacturer],['Expiry',p.expiry_date]])add(label,value);
 for(const [label,value] of facts)if(value)add(label,value);
 const reviews=[],reviewKeys=new Set();
 for(const r of [...(Array.isArray(p.reviews)?p.reviews:[]),...(Array.isArray(p.user_reviews)?p.user_reviews:[])]){
  const body=text(r.text||r.review||r.comment||r.reviewText),rating=numeric(r.rating),author=text(r.author||r.userName||r.reviewerName)||'Store customer';if(!body||rating!==null&&(rating<1||rating>5))continue;
  const id=key(author+body+r.date);if(reviewKeys.has(id))continue;reviewKeys.add(id);
  reviews.push({author,text:body,title:text(r.title),date:text(r.date),rating,verified:r.verifiedPurchase===true||r.verified===true,likes:numeric(r.likes)});
 }
 const photos=[...new Set([...(Array.isArray(p.customer_photos)?p.customer_photos:[]),...[...(Array.isArray(p.reviews)?p.reviews:[]),...(Array.isArray(p.user_reviews)?p.user_reviews:[])].flatMap(r=>[...(Array.isArray(r.photos)?r.photos:[]),...(Array.isArray(r.images)?r.images:[])])])].filter(v=>typeof v==='string'&&/^https?:\/\//.test(v));
 const highlights=[...list(p.features),...list(p.key_features),...list(p.benefits)];
 if(Array.isArray(p.highlights))highlights.push(...list(p.highlights));else for(const [label,value] of Object.entries(record(p.highlights))){const v=text(value);if(v)highlights.push(text(label)+': '+v);}
 const description=text(p.description||p.description_html||p.product_description);
 const seller=record(p.seller_info),sellerFacts=[['Seller',text(seller.name||p.seller_name||p.sellerName||p.seller)],['Seller rating',text(seller.rating)],['Experience',text(seller.experience)],['Delivery estimate at last check',text(p.delivery_date)],['Returns',text(p.return_policy)],['Authenticity',text(p.authenticity_badge)],['Store assurance',p.is_f_assured===true?'Flipkart Assured':'']].filter(([,v])=>v);
 const policies=[...new Set(list(p.policies))];
 const sizes=(Array.isArray(p.sizes)?p.sizes:[]).map(s=>({name:text(s.size||s.name),selected:s.selected===true,available:typeof s.available==='boolean'?s.available:null})).filter(s=>s.name);
 const variants=(Array.isArray(p.variants)?p.variants:[]).map(v=>({name:text(v.name||v.shade||v.pack_size||v.size),size:text(v.pack_size||v.size),price:numeric(v.price),available:typeof v.in_stock==='boolean'?v.in_stock:null})).filter(v=>v.name);
 const history=(Array.isArray(p.price_history)?p.price_history:[]).map(h=>({date:text(h.timestamp||h.date),price:numeric(h.price),oldPrice:numeric(h.old_price)})).filter(h=>h.price!==null&&h.price>0).slice(-30).reverse();
 const content=[['Ingredients',p.ingredients||get('Ingredients','Composition')],['How to use',p.how_to_use||p.howToUse],['Care instructions',p.care_instructions]].map(([label,value])=>({label,text:list(value).join('\n')})).filter(s=>s.text);
 const breakdown=Object.entries(record(p.rating_breakdown)).map(([k,v])=>({rating:Number(k.match(/[1-5]/)?.[0]),count:typeof v==='object'?numeric(v?.count):numeric(v)})).filter(v=>v.rating>=1&&v.rating<=5&&v.count!==null&&v.count>=0).sort((a,b)=>b.rating-a.rating);
 return {facts:facts.filter(([,v])=>v),specifications:[...specs.values()],description,highlights:[...new Set(highlights)],featuresLoved:[...new Set(list(p.features_loved))],reviews,photos,sellerFacts,policies,sizes,variants,history,content,breakdown,offers:list(p.offers?.map?.(o=>typeof o==='string'?o:o.description||o.title||o.text)||[]),rating:numeric(p.rating),ratingCount:numeric(p.rating_count??p.ratingsCount),reviewCount:numeric(p.reviews_count??p.review_count),lowest:numeric(p.lowest_recorded_price),highest:numeric(p.highest_recorded_price),images:galleryImages(p)};
}
