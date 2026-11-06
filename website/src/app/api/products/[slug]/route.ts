import { NextRequest, NextResponse } from 'next/server';
import { getProductBySlugOrId, getCrossMarketplaceOffers } from '@/lib/utils/products';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const product = await getProductBySlugOrId(slug);

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const offers = await getCrossMarketplaceOffers(product);

    return NextResponse.json({
      product,
      offers,
    });
  } catch (error: any) {
    console.error('API Error /api/products/[slug]:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

