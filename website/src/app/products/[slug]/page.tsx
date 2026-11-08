import {notFound,permanentRedirect} from 'next/navigation';
import {getProductPage} from '@/lib/matching/catalog';
export const dynamic='force-dynamic';
export default async function LegacyProduct({params}:{params:Promise<{slug:string}>}){const data=await getProductPage((await params).slug);if(!data)notFound();permanentRedirect(data.path);}
