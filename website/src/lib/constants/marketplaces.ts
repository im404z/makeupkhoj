export interface MarketplaceMeta {
  id: 'nykaa' | 'amazon' | 'flipkart' | 'myntra' | 'tatacliq';
  name: string;
  color: string;
  bgColor: string;
  badgeBg: string;
  tagline: string;
  deliveryDays: string;
}

export const MARKETPLACES: Record<string, MarketplaceMeta> = {
  nykaa: {
    id: 'nykaa',
    name: 'Nykaa',
    color: '#FC2779',
    bgColor: '#FFF0F5',
    badgeBg: 'bg-pink-100 text-pink-700 border-pink-200',
    tagline: '100% Authentic Beauty',
    deliveryDays: '2-4 Days',
  },
  amazon: {
    id: 'amazon',
    name: 'Amazon',
    color: '#FF9900',
    bgColor: '#FFF8F0',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
    tagline: 'Fast Prime Delivery',
    deliveryDays: '1-2 Days',
  },
  flipkart: {
    id: 'flipkart',
    name: 'Flipkart',
    color: '#2874F0',
    bgColor: '#F0F5FF',
    badgeBg: 'bg-blue-100 text-blue-700 border-blue-200',
    tagline: 'Assured Value & Deals',
    deliveryDays: '2-5 Days',
  },
  myntra: {
    id: 'myntra',
    name: 'Myntra',
    color: '#FF3F6C',
    bgColor: '#FFF0F3',
    badgeBg: 'bg-rose-100 text-rose-700 border-rose-200',
    tagline: 'Trending Fashion & Beauty',
    deliveryDays: '2-4 Days',
  },
  tatacliq: {
    id: 'tatacliq',
    name: 'Tata CLiQ',
    color: '#9C27B0',
    bgColor: '#FAF0FF',
    badgeBg: 'bg-purple-100 text-purple-700 border-purple-200',
    tagline: 'Luxury & Authenticity',
    deliveryDays: '3-5 Days',
  },
};

export const FEATURED_BRANDS = [
  'Maybelline New York',
  'L\'Oréal Paris',
  'Lakmé',
  'NYX Professional Makeup',
  'e.l.f. Cosmetics',
  'Swiss Beauty',
  'M.A.C',
  'SUGAR Cosmetics',
  'Charlotte Tilbury',
  'Makeup Revolution',
  'Insight Cosmetics',
  'PAC',
  'NARS',
  'Daily Life Forever52',
  'Benefit Cosmetics',
  'MARS',
  'Kay Beauty',
  'Dior',
  'Colorbar',
  'Blue Heaven',
];

export const MAKEUP_LOOKS = [
  {
    title: 'Bridal Look',
    description: 'Long-lasting high-coverage glamour for your big day',
    image: '/assets/looks/bridal-look.jpg',
    category: 'face-makeup',
    tag: 'Bridal Glow',
  },
  {
    title: 'Natural Look',
    description: 'No-makeup makeup with dewy skin and fresh tint',
    image: '/assets/looks/natural-look.jpg',
    category: 'face-makeup',
    tag: 'Clean Girl',
  },
  {
    title: 'Korean Look',
    description: 'Glass skin, puppy liner and gradient popsicle lips',
    image: '/assets/looks/korean-look.jpg',
    category: 'lip-makeup',
    tag: 'K-Beauty',
  },
  {
    title: 'Glam Look',
    description: 'Bold lips, smokey eyes and sculpted cheekbones',
    image: '/assets/looks/glam-look.jpg',
    category: 'cheeks',
    tag: 'Night Out',
  },
  {
    title: 'Office Look',
    description: 'Effortless, polished and smudge-free professional finish',
    image: '/assets/looks/office-look.jpg',
    category: 'face-makeup',
    tag: 'Work Wear',
  },
  {
    title: 'Party Look',
    description: 'Glitter eyes, highlighter pop and transfer-proof lips',
    image: '/assets/looks/party-look.jpg',
    category: 'eye-makeup',
    tag: 'Party Ready',
  },
];

