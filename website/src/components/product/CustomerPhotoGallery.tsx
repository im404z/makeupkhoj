'use client';
import {useState} from 'react';
import dynamic from 'next/dynamic';
import ProductImage from './ProductImage';

const ImageLightbox = dynamic(() => import('./ImageLightbox'), { ssr: false });
export default function CustomerPhotoGallery({photos,name,store}:{photos:string[];name:string;store:string}){
 const [active,setActive]=useState<number|null>(null),items=photos.map((src,i)=>({src,alt:name+' - customer photo '+(i+1),caption:'Customer photo · '+store}));
 return <><div className="product-data__photos">{items.map((photo,i)=><button type="button" key={photo.src} aria-label={'Open '+store+' customer photo '+(i+1)} onClick={()=>setActive(i)}><ProductImage src={photo.src} alt={photo.alt} sizes="110px" quality={60}/></button>)}</div>{active!==null&&<ImageLightbox items={items} index={active} onIndex={setActive} onClose={()=>setActive(null)}/>}</>;
}
