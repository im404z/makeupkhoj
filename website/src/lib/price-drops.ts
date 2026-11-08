import 'server-only';
import {cache} from 'react';
import {adminDB} from './admin/data';
export const DEFAULT_PRICE_DROPS={enabled:true,windowHours:24,maxProducts:100,perPage:25};
export function validatePriceDropSettings(input:Record<string,unknown>){
  if(typeof input.enabled!=='boolean')throw Error('Enabled must be true or false');
  const number=(key:string,min:number,max:number)=>{const n=input[key];if(typeof n!=='number'||!Number.isInteger(n)||n<min||n>max)throw Error(`${key} must be between ${min} and ${max}`);return n;};
  return {enabled:input.enabled,windowHours:number('windowHours',1,720),maxProducts:number('maxProducts',1,10000),perPage:number('perPage',5,100)};
}
export const getPriceDropSettings=cache(async()=>{
  const row=await (await adminDB()).collection('site_settings').findOne({_id:'price-drops'} as any);
  return {...DEFAULT_PRICE_DROPS,...Object.fromEntries(Object.keys(DEFAULT_PRICE_DROPS).filter(k=>row?.[k]!==undefined).map(k=>[k,row![k]]))} as typeof DEFAULT_PRICE_DROPS;
});
export async function savePriceDropSettings(input:Record<string,unknown>){const settings=validatePriceDropSettings(input);await (await adminDB()).collection('site_settings').updateOne({_id:'price-drops'} as any,{$set:{...settings,updatedAt:new Date()}},{upsert:true});return settings;}
