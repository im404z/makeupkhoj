import { createProductSlug } from '@/lib/utils/format';
export function buyPath(product:{marketplace:string;slug?:string;id:string;name:string;brand?:string}) {
 const slug=product.slug&&/^[-a-zA-Z0-9_]+$/.test(product.slug)?product.slug:createProductSlug(product);
 return '/buy/'+encodeURIComponent(product.marketplace)+'/'+encodeURIComponent(slug);
}
export function externalUrl(value:unknown){try{const u=new URL(String(value));if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname)||u.hostname.includes(':'))return '';return u.href;}catch{return '';}}
export function merchantUrl(value:unknown,store:string){const safe=externalUrl(value);if(!safe)return '';const u=new URL(safe);const domain:Record<string,string>={amazon:'amazon.in',flipkart:'flipkart.com',myntra:'myntra.com',nykaa:'nykaa.com'};return domain[store]&&(u.hostname===domain[store]||u.hostname.endsWith('.'+domain[store]))?safe:'';}
export function amazonLink(value:string,tag:string){const u=new URL(value);u.searchParams.delete('tag');u.searchParams.delete('linkCode');u.searchParams.set('tag',tag);return u.href;}
