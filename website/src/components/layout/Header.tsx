"use client";
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Search, Menu, X } from 'lucide-react';
const links = [['Categories', '/categories'], ['Brands', '/brands'], ['Offers', '/deals'], ['Price Drops', '/price-drops'], ['New Arrivals', '/new-arrivals']];
export default function Header() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  function search(e: FormEvent) {
    e.preventDefault();
    if (term.trim()) { router.push(`/search?q=${encodeURIComponent(term.trim())}`); setOpen(false); }
  }
  return <header className="border-b border-pink-100 bg-white/95">
    <div className="bg-[#fbeaf0] px-4 py-2 text-center text-[11px] font-medium tracking-wide text-pink-800">A little beauty. A smarter buy. Compare your favourites across stores.</div>
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex h-20 items-center justify-between gap-5">
        <Link href="/" aria-label="MakeupKhoj home" className="shrink-0"><span className="text-3xl font-extrabold tracking-tighter">Makeup<span className="text-pink-600">Khoj</span></span><span className="mt-0.5 block text-[10px] tracking-widest text-neutral-500">DISCOVER · COMPARE · SHOP</span></Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">{links.map(([label, href]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} className={`text-sm font-medium hover:text-pink-600 ${pathname === href ? 'text-pink-600' : 'text-neutral-700'}`}>{label}</Link>)}</nav>
        <Link href="/trending" className="hidden text-xs font-semibold text-pink-600 lg:block">Trending ↗</Link>
        <button type="button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-lg p-2 md:hidden">{open ? <X /> : <Menu />}</button>
      </div>
      <form onSubmit={search} role="search" className="relative mx-auto mb-5 max-w-3xl">
        <label htmlFor="site-search" className="sr-only">Search products or brands</label>
        <Search size={19} className="absolute left-4 top-3.5 text-pink-500" />
        <input id="site-search" type="search" value={term} onChange={e => setTerm(e.target.value)} placeholder="Search for lipsticks, foundations, brands…" className="h-12 w-full rounded-xl border border-pink-200 bg-[#fffbfc] pl-12 pr-24 text-sm outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-100" />
        <button className="absolute bottom-1 right-1 top-1 rounded-lg bg-pink-600 px-5 text-sm font-semibold text-white hover:bg-pink-700">Search</button>
      </form>
      {open && <nav aria-label="Mobile navigation" className="mb-4 grid grid-cols-2 gap-2 border-t border-pink-100 pt-4 md:hidden">{links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm hover:bg-pink-50">{label}</Link>)}</nav>}
    </div>
  </header>;
}
