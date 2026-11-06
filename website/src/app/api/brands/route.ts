import { NextResponse } from 'next/server';
import { getAllBrandsList } from '@/lib/utils/products';

export async function GET() {
  try {
    const brands = await getAllBrandsList();
    return NextResponse.json({ brands });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

