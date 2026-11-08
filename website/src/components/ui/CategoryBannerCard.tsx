import Link from 'next/link';
import Image from 'next/image';
import {ArrowUpRight} from 'lucide-react';
import type {CategoryInfo} from '@/types/product';
const descriptions:Record<string,string>={'lip-makeup':'Lipsticks, gloss & more','face-makeup':'Foundation & concealer','eye-makeup':'Kajal, mascara & palettes',cheeks:'Blush & highlighter','makeup-kits':'Your makeup essentials','tools-and-brushes':'Brushes, blenders & tools',nails:'Colour & nail essentials','makeup-remover':'Balms, cleansers & more'};
export default function CategoryBannerCard({category}:{category:CategoryInfo}){
 return <Link href={'/categories/'+category.slug} className="category-photo-card category-banner-card"><div className="category-banner-card__copy"><h3>{category.name}</h3><p>{descriptions[category.slug]||'Explore the collection'}</p><span className="category-banner-card__action">Explore<ArrowUpRight size={14}/></span></div><div className="category-banner-card__art"><Image src={'/assets/categories/shop-'+category.slug+'.webp'} alt={category.name+' product collection'} fill sizes="(max-width:640px) 40vw,(max-width:1024px) 25vw,15vw"/></div></Link>;
}
