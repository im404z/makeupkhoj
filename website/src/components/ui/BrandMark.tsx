import Link from 'next/link';
import Image from 'next/image';
export default function BrandMark({priority=false}:{priority?:boolean}){return <Link href="/" className="brand-wordmark" aria-label="MakeupKhoj home"><Image src="/branding/makeupkhoj-logo.png" alt="MakeupKhoj" width={1572} height={446} sizes="(max-width:640px) 190px,220px" preload={priority} className="brand-image"/></Link>;}
