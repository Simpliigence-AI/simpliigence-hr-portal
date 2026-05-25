'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/',             label: 'Dashboard',        icon: '⊞' },
  { href: '/dossier',      label: 'HR Dossier',       icon: '👥' },
  { href: '/performance',  label: 'Performance',      icon: '📊' },
  { href: '/org-chart',    label: 'Org Chart',        icon: '🏢' },
  { href: '/onboarding',   label: 'Onboarding',       icon: '🚀' },
  { href: '/engagement',   label: 'Engagement',       icon: '💬' },
  { href: '/policy',       label: 'Policies',         icon: '📋' },
  { href: '/actions',      label: 'Action Tracker',   icon: '✅' },
  { href: '/certifications',label: 'Certifications',   icon: '🏅' },
  { href: '/above-beyond', label: 'Above & Beyond',   icon: '⭐' },
  { href: '/map',          label: 'World Map',        icon: '🌍' },
  { href: '/teams-sync',   label: 'Teams Sync',       icon: '💼' },
  { href: '/admin',        label: 'Backup & Restore', icon: '🗄️' },
];

export default function Sidebar() {
  const path   = usePathname();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserEmail(session?.user?.email ?? null);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const initials = userEmail
    ? userEmail.split('@')[0].split('.').map((p: string) => p[0]?.toUpperCase() ?? '').join('').slice(0, 2)
    : '?';

  return (
    <aside className="w-60 min-h-screen bg-[#0f1e3d] text-white flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-lg">S</div>
          <div>
            <div className="font-semibold text-sm leading-tight">Simpliigence</div>
            <div className="text-xs text-white/50">HR Portal</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ href, label, icon }) => {
          const active = path === href || (href !== '/' && path.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                active
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <span className="text-base w-5 text-center">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + Sign out */}
      <div className="p-3 border-t border-white/10">
        {userEmail && (
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/80 truncate">{userEmail}</div>
            </div>
          </div>
        )}
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <span className="w-5 text-center">↩</span>
          Sign out
        </button>
        <div className="text-xs text-white/30 text-center mt-2">HR Portal v1.1 · May 2026</div>
      </div>
    </aside>
  );
}
