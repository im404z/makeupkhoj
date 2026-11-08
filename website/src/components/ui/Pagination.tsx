'use client';
import {catalogUrl} from '@/lib/utils/catalog-urls';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
export default function Pagination({currentPage,totalPages}:{currentPage:number;totalPages:number}){
 const pathname=usePathname(),search=useSearchParams();if(totalPages<=1)return null;
 const href=(page:number)=>{const p=new URLSearchParams(search.toString());if(page===1)p.delete('page');else p.set('page',String(page));return catalogUrl(pathname,p);};
 const pages=[...new Set([1,...Array.from({length:Math.min(5,totalPages)},(_,i)=>Math.min(Math.max(1,currentPage-2),Math.max(1,totalPages-4))+i),totalPages])].filter(p=>p<=totalPages);
 return <nav className="catalog-pagination" aria-label="Product pagination">{currentPage>1?<Link href={href(currentPage-1)} rel="prev" aria-label="Previous page"><ChevronLeft size={15}/></Link>:<span aria-disabled="true"><ChevronLeft size={15}/></span>}{pages.map((page,i)=><span key={page} className="pagination-unit">{i>0&&page>pages[i-1]+1&&<span>…</span>}<Link href={href(page)} aria-current={currentPage===page?'page':undefined}>{page}</Link></span>)}{currentPage<totalPages?<Link href={href(currentPage+1)} rel="next" aria-label="Next page"><ChevronRight size={15}/></Link>:<span aria-disabled="true"><ChevronRight size={15}/></span>}</nav>;
}
