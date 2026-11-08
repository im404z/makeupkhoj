import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
export interface BreadcrumbItem { label:string; href?:string; }
export default function Breadcrumb({items}:{items:BreadcrumbItem[]}){
  const trail=[{label:'Home',href:'/'},...items.filter(item=>item.label)];
  return <><BreadcrumbJsonLd items={trail.map(item=>({name:item.label,url:item.href||'#'}))}/><nav aria-label="Breadcrumb" className="breadcrumb"><ol>{trail.map((item,index)=><li key={index}>
    {index>0&&<ChevronRight size={12} strokeWidth={1.1} aria-hidden="true"/>}
    {index===trail.length-1?<p aria-current="page" title={item.label}>{item.label}</p>:item.href?<Link href={item.href}>{item.label}</Link>:<p>{item.label}</p>}
  </li>)}</ol></nav></>;
}
