import {CATEGORIES} from '@/lib/constants/categories';
import SectionHeading from '@/components/ui/SectionHeading';
import CategoryBannerCard from '@/components/ui/CategoryBannerCard';
export default function CategoryGrid(){return <section className="store-section category-shop category-shop--banners" aria-label="Shop by category"><SectionHeading title="Shop by category" href="/categories" linkText="View all categories"/><div className="category-banner-grid">{CATEGORIES.map(category=><CategoryBannerCard key={category.slug} category={category}/>)}</div></section>;}
