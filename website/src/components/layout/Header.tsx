'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter,usePathname} from 'next/navigation';
import BrandMark from '@/components/ui/BrandMark';
import CategoryNavigation from './CategoryNavigation';
import {catalogUrl} from '@/lib/utils/catalog-urls';
import {Search,Menu,X,Tags,TrendingDown} from 'lucide-react';
export default function Header(){
 const [term,setTerm]=useState(''),[open,setOpen]=useState(false);const router=useRouter(),pathname=usePathname();
 if(pathname.startsWith('/admin'))return null;
 function search(e:FormEvent){e.preventDefault();if(term.trim()){router.push(catalogUrl('/search',{q:term.trim()}));setOpen(false);}}
 return <header className="market-header"><div className="market-header__utility"><div><p>Compare beauty prices across your favourite stores</p><Link href="/price-drops">Latest price drops</Link></div></div>
 <div className="market-header__main"><BrandMark priority/>
 <form onSubmit={search} role="search" className="market-search"><label htmlFor="site-search" className="sr-only">Search makeup</label><input id="site-search" type="search" value={term} onChange={e=>setTerm(e.target.value)} placeholder="Search for makeup, brands or products"/><button aria-label="Search"><Search size={21}/></button></form>
 <Link href="/price-drops" className="market-header__shortcut"><TrendingDown size={21}/><span>Price drops</span></Link><Link href="/deals" className="market-header__shortcut"><Tags size={21}/><span>Best deals</span></Link>
 <button className="market-header__menu" onClick={()=>setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}>{open?<X/>:<Menu/>}</button></div>
 <CategoryNavigation mobileOpen={open} onNavigate={()=>setOpen(false)}/></header>;
}
