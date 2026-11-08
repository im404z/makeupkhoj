import Link from 'next/link';
import {ArrowRight} from 'lucide-react';
export default function SectionHeading({eyebrow,title,href,linkText='View all'}:{eyebrow?:string;title:string;href?:string;linkText?:string}){
 return <div className="section-heading"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>{href&&<Link href={href}>{linkText}<ArrowRight size={15}/></Link>}</div>;
}
