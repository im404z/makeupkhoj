import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Product } from '@/types/product';
import { formatRating,formatPrice } from '@/lib/utils/format';
import MarketplaceLogo from '@/components/ui/MarketplaceLogo';
import ProductImage from './ProductImage';
import SaveProductButton from './SaveProductButton';
import PriceDisplay from './PriceDisplay';

export default function ProductCard({ product,comparison:providedComparison }: { product: Product; comparison?:{href:string;sku:string;stores:string[];syncedAt?:string;priceStore?:string} }) {
  const comparison=providedComparison||product.comparison;
  const name = product.name || product.title || 'Makeup';
  const href = comparison?.href || '/product/' + (product.slug || product.id);
  const rating = formatRating(product.rating);
  const count = Number(product.rating_count);
  const price = Number(product.price);
  const mrp = Number(product.mrp);
  const recordedDiscount = Number(product.discount_percentage);
  const discount = Math.max(0, Math.min(100, Math.round(recordedDiscount > 0 ? recordedDiscount : price > 0 && mrp > price ? (mrp-price)/mrp*100 : 0)));

  return <article className="product-card">
    <div className="product-card__visual">
      <Link href={href} className="product-card__image" aria-label={'View ' + name}>
        <ProductImage src={product.high_res_image || product.image || ''} alt={name}/>
      </Link>
      {discount > 0 && <span className="product-card__badge">{discount}% OFF</span>}
      <SaveProductButton productKey={comparison?.sku||product.marketplace+':'+(product.id||product._id)} name={name}/>
    </div>
    <div className="product-card__body">
      <p className="product-card__brand">{product.brand || 'Beauty'}</p>
      <Link href={href}><h3 className="product-card__title" title={name}>{name}</h3></Link>
      <div className="product-card__rating">
        {comparison?<span className="comparison-card__summary">{comparison.stores.length>1?comparison.stores.length+' stores · '+(comparison.priceStore?'price at '+comparison.priceStore:'matched variant'):'Single-store listing'}</span>:rating ? <><strong>{rating} / 5</strong>{Number.isFinite(count)&&count>0&&<span>({count.toLocaleString('en-IN')} {count===1?'rating':'ratings'})</span>}</> : <span>Explore product details</span>}
      </div>
      <PriceDisplay price={price} mrp={mrp}/>
      {product.price_drop&&Number(product.price_drop_amount)>0&&<p className="text-xs text-green-800 my-2">Down {formatPrice(product.price_drop_amount)} from {formatPrice(product.price_drop.previous)} at {product.marketplace}</p>}
      <div className={"product-card__footer"+(comparison?" product-card__footer--comparison":"")}>
        <span className={'product-card__store'+(comparison?' comparison-card__stores':'')}>{comparison?comparison.stores.map(store=><MarketplaceLogo key={store} store={store}/>):<MarketplaceLogo store={product.marketplace}/>}</span>
        <Link href={href} className="product-card__offer">{comparison&&comparison.stores.length===1?'View offer':'Compare prices'} <ArrowUpRight size={17} strokeWidth={1.5}/></Link>
      </div>
    </div>
  </article>;
}
