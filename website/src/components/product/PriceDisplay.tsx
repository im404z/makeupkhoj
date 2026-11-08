import {formatPrice} from '@/lib/utils/format';
export default function PriceDisplay({price,mrp,size='compact'}:{price:number;mrp?:number;size?:'compact'|'large'}){
 return <div className={'price-display price-display--'+size}><strong>{price>0?formatPrice(price):'Check store'}</strong>{Number(mrp)>price&&price>0&&<del>{formatPrice(Number(mrp))}</del>}</div>;
}
