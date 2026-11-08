import { notFound, permanentRedirect } from 'next/navigation';
import { getProductBySlugOrId } from '@/lib/utils/products';
export default async function LegacyProduct({params}:{params:Promise<{slug:string;id:string}>}){
 const {id}=await params;
 const product=await getProductBySlugOrId(id,'nykaa');
 if(!product)notFound();
 permanentRedirect('/product/'+product.slug);
}
