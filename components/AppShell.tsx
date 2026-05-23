'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === '/login') return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50">{children}</main>
    </div>
  );
}
