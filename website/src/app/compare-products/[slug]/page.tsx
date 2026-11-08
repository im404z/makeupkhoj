import {notFound,permanentRedirect} from 'next/navigation';
import {getComparison} from '@/lib/matching/catalog';
export const dynamic='force-dynamic';
export default async function LegacyComparison({params}:{params:Promise<{slug:string}>}){const data=await getComparison((await params).slug);if(!data)notFound();permanentRedirect(data.path);}
