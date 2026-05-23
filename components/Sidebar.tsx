'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/',             label: 'Dashboard',    icon: '⊞' },
  { href: '/dossier',      label: 'HR Dossier',   icon: '👥' },
  { href: '/performance',  label: 'Performance',  icon: '📊' },
  { href: '/org-chart',    label: 'Org Chart',    icon: '🏢' },
  { href: '/onboarding',   label: 'Onboarding',   icon: '🚀' },
  { href: '/engagement',   label: 'Engagement',   icon: '💬' },
  { href: '/policy',       label: 'Policies',     icon: '📋' },
];

export default function Sidebar() {
  const path = usePathname();

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

      {/* Footer */}
      <div className="p-4 border-t border-white/10 text-xs text-white/40 text-center">
        HR Portal v1.0 · May 2026
      </div>
    </aside>
  );
}
