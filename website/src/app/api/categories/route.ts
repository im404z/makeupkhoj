import { NextResponse } from 'next/server';
import { CATEGORIES } from '@/lib/constants/categories';

export async function GET() {
  return NextResponse.json({ categories: CATEGORIES });
}

