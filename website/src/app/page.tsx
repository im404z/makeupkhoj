import HeroBanner from '@/components/home/HeroBanner';
import CategoryGrid from '@/components/home/CategoryGrid';
import CategoryBanners from '@/components/home/CategoryBanners';
import PopularCollection from '@/components/home/PopularCollection';
import BrandStrip from '@/components/home/BrandStrip';
import ProductGrid from '@/components/product/ProductGrid';
import SectionHeading from '@/components/ui/SectionHeading';
import { queryProducts } from '@/lib/utils/products';
export const revalidate = 60;
export default async function HomePage() {
  const [popular, face, lips, eyes, budget, newest] = await Promise.all([
    queryProducts({limit:10,sort:'popular'}),
    queryProducts({limit:10,category:'Face',sort:'popular'}),
    queryProducts({limit:10,category:'Lip',sort:'popular'}),
    queryProducts({limit:10,category:'Eye',sort:'popular'}),
    queryProducts({limit:5,maxPrice:500,sort:'popular'}),
    queryProducts({limit:5,sort:'newest'}),
  ]);
  return <div>
    <HeroBanner/>
    <CategoryGrid/>
    <PopularCollection collections={[
      {label:'All makeup',products:popular.products,href:'/products'},
      {label:'Face',products:face.products,href:'/categories/face-makeup'},
      {label:'Lips',products:lips.products,href:'/categories/lip-makeup'},
      {label:'Eyes',products:eyes.products,href:'/categories/eye-makeup'},
    ]}/>
    <CategoryBanners/>
    {budget.products.length>0&&<section className="store-section"><SectionHeading eyebrow="Good beauty, considered budgets" title="Great makeup under ₹500" href="/products?maxPrice=500" linkText="Shop the budget edit"/><ProductGrid products={budget.products}/></section>}
    <BrandStrip/>
    {newest.products.length>0&&<section className="store-section"><SectionHeading eyebrow="Fresh in the collection" title="New arrivals to explore" href="/products?sort=newest" linkText="See what's new"/><ProductGrid products={newest.products}/></section>}
  </div>;
}
