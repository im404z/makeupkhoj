import HeroBanner from '@/components/home/HeroBanner';
import CategoryGrid from '@/components/home/CategoryGrid';
import CategoryBanners from '@/components/home/CategoryBanners';
import PopularCollection from '@/components/home/PopularCollection';
import BrandStrip from '@/components/home/BrandStrip';
import ProductGrid from '@/components/product/ProductGrid';
import SectionHeading from '@/components/ui/SectionHeading';
import { queryProducts } from '@/lib/utils/products';
import type { Product } from '@/types/product';

export const revalidate = 60;

const hasValidImage = (p: Product) => Boolean(p.image && p.image.trim());

export default async function HomePage() {
  const [popular, face, lips, eyes, budget, newest] = await Promise.all([
    queryProducts({limit:10,sort:'popular',hasImageOnly:true}),
    queryProducts({limit:10,category:'Face',sort:'popular',hasImageOnly:true}),
    queryProducts({limit:10,category:'Lip',sort:'popular',hasImageOnly:true}),
    queryProducts({limit:10,category:'Eye',sort:'popular',hasImageOnly:true}),
    queryProducts({limit:5,maxPrice:500,sort:'popular',hasImageOnly:true}),
    queryProducts({limit:5,sort:'newest',hasImageOnly:true}),
  ]);

  const popularProducts = popular.products.filter(hasValidImage);
  const faceProducts = face.products.filter(hasValidImage);
  const lipsProducts = lips.products.filter(hasValidImage);
  const eyesProducts = eyes.products.filter(hasValidImage);
  const budgetProducts = budget.products.filter(hasValidImage);
  const newestProducts = newest.products.filter(hasValidImage);

  return <div>
    <HeroBanner/>
    <CategoryGrid/>
    <PopularCollection collections={[
      {label:'All makeup',products:popularProducts,href:'/products'},
      {label:'Face',products:faceProducts,href:'/categories/face-makeup'},
      {label:'Lips',products:lipsProducts,href:'/categories/lip-makeup'},
      {label:'Eyes',products:eyesProducts,href:'/categories/eye-makeup'},
    ]}/>
    <CategoryBanners/>
    {budgetProducts.length>0&&<section className="store-section"><SectionHeading eyebrow="Good beauty, considered budgets" title="Great makeup under ₹500" href="/products?maxPrice=500" linkText="Shop the budget edit"/><ProductGrid products={budgetProducts}/></section>}
    <BrandStrip/>
    {newestProducts.length>0&&<section className="store-section"><SectionHeading eyebrow="Fresh in the collection" title="New arrivals to explore" href="/products?sort=newest" linkText="See what's new"/><ProductGrid products={newestProducts}/></section>}
  </div>;
}
