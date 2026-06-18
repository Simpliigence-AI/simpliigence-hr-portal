'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { cn } from '@/lib/utils';

const MANAGER_NAV = [
  { href: '/performance', label: 'Manager Review', icon: '📋' },
]

const NAV = [
  { href: '/',             label: 'Dashboard',        icon: '⊞' },
  { href: '/dossier',      label: 'HR Dossier',       icon: '👥' },
  { href: '/performance',  label: 'Performance',      icon: '📊' },
  { href: '/reports',       label: 'Reports',        icon: '📈' },
  { href: '/org-chart',    label: 'Org Chart',        icon: '🏢' },
  { href: '/onboarding',   label: 'Onboarding',       icon: '🚀' },
  { href: '/joining',       label: 'Joining Pipeline', icon: '🧳' },
  { href: '/engagement',   label: 'Engagement',       icon: '💬' },
  { href: '/policy',       label: 'Policies',         icon: '📋' },
  { href: '/actions',      label: 'Action Tracker',   icon: '✅' },
  { href: '/certifications',label: 'Certifications',   icon: '🏅' },
  { href: '/above-beyond', label: 'Above & Beyond',   icon: '⭐' },
  { href: '/map',          label: 'World Map',        icon: '🌍' },
  { href: '/teams-sync',   label: 'Teams Sync',       icon: '💼' },
  { href: '/admin',        label: 'Backup & Restore', icon: '🗄️' },
  { href: '/checklist',   label: 'Weekly Checklist', icon: '📋' },
];

export default function Sidebar() {
  const path   = usePathname();

  const [role, setRole] = useState<'admin' | 'manager'>('admin')
  useEffect(() => {
    fetch('/api/my-role')
      .then(r => r.json())
      .then(d => setRole(d?.role ?? 'admin'))
      .catch(() => {})
  }, [])

  const navItems = role === 'manager'
    ? MANAGER_NAV
    : [...NAV, { href: '/admin/users', label: 'User Mgmt', icon: '👥' }]
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
