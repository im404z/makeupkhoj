import {stripEmoji} from '@/lib/utils/plain-text.mjs';
import {notFound,permanentRedirect} from 'next/navigation';
import Link from 'next/link';
import Breadcrumb from '@/components/layout/Breadcrumb';
import ProductGallery from '@/components/product/ProductGallery';
import PriceDisplay from '@/components/product/PriceDisplay';
import StoreOffer from '@/components/product/StoreOffer';
import MarketplaceLogo from '@/components/ui/MarketplaceLogo';
import {JsonLd} from '@/components/seo/JsonLd';
import {getProductPage} from '@/lib/matching/catalog';
import {constructMetadata} from '@/lib/utils/seo';
import {siteUrl} from '@/lib/utils/sitemaps';
import ProductDataSections from '@/components/product/ProductDataSections';
import {productDetails} from '@/lib/utils/product-details.mjs';
import {formatRating,slugify} from '@/lib/utils/format';
import {CATEGORIES} from '@/lib/constants/categories';
import ProductGrid from '@/components/product/ProductGrid';
import SectionHeading from '@/components/ui/SectionHeading';
import {queryProducts} from '@/lib/utils/products';
import type {Product} from '@/types/product';
export const dynamic='force-dynamic';
type Props={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Props){const data=await getProductPage((await params).slug);if(!data)notFound();return constructMetadata({title:(data.node.displayTitle||data.node.title)+' - compare prices',description:'Compare recorded store offers for '+(data.node.displayTitle||data.offers[0].name)+'. Check the selected variant, availability and latest source prices.',canonical:data.path,ogImage:data.offers[0].image});}
export default async function ComparisonDetail({params}:Props){
 const {slug}=await params,data=await getProductPage(slug);if(!data)notFound();if('/product/'+slug!==data.path)permanentRedirect(data.path);
 const {offers: rawOffers, node} = data;
 const seenStores = new Set<string>();
 const offers = rawOffers.filter((o: any) => {
   const s = String(o.marketplace || o.store || '').toLowerCase();
   if (!s || seenStores.has(s)) return false;
   seenStores.add(s);
   return true;
 });
 const enriched=offers.map((p:any)=>({product:p,details:productDetails(p)})).sort((a:any,b:any)=>(b.details.specifications.length+b.details.reviews.length+(b.details.description?20:0))-(a.details.specifications.length+a.details.reviews.length+(a.details.description?20:0)));
 const product=enriched[0].product,details=enriched[0].details,title=stripEmoji(node.displayTitle||node.title),stores=[...new Set(offers.map((o:any)=>o.marketplace))];
 const priced=offers.filter((p:any)=>p.price>0&&p.in_stock!==false),confirmed=priced.filter((p:any)=>p.in_stock===true),best=confirmed[0]||priced[0]||product;
 const images=[...new Set<string>(enriched.flatMap((source:any)=>source.details.images))];
 const customerImages=Array.from(new Map<string,{src:string;store:string}>(enriched.flatMap((s:any)=>s.details.photos.map((src:string)=>[src,{src,store:s.product.marketplace_name||s.product.marketplace}]))).values());
 const categoryKeys:Record<string,string>={face:'face-makeup',lips:'lip-makeup',eyes:'eye-makeup',cheeks:'cheeks',nails:'nails',tools:'tools-and-brushes','makeup kits':'makeup-kits','makeup remover':'makeup-remover'};
 const category=CATEGORIES.find(c=>c.slug===categoryKeys[String(product.sub_category||'').toLowerCase()]);
 const subcategory=category?.subcategories.find(s=>s.slug===slugify(product.sub_sub_category||product.category_name||''));
 const breadcrumbs=[{label:stores.length>1?'Compare products':'Makeup',href:stores.length>1?'/compare-products':'/products'},...(category?[{label:category.name,href:'/categories/'+category.slug}]:[]),...(category&&subcategory?[{label:subcategory.name,href:'/categories/'+category.slug+'/'+subcategory.slug}]:[]),{label:title}];
 const relatedTerm=product.sub_sub_category||product.category_name||product.sub_category;
 const relatedResult=await queryProducts({...(relatedTerm?{sub_category:relatedTerm}:product.brand?{brand:product.brand}:{}),limit:25});
 const currentSources=new Set(offers.map((offer:any)=>offer.marketplace+':'+offer._id)),seenRelated=new Set<string>();
 const related=relatedResult.products.filter((p:Product)=>{const key=p.comparison?.sku||p.marketplace+':'+p._id;if(currentSources.has(p.marketplace+':'+p._id)||key===node._id||seenRelated.has(key))return false;seenRelated.add(key);return true;}).slice(0,5);
 const ratingVal=formatRating(product.rating),ratingCnt=Number(product.rating_count);
 const schemaOffers=offers.filter((p:any)=>p.price>0).map((p:any)=>({'@type':'Offer',price:p.price,priceCurrency:'INR',url:p.url,seller:{'@type':'Organization',name:p.marketplace},itemCondition:'https://schema.org/NewCondition',...(typeof p.in_stock==='boolean'?{availability:'https://schema.org/'+(p.in_stock?'InStock':'OutOfStock')}:{}),hasMerchantReturnPolicy:{'@type':'MerchantReturnPolicy',applicableCountry:'IN',returnPolicyCategory:'https://schema.org/MerchantReturnFiniteReturnWindow',merchantReturnDays:15,returnMethod:'https://schema.org/ReturnByMail',returnFees:'https://schema.org/FreeReturn'},shippingDetails:{'@type':'OfferShippingDetails',shippingRate:{'@type':'MonetaryAmount',value:'0',currency:'INR'},shippingDestination:{'@type':'DefinedRegion',addressCountry:'IN'}}}));
 return <div className="product-detail"><Breadcrumb items={breadcrumbs}/>
  <JsonLd data={{'@context':'https://schema.org','@type':'Product','@id':siteUrl()+data.path,name:title,sku:node._id,image:images,...(details.description?{description:details.description}:{}),additionalProperty:details.facts.map(([name,value]:string[])=>({'@type':'PropertyValue',name,value})),brand:{'@type':'Brand',name:product.brand},...(ratingVal&&ratingCnt>0?{aggregateRating:{'@type':'AggregateRating',ratingValue:Number(ratingVal),ratingCount:ratingCnt,bestRating:5,worstRating:1}}:{}),...(details.reviews?.length>0?{review:details.reviews.slice(0,5).map((r:any)=>({'@type':'Review',author:{'@type':'Person',name:r.author||'Customer'},reviewRating:{'@type':'Rating',ratingValue:Number(formatRating(r.rating))||5,bestRating:5,worstRating:1},reviewBody:r.text||r.title||'Verified customer review',...(r.date?{datePublished:r.date}:{})}))}:{}),...(schemaOffers.length?{offers:{'@type':'AggregateOffer',priceCurrency:'INR',lowPrice:Math.min(...schemaOffers.map((o:any)=>o.price)),highPrice:Math.max(...schemaOffers.map((o:any)=>o.price)),offerCount:schemaOffers.length,offers:schemaOffers}}:{})}}/>
  <div className="product-detail__hero"><ProductGallery images={images} name={title} productKey={node._id} customerImages={customerImages}/><div className="product-detail__summary"><p className="product-detail__brand">{product.brand}</p><h1>{title}</h1>{formatRating(product.rating)&&<a href="#customer-reviews" className="product-detail__rating"><strong>{formatRating(product.rating)} / 5</strong>{Number(product.rating_count)>0?' · '+Number(product.rating_count).toLocaleString('en-IN')+' ratings':''} · {product.marketplace_name||product.marketplace}</a>}<p className="comparison-sku">MakeupKhoj SKU · {node._id}</p>{details.facts.length>0&&<ul className="product-detail__quick-facts">{details.facts.slice(0,5).map(([label,value]:string[])=><li key={label}><small>{label}</small>{value}</li>)}</ul>}<div className="comparison-detail__stores">{stores.map(store=><MarketplaceLogo key={String(store)} store={String(store)}/>)}</div><div className="product-detail__price-summary"><p className="eyebrow">{confirmed.length?'Lowest recorded in-stock offer':priced.length?'Lowest recorded offer · check availability':'Recorded price · check availability'}</p><PriceDisplay price={best.price} mrp={best.mrp} size="large"/><p>Available listings at {stores.length} {stores.length===1?'store':'stores'}</p><a href="#offer-heading" className="action-button">{stores.length>1?'Compare store offers':'See store offer'} ↓</a></div></div>
  <section className="offer-comparison" aria-labelledby="offer-heading"><header><h2 id="offer-heading">{stores.length>1?'Compare prices across stores':'Store offer'}</h2><p>{stores.length} {stores.length===1?'store offer':'store offers'}</p></header>{offers.map((offer:any)=><div key={offer.sourceKey}><StoreOffer product={offer} lowest={offers.length>1&&offer.sourceKey===best.sourceKey&&offer.in_stock===true}/><p className="comparison-offer-date">{offer.price_last_checked||offer.updated_at?'Source checked '+new Date(offer.price_last_checked||offer.updated_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'Price check time unavailable'} · Rating is store-specific{offer.rating?' · '+offer.marketplace+': '+offer.rating+'/5':''}</p></div>)}<p className="offer-comparison__note">Prices are recorded, not guaranteed live. Confirm shade, size, price and availability with the store. We may earn a commission through these links.</p>{data.held>0&&<p className="offer-comparison__note">{data.held} listing(s) held for identity review after source changes.</p>}</section></div>
  <ProductDataSections products={offers} showRelated={related.length>0}/>
  {related.length>0&&<section className="store-section" id="related-products" aria-label="Related products"><SectionHeading eyebrow="You may also like" title="Related products" href={category&&subcategory?'/categories/'+category.slug+'/'+subcategory.slug:category?'/categories/'+category.slug:'/products'} linkText="Explore more"/><ProductGrid products={related}/></section>}
  <section className="comparison-information"><h2>About this comparison</h2><p>{stores.length>1?'These listings were reviewed as the same product variant.':'This listing has its own site SKU. More store offers will appear here when an identical variant is approved.'}</p><Link href="/compare-products">Explore more products →</Link></section>
 </div>;
}
