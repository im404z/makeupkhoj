'use client';
import { useState } from 'react';
import Image from 'next/image';
import { Package } from 'lucide-react';

function safeImage(value:string){
  if(value.startsWith('/')&&!value.startsWith('//'))return value;
  try{const url=new URL(value.replace(/^http:\/\//,'https://'));if(url.protocol!=='https:')return '';
    return /(^|\.)(myntassets\.com|flixcart\.com|nykaa\.com)$/.test(url.hostname)||['m.media-amazon.com','images-na.ssl-images-amazon.com','images-eu.ssl-images-amazon.com'].includes(url.hostname)?url.href:'';
  }catch{return '';}
}
export default function ProductImage({src,alt,sizes='(max-width:640px) 50vw,(max-width:1024px) 33vw,(max-width:1150px) 25vw,20vw',priority=false}:{src:string;alt:string;sizes?:string;priority?:boolean}){
  const [failed,setFailed]=useState(''),image=safeImage(src);
  if(!image||failed===image)return <span className="product-image-placeholder"><Package size={30} strokeWidth={1}/><span>Image unavailable</span></span>;
  return <Image src={image} alt={alt} fill sizes={sizes} priority={priority} onError={()=>setFailed(image)}/>;
}
