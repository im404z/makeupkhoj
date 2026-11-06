import { NextRequest, NextResponse } from 'next/server';
import { queryProducts } from '@/lib/utils/products';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || undefined;
    const sub_category = searchParams.get('sub_category') || undefined;
    const brand = searchParams.getAll('brand').length > 0 ? searchParams.getAll('brand') : searchParams.get('brand') || undefined;
    const marketplace = searchParams.getAll('marketplace').length > 0 ? searchParams.getAll('marketplace') : searchParams.get('marketplace') || undefined;
    const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined;
    const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined;
    const minDiscount = searchParams.get('minDiscount') ? Number(searchParams.get('minDiscount')) : undefined;
    const rating = searchParams.get('rating') ? Number(searchParams.get('rating')) : undefined;
    const inStockOnly = searchParams.get('inStock') === 'true';
    const finish = searchParams.get('finish') || undefined;
    const coverage = searchParams.get('coverage') || undefined;
    const search = searchParams.get('search') || searchParams.get('q') || undefined;
    const sort = searchParams.get('sort') || 'popular';
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 24;

    const result = await queryProducts({
      page,
      limit,
      category,
      sub_category,
      brand,
      marketplace,
      minPrice,
      maxPrice,
      minDiscount,
      rating,
      inStockOnly,
      finish,
      coverage,
      search,
      sort,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API Error /api/products:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

