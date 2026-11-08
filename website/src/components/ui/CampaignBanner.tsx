import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
interface Props {title:string;description:string;image:string;eyebrow?:string;href?:string;action?:string;variant?:'hero'|'catalog';}
export default function CampaignBanner({title,description,image,eyebrow,href,action='Explore makeup',variant='catalog'}:Props){
 return <section className={'campaign-banner campaign-banner--'+variant}>
  <div className="campaign-banner__copy">{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p>{href&&<Link href={href} className="action-button">{action}<ArrowRight size={16}/></Link>}</div>
  <div className="campaign-banner__image"><Image src={image} alt="Makeup essentials and beauty inspiration" fill priority={variant==='hero'} sizes={variant==='hero'?'(max-width:640px) 100vw, 55vw':'(max-width:640px) 40vw, 35vw'} className="object-cover"/></div>
 </section>;
}
