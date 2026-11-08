import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import SectionHeading from '@/components/ui/SectionHeading';
import { BRAND_SPOTLIGHTS } from '@/lib/constants/featured-brands';
import { getAllBrandsList } from '@/lib/utils/products';
import { slugify } from '@/lib/utils/format';
import sources from '../../../public/assets/brands/sources.json';

type LogoSource = { id:string;status:string;asset?:string;dark?:boolean };
export default async function BrandStrip() {
  const catalog = await getAllBrandsList();
  return <section className="store-section brand-showcase">
    <SectionHeading eyebrow="The labels you love" title="Shop trusted brands" href="/brands" linkText="The brand directory"/>
    <p className="brand-showcase__intro">From everyday favourites to a little indulgence. Find the brands you know, and a few worth discovering.</p>
    <div className="brand-logo-grid">
      {BRAND_SPOTLIGHTS.map(brand => {
        const logo = (sources as LogoSource[]).find(s=>s.id===brand.id&&s.status==='downloaded');
        const entry = catalog.find(b=>brand.aliases.some(alias=>slugify(alias)===b.slug));
        const href = entry?'/brands/'+entry.slug:'/search?q='+encodeURIComponent(brand.name);
        return <Link key={brand.id} href={href} className="brand-logo-card" aria-label={'Explore '+brand.name}>
          <div className="brand-logo-card__mark">
            {logo?.asset?<Image src={logo.asset} alt={brand.name+' logo'} width={240} height={90} className={logo.dark?'brand-logo-card__image brand-logo-card__image--light':'brand-logo-card__image'}/>:<span className="brand-logo-card__wordmark">{brand.name}</span>}
          </div>
          <div className="brand-logo-card__caption"><span>{brand.name}</span><ArrowUpRight size={13} strokeWidth={1.3}/></div>
        </Link>;
      })}
    </div>
    <div className="brand-showcase__footer"><span>One place to explore. Four stores to compare. <a href="/assets/brands/sources.json" className="brand-showcase__credits">Logo credits</a></span><Link href="/brands">Find your favourite brand <ArrowUpRight size={14}/></Link></div>
  </section>;
}
