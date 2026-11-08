import {ArrowUpRight} from 'lucide-react';
import MarketplaceLogo from '@/components/ui/MarketplaceLogo';
import {buyPath,merchantUrl} from '@/lib/affiliate-links';
import {formatPrice} from '@/lib/utils/format';
import type {Product} from '@/types/product';
export default function StoreOffer({product,lowest=false}:{product:Product;lowest?:boolean}){
 const valid=!!merchantUrl(product.url,product.marketplace);
 return <div className={'store-offer'+(lowest?' store-offer--lowest':'')}>
  <div className="store-offer__identity"><MarketplaceLogo store={product.marketplace}/><p>{product.in_stock===true?'In stock':product.in_stock===false?'Out of stock':'Check availability'}</p></div>
  <div className="store-offer__price"><strong>{Number(product.price)>0?formatPrice(Number(product.price)):'Check store'}</strong>{lowest&&<p>Lowest recorded</p>}</div>
  {valid?<a href={buyPath(product)} target="_blank" rel="nofollow sponsored noopener noreferrer" className="action-button" aria-label={'View '+product.marketplace+' offer for '+product.name}>View offer<ArrowUpRight size={15}/></a>:<p className="text-xs">Link unavailable</p>}
 </div>;
}
