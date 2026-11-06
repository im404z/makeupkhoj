import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function HeroBanner() {
  return (
    <section className="hero-banner mb-7 overflow-hidden rounded-3xl border border-pink-100 bg-[#fce4ec]">
      <h1 className="sr-only">Find, compare and shop your favourite makeup</h1>
      <Image src="/assets/banners/hero-banner.jpg" alt="Find, compare and shop your favourite makeup across Myntra, Nykaa, Amazon and Flipkart" width={1728} height={768} priority sizes="(max-width: 1280px) 100vw, 1216px" className="h-auto w-full" />
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/65 px-5 py-4 sm:px-8">
        <p className="text-sm text-neutral-600">Your next beauty favourite. A better price.</p>
        <Link href="/products" className="inline-flex items-center gap-2 rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-pink-700">Explore Makeup <ArrowRight size={16} /></Link>
      </div>
    </section>
  );
}
