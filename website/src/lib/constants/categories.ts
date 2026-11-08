import type { CategoryInfo } from '@/types/product';
import { CATEGORY_LEAVES } from './category-leaves';

export const CATEGORIES: CategoryInfo[] = [
  {
    slug: 'lip-makeup',
    name: 'Lip Makeup',
    image: '/assets/categories/shop-lip-makeup.webp',
    description: 'Discover lipsticks, lip glosses, lip liners and liquid lip colours from top brands with best price comparisons.',
    subcategories: [
      { slug: 'lipstick', name: 'Lipstick', parent: 'lip-makeup' },
      { slug: 'liquid-lipstick', name: 'Liquid Lipstick', parent: 'lip-makeup' },
      { slug: 'lip-gloss', name: 'Lip Gloss', parent: 'lip-makeup' },
      { slug: 'lip-liner', name: 'Lip Liner', parent: 'lip-makeup' },
      { slug: 'lip-balm', name: 'Lip Balm', parent: 'lip-makeup' },
      { slug: 'lip-tint', name: 'Lip Tint & Stain', parent: 'lip-makeup' },
    ],
  },
  {
    slug: 'face-makeup',
    name: 'Face Makeup',
    image: '/assets/categories/shop-face-makeup.webp',
    description: 'Find foundations, concealers, primers, compact powders and setting sprays for flawless everyday and glam looks.',
    subcategories: [
      { slug: 'foundation', name: 'Foundation', parent: 'face-makeup' },
      { slug: 'concealer', name: 'Concealer', parent: 'face-makeup' },
      { slug: 'primer', name: 'Primer', parent: 'face-makeup' },
      { slug: 'compact-powder', name: 'Compact Powder', parent: 'face-makeup' },
      { slug: 'bb-cc-cream', name: 'BB & CC Cream', parent: 'face-makeup' },
      { slug: 'setting-spray', name: 'Setting Spray', parent: 'face-makeup' },
      { slug: 'loose-powder', name: 'Loose Powder', parent: 'face-makeup' },
    ],
  },
  {
    slug: 'eye-makeup',
    name: 'Eye Makeup',
    image: '/assets/categories/shop-eye-makeup.webp',
    description: 'Explore mascaras, eyeliners, kajal, eyeshadow palettes and eyebrow products across all major stores.',
    subcategories: [
      { slug: 'eyeliner', name: 'Eyeliner', parent: 'eye-makeup' },
      { slug: 'mascara', name: 'Mascara', parent: 'eye-makeup' },
      { slug: 'kajal', name: 'Kajal', parent: 'eye-makeup' },
      { slug: 'eyeshadow', name: 'Eyeshadow Palette', parent: 'eye-makeup' },
      { slug: 'eyebrow-pencil', name: 'Eyebrow Products', parent: 'eye-makeup' },
      { slug: 'false-eyelashes', name: 'False Eyelashes', parent: 'eye-makeup' },
    ],
  },
  {
    slug: 'cheeks',
    name: 'Cheeks',
    image: '/assets/categories/shop-cheeks.webp',
    description: 'Blush, highlighters, bronzers and contours in liquid, powder and cream finishes at the lowest prices.',
    subcategories: [
      { slug: 'blush', name: 'Blush', parent: 'cheeks' },
      { slug: 'highlighter', name: 'Highlighter', parent: 'cheeks' },
      { slug: 'bronzer', name: 'Bronzer', parent: 'cheeks' },
      { slug: 'contour', name: 'Contour', parent: 'cheeks' },
      { slug: 'face-palette', name: 'Face Palette', parent: 'cheeks' },
    ],
  },
  {
    slug: 'makeup-kits',
    name: 'Makeup Kits',
    image: '/assets/categories/shop-makeup-kits.webp',
    description: 'All-in-one makeup sets, bridal kits, gift sets and travel combos compared across stores.',
    subcategories: [
      { slug: 'bridal-kit', name: 'Bridal Makeup Kit', parent: 'makeup-kits' },
      { slug: 'gift-sets', name: 'Makeup Gift Sets', parent: 'makeup-kits' },
      { slug: 'starter-kits', name: 'Beginner Makeup Kit', parent: 'makeup-kits' },
      { slug: 'combo-packs', name: 'Combos & Palettes', parent: 'makeup-kits' },
    ],
  },
  {
    slug: 'tools-and-brushes',
    name: 'Tools & Brushes',
    image: '/assets/categories/shop-tools-and-brushes.webp',
    description: 'Professional makeup brush sets, beauty sponges, eyelash curlers and applicators.',
    subcategories: [
      { slug: 'brush-sets', name: 'Brush Sets', parent: 'tools-and-brushes' },
      { slug: 'foundation-brush', name: 'Foundation Brush', parent: 'tools-and-brushes' },
      { slug: 'makeup-sponge', name: 'Beauty Sponge & Blender', parent: 'tools-and-brushes' },
      { slug: 'eyelash-curler', name: 'Eyelash Curler', parent: 'tools-and-brushes' },
    ],
  },
  {
    slug: 'nails',
    name: 'Nails',
    image: '/assets/categories/shop-nails.webp',
    description: 'Nail polishes, gel polish, nail art, nail strengtheners and polish removers.',
    subcategories: [
      { slug: 'nail-polish', name: 'Nail Polish', parent: 'nails' },
      { slug: 'gel-nail-polish', name: 'Gel Nail Polish', parent: 'nails' },
      { slug: 'nail-remover', name: 'Nail Polish Remover', parent: 'nails' },
      { slug: 'nail-care', name: 'Nail Care & Base Coat', parent: 'nails' },
    ],
  },
  {
    slug: 'makeup-remover',
    name: 'Makeup Remover',
    image: '/assets/categories/shop-makeup-remover.webp',
    description: 'Micellar water, cleansing balms, makeup wipes and bi-phase removers for gentle removal.',
    subcategories: [
      { slug: 'micellar-water', name: 'Micellar Water', parent: 'makeup-remover' },
      { slug: 'cleansing-balm', name: 'Cleansing Balm & Oil', parent: 'makeup-remover' },
      { slug: 'makeup-wipes', name: 'Makeup Remover Wipes', parent: 'makeup-remover' },
      { slug: 'eye-lip-remover', name: 'Eye & Lip Makeup Remover', parent: 'makeup-remover' },
    ],
  },
];

// Keep old URLs recognizable for redirects, but only advertise recorded types.
export const LEGACY_SUBCATEGORY_SLUGS:Record<string,string[]> = Object.fromEntries(
  CATEGORIES.map(category=>[category.slug,category.subcategories.map(sub=>sub.slug)])
);
for (const category of CATEGORIES) {
  category.subcategories = (CATEGORY_LEAVES[category.slug] || []).map(leaf=>({slug:leaf.slug,name:leaf.name,parent:category.slug}));
}

// Helper to find category info by slug or name
export function getCategoryBySlug(slug: string): CategoryInfo | undefined {
  const norm = slug.toLowerCase().replace(/\s+/g, '-');
  return CATEGORIES.find(c => c.slug === norm || c.slug === slug);
}

export function getCategoryByName(name: string): CategoryInfo | undefined {
  return CATEGORIES.find(c => c.name.toLowerCase() === name.toLowerCase());
}

// Map sub_sub_category from DB to our standard categories
export const SUBCATEGORY_TO_CATEGORY_MAP: Record<string, { categorySlug: string; subSlug: string }> = {
  foundation: { categorySlug: 'face-makeup', subSlug: 'foundation' },
  blush: { categorySlug: 'cheeks', subSlug: 'blush' },
  lipstick: { categorySlug: 'lip-makeup', subSlug: 'lipstick' },
  lipgloss: { categorySlug: 'lip-makeup', subSlug: 'lip-gloss' },
  'lip-gloss': { categorySlug: 'lip-makeup', subSlug: 'lip-gloss' },
  'lip-liner': { categorySlug: 'lip-makeup', subSlug: 'lip-liner' },
  mascara: { categorySlug: 'eye-makeup', subSlug: 'mascara' },
  eyeliner: { categorySlug: 'eye-makeup', subSlug: 'eyeliner' },
  kajal: { categorySlug: 'eye-makeup', subSlug: 'kajal' },
  eyeshadow: { categorySlug: 'eye-makeup', subSlug: 'eyeshadow' },
  concealer: { categorySlug: 'face-makeup', subSlug: 'concealer' },
  primer: { categorySlug: 'face-makeup', subSlug: 'primer' },
  compact: { categorySlug: 'face-makeup', subSlug: 'compact-powder' },
  highlighter: { categorySlug: 'cheeks', subSlug: 'highlighter' },
  bronzer: { categorySlug: 'cheeks', subSlug: 'bronzer' },
  contour: { categorySlug: 'cheeks', subSlug: 'contour' },
};

