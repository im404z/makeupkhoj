'use client';
import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {X,ChevronLeft,ChevronRight} from 'lucide-react';
import ProductImage from './ProductImage';
export type MediaImage={src:string;alt:string;caption?:string};
export default function ImageLightbox({items,index,onIndex,onClose}:{items:MediaImage[];index:number;onIndex:(index:number)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),current=items[index]||items[0];
 useEffect(()=>{const previous=document.activeElement as HTMLElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';const element=dialog.current;if(element&&!element.open)element.showModal();return()=>{element?.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
 if(!current)return null;
 const move=(step:number)=>onIndex((index+step+items.length)%items.length);
 return createPortal(<dialog ref={dialog} className="image-lightbox" aria-label="Product image viewer" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const box=e.currentTarget.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)onClose();}}} onKeyDown={e=>{if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}if(e.key==='ArrowRight'){e.preventDefault();move(1);}}}>
  <div className="image-lightbox__content"><header><p>{current.caption||'Product image'}</p><button aria-label="Close image viewer" onClick={onClose} autoFocus><X size={22}/></button></header><div className="image-lightbox__stage"><ProductImage key={current.src} src={current.src} alt={current.alt} sizes="90vw"/>{items.length>1&&<><button className="image-lightbox__previous" aria-label="Previous image" onClick={()=>move(-1)}><ChevronLeft/></button><button className="image-lightbox__next" aria-label="Next image" onClick={()=>move(1)}><ChevronRight/></button></>}</div><footer><p>{current.alt}</p><span aria-live="polite">{index+1} / {items.length}</span></footer></div>
 </dialog>,document.body);
}
