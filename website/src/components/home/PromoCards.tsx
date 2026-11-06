import Image from 'next/image';
import Link from 'next/link';

const promotions = [
  { href: '/deals', image: 'top-makeup-deals.jpg', label: 'Top makeup deals today - shop deals' },
  { href: '/new-arrivals', image: 'new-arrivals.jpg', label: 'New arrivals - explore the latest makeup' },
  { href: '/price-drops', image: 'price-drop-alerts.jpg', label: 'Price drops - compare current offers' },
];

export default function PromoCards() {
  return <section aria-label="Discover more makeup" className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-3">{promotions.map(p => (
    <Link key={p.href} href={p.href} className="overflow-hidden rounded-2xl border border-pink-100 transition-transform hover:-translate-y-1">
      <Image src={`/assets/banners/${p.image}`} alt={p.label} width={712} height={282} sizes="(max-width: 640px) 100vw, 33vw" className="h-auto w-full" />
    </Link>
  ))}</section>;
}
