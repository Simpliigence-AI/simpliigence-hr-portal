'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

/** The one account that can edit the permission matrix, regardless of user_roles. */
export const ADMIN_EMAIL = 'raghu.seetharam@simpliigence.com';

export type Role = 'admin' | 'super_manager' | 'manager' | 'viewer';

export const ROLES: { key: Role; label: string; blurb: string }[] = [
  { key: 'admin', label: 'Admin', blurb: 'Full access, including this matrix' },
  { key: 'super_manager', label: 'Super manager', blurb: 'Can review anyone in the org' },
  { key: 'manager', label: 'Manager', blurb: 'Can review their own reporting line' },
  { key: 'viewer', label: 'Viewer', blurb: 'Read-only, no performance access' },
];

export type Tab = {
  key: string;
  href: string;
  label: string;
  icon: string;
  section: string;
};

/** Single source of truth for the nav. The matrix and the sidebar both read this. */
export const TABS: Tab[] = [
  { key: 'dashboard',      href: '/',                 label: 'Dashboard',           icon: '⊞',  section: 'Overview' },

  { key: 'dossier',        href: '/dossier',          label: 'HR Dossier',          icon: '👥', section: 'People' },
  { key: 'org-chart',      href: '/org-chart',        label: 'Org Chart',           icon: '🏢', section: 'People' },
  { key: 'joining',        href: '/joining',          label: 'Joining Pipeline',    icon: '🤝', section: 'People' },
  { key: 'engagement',     href: '/engagement',       label: 'Engagement',          icon: '💬', section: 'People' },

  { key: 'cockpit',        href: '/cockpit',          label: 'Cockpit',             icon: '🎯', section: 'Performance' },
  { key: 'performance',    href: '/performance',      label: 'Performance',         icon: '📊', section: 'Performance' },
  { key: 'certifications', href: '/certifications',   label: 'Certifications',      icon: '🏅', section: 'Performance' },
  { key: 'above-beyond',   href: '/above-beyond',     label: 'Above & Beyond',      icon: '⭐', section: 'Performance' },

  { key: 'timesheets',     href: '/timesheets',       label: 'Timesheet Analytics', icon: '⏱️', section: 'Insights' },
  { key: 'reports',        href: '/reports',          label: 'Reports',             icon: '📉', section: 'Insights' },
  { key: 'map',            href: '/map',              label: 'World Map',           icon: '🌍', section: 'Insights' },

  { key: 'checklist',      href: '/checklist',        label: 'Weekly Checklist',    icon: '✅', section: 'Operations' },
  { key: 'policy',         href: '/policy',           label: 'Policies',            icon: '📄', section: 'Operations' },
  { key: 'teams-sync',     href: '/teams-sync',       label: 'Teams Sync',          icon: '💼', section: 'Operations' },

  { key: 'admin-users',       href: '/admin/users',       label: 'User Management', icon: '🔐', section: 'Admin' },
  { key: 'admin-permissions', href: '/admin/permissions', label: 'Access Control',  icon: '🛡️', section: 'Admin' },
  { key: 'admin-backup',      href: '/admin',             label: 'Backup & Restore', icon: '🗄️', section: 'Admin' },
];

/** Who a role may run performance reviews for. */
export type ReviewScope = 'all' | 'reports' | 'none';

export function reviewScopeFor(role: Role | null): ReviewScope {
  if (role === 'admin' || role === 'super_manager') return 'all';
  if (role === 'manager') return 'reports';
  return 'none';
}

/** Fallback used before the matrix loads, or if a role has no rows yet. */
const FALLBACK_ALLOW: Record<Role, (t: Tab) => boolean> = {
  admin: () => true,
  super_manager: (t) => t.section !== 'Admin',
  manager: (t) => t.section !== 'Admin' && t.key !== 'teams-sync',
  viewer: (t) => ['dashboard', 'dossier', 'org-chart', 'policy', 'map'].includes(t.key),
};

export type Access = {
  loading: boolean;
  email: string | null;
  role: Role | null;
  isAdmin: boolean;
  /** Tabs this user may see, in TABS order. */
  tabs: Tab[];
  can: (tabKey: string) => boolean;
  reviewScope: ReviewScope;
};

export function useAccess(): Access {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [matrix, setMatrix] = useState<Map<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (dead) return;

      const mail = session?.user?.email ?? null;
      setEmail(mail);

      // Role comes from user_roles, keyed on the auth user id — never from
      // employees, which has no email column and stores job titles in `role`.
      let resolved: Role | null = null;
      if (session?.user?.id) {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .maybeSingle();
        const r = (data as { role?: string } | null)?.role;
        if (r === 'admin' || r === 'super_manager' || r === 'manager' || r === 'viewer') {
          resolved = r;
        }
      }
      if (mail && mail.toLowerCase() === ADMIN_EMAIL) resolved = 'admin';
      if (!resolved) resolved = 'viewer';
      if (dead) return;
      setRole(resolved);

      const { data: rows } = await supabase
        .from('role_tab_permissions')
        .select('role,tab_key,allowed')
        .eq('role', resolved);
      if (dead) return;

      const m = new Map<string, boolean>();
      for (const row of (rows as { tab_key: string; allowed: boolean }[]) ?? []) {
        m.set(row.tab_key, row.allowed);
      }
      setMatrix(m.size ? m : null);
      setLoading(false);
    })();

    return () => {
      dead = true;
    };
  }, []);

  const effective: Role = role ?? 'viewer';
  const can = (tabKey: string) => {
    const tab = TABS.find((t) => t.key === tabKey);
    if (!tab) return false;
    if (matrix && matrix.has(tabKey)) return matrix.get(tabKey)!;
    return FALLBACK_ALLOW[effective](tab);
  };

  return {
    loading,
    email,
    role,
    isAdmin: (email ?? '').toLowerCase() === ADMIN_EMAIL,
    tabs: TABS.filter((t) => can(t.key)),
    can,
    reviewScope: reviewScopeFor(role),
  };
}
