import Image from 'next/image';
const files:Record<string,string>={amazon:'amazon.png',flipkart:'flipkart.png',myntra:'myntra.jpg',nykaa:'nykaa.png'};
export default function MarketplaceLogo({store,className=''}:{store:string;className?:string}){return files[store]?<Image src={'/marketplaces/'+files[store]} alt={store==='nykaa'?'Nykaa':store[0].toUpperCase()+store.slice(1)} width={100} height={36} className={'store-logo '+className}/>:<span>{store}</span>;}
