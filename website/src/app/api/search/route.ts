import { NextRequest, NextResponse } from 'next/server';
import { queryProducts } from '@/lib/utils/products';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    if (!q.trim()) {
      return NextResponse.json({ products: [], total: 0 });
    }
    const result = await queryProducts({
      search: q,
      limit: 10,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

