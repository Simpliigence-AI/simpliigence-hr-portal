'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // /login and the tokenised appraisal forms (/appraisal/<token>) are seen by
  // people who are not signed in to the portal — no sidebar for them.
  if (path === '/login') return <>{children}</>;
  if (/^\/appraisal\/[^/]+$/.test(path ?? '')) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50">{children}</main>
    </div>
  );
}
