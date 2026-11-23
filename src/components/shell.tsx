'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">
          Market
        </Link>
        <nav>
          <Link href="/" className={path === '/' ? 'active' : ''}>
            Watch
          </Link>
          <Link href="/calendar" className={path.startsWith('/calendar') ? 'active' : ''}>
            Calendar
          </Link>
          <Link href="/settings" className={path.startsWith('/settings') ? 'active' : ''}>
            Settings
          </Link>
          <button className="btn btn-ghost" type="button" onClick={() => void logout()}>
            Log out
          </button>
        </nav>
      </header>
      <main className="wrap">{children}</main>
    </>
  );
}
