'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Grid2X2,ChevronDown,ArrowRight} from 'lucide-react';
import {CATEGORIES} from '@/lib/constants/categories';
const categories=[['face-makeup','Face'],['lip-makeup','Lips'],['eye-makeup','Eyes'],['cheeks','Cheeks'],['nails','Nails'],['tools-and-brushes','Tools'],['makeup-kits','Kits'],['makeup-remover','Removers']];
export default function CategoryNavigation({mobileOpen,onNavigate}:{mobileOpen:boolean;onNavigate:()=>void}){
 const [active,setActive]=useState<string|null>(null),root=useRef<HTMLElement>(null),pathname=usePathname();
 useEffect(()=>{if(!active)return;function outside(e:PointerEvent){if(!root.current?.contains(e.target as Node))setActive(null);}function escape(e:KeyboardEvent){if(e.key==='Escape'){const trigger=root.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]');setActive(null);trigger?.focus();}}document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[active]);
 function close(){setActive(null);onNavigate();}
 function toggle(key:string){setActive(current=>current===key?null:key);}
 return <nav ref={root} className={'market-nav shop-navigation'+(mobileOpen?' market-nav--open':'')} aria-label="Main navigation"><div className="shop-navigation__bar">
  <button className="category-menu-trigger" aria-expanded={active==='all'} aria-controls="category-mega-menu" onClick={()=>toggle('all')}><Grid2X2 size={17}/>All categories<ChevronDown size={14}/></button>
  <div className="shop-navigation__links"><Link href="/products" onClick={close} aria-current={pathname==='/products'?'page':undefined}>All makeup</Link>
   {categories.map(([slug,label])=>{const category=CATEGORIES.find(c=>c.slug===slug)!;return <div key={slug} className="nav-category" onMouseEnter={()=>{if(window.matchMedia('(hover:hover)').matches)setActive(slug);}} onMouseLeave={e=>{if(!e.currentTarget.contains(document.activeElement))setActive(current=>current===slug?null:current);}}>
    <div className="nav-category__label"><Link href={'/categories/'+slug} onClick={close} aria-current={pathname.startsWith('/categories/'+slug)?'page':undefined}>{label}</Link><button aria-label={'Show '+label+' subcategories'} aria-expanded={active===slug} aria-controls={'nav-'+slug} onClick={e=>{if(e.detail>0&&window.matchMedia('(hover:hover)').matches)setActive(slug);else toggle(slug);}}><ChevronDown size={12}/></button></div>
    {active===slug&&<div id={'nav-'+slug} className="nav-subcategories"><p>{category.name}</p>{category.subcategories.map(sub=><Link key={sub.slug} href={'/categories/'+slug+'/'+sub.slug} onClick={close}>{sub.name}</Link>)}<Link className="nav-subcategories__all" href={'/categories/'+slug} onClick={close}>View all {label.toLowerCase()}<ArrowRight size={12}/></Link></div>}
   </div>;})}
   <Link href="/compare-products" onClick={close}>Compare products</Link><Link href="/brands" onClick={close}>Brands</Link><Link href="/deals" onClick={close}>Deals</Link>
  </div>
 </div>{active==='all'&&<div id="category-mega-menu" className="category-mega-menu"><div className="category-mega-menu__heading"><div><p>EXPLORE MAKEUP</p><strong>Find your next favourite</strong></div><Link href="/categories" onClick={close}>View all categories<ArrowRight size={14}/></Link></div><div className="category-mega-menu__grid">{CATEGORIES.map(category=><section key={category.slug}><Link className="category-mega-menu__title" href={'/categories/'+category.slug} onClick={close}>{category.name}<ArrowRight size={13}/></Link>{category.subcategories.map(sub=><Link key={sub.slug} href={'/categories/'+category.slug+'/'+sub.slug} onClick={close}>{sub.name}</Link>)}</section>)}</div></div>}</nav>;
}
