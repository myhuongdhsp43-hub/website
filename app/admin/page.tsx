import { DashboardApp } from '@/components/dashboard-app';
import { requireSchoolUser } from '@/lib/server/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  try { await requireSchoolUser(); } catch { redirect('/login?return_to=%2Fadmin'); }
  return <DashboardApp />;
}
