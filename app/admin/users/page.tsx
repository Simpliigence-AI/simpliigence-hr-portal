'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { cn } from '@/lib/utils';

const ADMIN_EMAIL = 'raghu.seetharam@simpliigence.com';
type Role = 'admin' | 'manager' | 'viewer';

interface HrUser {
  id: string;
  email: string;
  role: Role;
  assigned_by: string | null;
  assigned_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
}

const ROLE_META: Record<Role, { label: string; bg: string; text: string; desc: string }> = {
  admin:   { label: 'Admin',   bg: 'bg-red-100',  text: 'text-red-700',  desc: 'Full access including user management' },
  manager: { label: 'Manager', bg: 'bg-blue-100', text: 'text-blue-700', desc: 'Full HR access, no admin' },
  viewer:  { label: 'Viewer',  bg: 'bg-gray-100', text: 'text-gray-600', desc: 'Read-only access' },
};

function RoleBadge({ role }: { role: Role }) {
  const m = ROLE_META[role];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', m.bg, m.text)}>
      {m.label}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtRelative(iso: string | null) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return days + 'd ago';
  if (days < 365) return Math.floor(days / 30) + 'mo ago';
  return Math.floor(days / 365) + 'y ago';
}

function avatarColour(email: string) {
  const colours = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500'];
  return colours[email.charCodeAt(0) % colours.length];
}

function initials(email: string) {
  return (email.split('@')[0].split('.').map(p => p[0]?.toUpperCase() ?? '').join('') || '?').slice(0, 2);
}

function displayName(email: string) {
  return email.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<HrUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || session.user.email !== ADMIN_EMAIL) { router.replace('/'); return; }
      setIsAdmin(true);
      setAuthChecked(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/users');
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) loadUsers(); }, [isAdmin, loadUsers]);

  async function changeRole(userId: string, newRole: Role) {
    setSaving(userId);
    const res = await fetch('/api/admin/users/' + userId + '/role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      showToast('Role updated to ' + ROLE_META[newRole].label, true);
    } else {
      showToast(data.error ?? 'Failed to update role', false);
    }
    setSaving(null);
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  if (!authChecked) return (
    <div className="p-8 flex items-center justify-center min-h-screen">
      <div className="text-gray-400 text-sm">Checking access…</div>
    </div>
  );

  const adminUsers   = users.filter(u => u.role === 'admin');
  const managerUsers = users.filter(u => u.role === 'manager');
  const viewerUsers  = users.filter(u => u.role === 'viewer');

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage access levels for all {users.length} portal users</p>
        </div>
        <button onClick={loadUsers} className="px-4 py-2 text-sm border rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
          ↻ Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {(Object.entries(ROLE_META) as [Role, typeof ROLE_META[Role]][]).map(([role, m]) => (
          <div key={role} className="bg-white border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <RoleBadge role={role} />
              <span className="text-xs text-gray-400">{users.filter(u => u.role === role).length} user{users.filter(u => u.role === role).length !== 1 ? 's' : ''}</span>
            </div>
            <p className="text-xs text-gray-500">{m.desc}</p>
          </div>
        ))}
      </div>

      {toast && (
        <div className={cn('fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium',
          toast.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200')}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-12">Loading users…</div>
      ) : (
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-5 py-3 font-semibold text-gray-600 w-[38%]">User</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-[20%]">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-[18%]">Last Sign In</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 w-[24%]">Change Access</th>
              </tr>
            </thead>
            <tbody>
              {[...adminUsers, ...managerUsers, ...viewerUsers].map((u) => {
                const isSelf = u.email === ADMIN_EMAIL;
                return (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0', avatarColour(u.email))}>
                          {initials(u.email)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 leading-tight">
                            {displayName(u.email)}{isSelf && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <RoleBadge role={u.role} />
                      {u.assigned_by && u.role !== 'viewer' && (
                        <div className="text-xs text-gray-400 mt-1">by {displayName(u.assigned_by)} · {fmtDate(u.assigned_at)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">{fmtRelative(u.last_sign_in_at)}</td>
                    <td className="px-4 py-3.5">
                      {isSelf ? (
                        <span className="text-xs text-gray-400 italic">Cannot change own role</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select value={u.role} disabled={saving === u.id} onChange={e => changeRole(u.id, e.target.value as Role)}
                            className="text-sm border rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer">
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          {saving === u.id && <span className="text-xs text-gray-400 animate-pulse">Saving…</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-4 text-center">Role changes take effect immediately on next page load for affected users.</p>
    </div>
  );
}
