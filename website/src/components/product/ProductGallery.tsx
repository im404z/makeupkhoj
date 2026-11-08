'use client';
import { useState } from 'react';
import ProductImage from './ProductImage';
import SaveProductButton from './SaveProductButton';
import ImageLightbox from './ImageLightbox';

export default function ProductGallery({images,name,productKey,customerImages=[]}:{images:string[];name:string;productKey:string;customerImages?:Array<{src:string;store:string}>}){
  const [active,setActive]=useState(0),[popup,setPopup]=useState<number|null>(null);
  const media=[...images.map((src,i)=>({src,alt:name+' - product image '+(i+1),caption:'Product image'})),...customerImages.map((p,i)=>({src:p.src,alt:name+' - customer photo '+(i+1),caption:'Customer photo · '+p.store}))];
  return <div className="product-gallery">
    <div className="product-gallery__main">
      <button className="product-gallery__zoom" aria-label={'Open image gallery for '+name} onClick={()=>setPopup(Math.min(active,Math.max(0,images.length-1)))} disabled={!images.length}><ProductImage src={images[active]||images[0]||''} alt={name} sizes="(max-width:800px) 100vw, 45vw" priority/></button>
      <SaveProductButton name={name} productKey={productKey}/>
    </div>
    {images.length>1&&<div className="product-gallery__thumbnails" aria-label="Product images">
      {images.map((image,index)=><button key={image} onClick={()=>{setActive(index);setPopup(index);}} aria-pressed={active===index} aria-label={`View product image ${index+1}`}>
        <ProductImage src={image} alt={`${name}, image ${index+1}`} sizes="80px"/>
      </button>)}
    </div>}
    {customerImages.length>0&&<section className="product-gallery__customers" aria-label="Customer photos below product gallery"><h2>Customer photos <small>({customerImages.length})</small></h2><div>{customerImages.map((photo,i)=><button key={photo.src} onClick={()=>setPopup(images.length+i)} aria-label={'Open '+photo.store+' customer photo '+(i+1)}><ProductImage src={photo.src} alt={photo.store+' customer photo '+(i+1)} sizes="90px"/></button>)}</div></section>}
    {popup!==null&&<ImageLightbox items={media} index={popup} onIndex={setPopup} onClose={()=>setPopup(null)}/>}
  </div>;
}
