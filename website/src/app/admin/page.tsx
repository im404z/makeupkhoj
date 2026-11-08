import type { Metadata } from 'next';
import { isAdmin } from '@/lib/admin/auth';
import AdminDashboard from '@/components/admin/AdminDashboard';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Catalog administration',robots:{index:false,follow:false}};
export default async function AdminPage(){return <AdminDashboard authenticated={await isAdmin()}/>;}
