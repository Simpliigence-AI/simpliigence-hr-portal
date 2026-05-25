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

  // Derive display name from email: sudha@simpliigence.com → Sudha
  const displayName = userEmail
    ? userEmail.split('@')[0].split('.').map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
    : null;
  const initials = displayName
    ? displayName.split(' ').map((p: string) => p[0]?.toUpperCase() ?? '').join('').slice(0, 2)
    : '?';

  // Pick a consistent avatar colour based on email
  const avatarColours = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-rose-500','bg-amber-500'];
  const avatarColour  = userEmail
    ? avatarColours[userEmail.charCodeAt(0) % avatarColours.length]
    : 'bg-blue-500';

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

      {/* Logged-in user card */}
      {userEmail && (
        <div className="mx-3 mt-3 mb-1 rounded-xl bg-white/8 border border-white/10 px-3 py-2.5 flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0', avatarColour)}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white leading-tight truncate">{displayName}</div>
            <div className="text-[11px] text-white/50 truncate">{userEmail}</div>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="Online" />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 mt-1">
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

      {/* Sign out */}
      <div className="p-3 border-t border-white/10">
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
