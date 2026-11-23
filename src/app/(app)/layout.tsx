import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { readSession } from '@/server/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await readSession())) redirect('/login');
  return <Shell>{children}</Shell>;
}
