'use client';
import { useState, useSyncExternalStore } from 'react';
import { Heart } from 'lucide-react';

function subscribe(callback:()=>void){
  window.addEventListener('storage',callback);
  window.addEventListener('makeupkhoj:saved-products',callback);
  return ()=>{window.removeEventListener('storage',callback);window.removeEventListener('makeupkhoj:saved-products',callback);};
}
export default function SaveProductButton({productKey,name}:{productKey:string;name:string}){
  const key='makeupkhoj:saved:'+productKey;
  const [error,setError]=useState('');
  const saved=useSyncExternalStore(subscribe,()=>{try{return localStorage.getItem(key)==='1';}catch{return false;}},()=>false);
  function toggle(){
    try{if(saved)localStorage.removeItem(key);else localStorage.setItem(key,'1');setError('');window.dispatchEvent(new Event('makeupkhoj:saved-products'));}
    catch{setError('Saving is unavailable in this browser.');}
  }
  return <><button type="button" className="product-card__save" onClick={toggle} aria-pressed={saved}
    aria-label={(saved?'Remove from saved products: ':'Save product: ')+name} title={saved?'Saved on this device':'Save on this device'}>
    <Heart size={20} strokeWidth={1.5} fill={saved?'currentColor':'none'}/>
  </button>{error&&<span role="status" className="sr-only">{error}</span>}</>;
}
