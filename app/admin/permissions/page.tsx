'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { TABS, ROLES, ADMIN_EMAIL, reviewScopeFor, type Role } from '@/lib/access';

type Row = { role: string; tab_key: string; allowed: boolean };

const SCOPE_COPY: Record<string, string> = {
  all: 'Can run performance reviews for anyone in the organisation.',
  reports: 'Can only review people in their own reporting line on the org chart.',
  none: 'Cannot run performance reviews.',
};

export default function PermissionsPage() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const [email, setEmail] = useState<string | null>(null);
  const [grid, setGrid] = useState<Map<string, boolean>>(new Map());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const cellKey = (role: string, tab: string) => `${role}|${tab}`;

  useEffect(() => {
    let dead = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (dead) return;
      setEmail(session?.user?.email ?? null);

      const { data } = await supabase.from('role_tab_permissions').select('role,tab_key,allowed');
      if (dead) return;
      const m = new Map<string, boolean>();
      for (const r of (data as Row[]) ?? []) m.set(cellKey(r.role, r.tab_key), r.allowed);
      setGrid(m);
      setLoading(false);
    })();
    return () => {
      dead = true;
    };
  }, [supabase]);

  const isAdmin = (email ?? '').toLowerCase() === ADMIN_EMAIL;

  function toggle(role: Role, tab: string) {
    if (!isAdmin) return;
    const k = cellKey(role, tab);
    setGrid((prev) => {
      const next = new Map(prev);
      next.set(k, !next.get(k));
      return next;
    });
    setDirty((prev) => new Set(prev).add(k));
  }

  async function save() {
    setSaving(true);
    const payload = Array.from(dirty).map((k) => {
      const [role, tab_key] = k.split('|');
      return { role, tab_key, allowed: grid.get(k) ?? false, updated_by: email, updated_at: new Date().toISOString() };
    });
    const { error } = await supabase
      .from('role_tab_permissions')
      .upsert(payload as never, { onConflict: 'role,tab_key' });
    setSaving(false);
    if (error) {
      setToast(`Couldn't save: ${error.message}`);
      return;
    }
    setDirty(new Set());
    setToast(`Saved ${payload.length} change${payload.length === 1 ? '' : 's'}. Users see it on next page load.`);
    setTimeout(() => setToast(null), 5000);
  }

  const sections = useMemo(() => {
    const out: { name: string; tabs: typeof TABS }[] = [];
    for (const t of TABS) {
      const last = out[out.length - 1];
      if (last && last.name === t.section) last.tabs.push(t);
      else out.push({ name: t.section, tabs: [t] });
    }
    return out;
  }, []);

  if (loading)
    return (
      <div className="p-8 animate-pulse space-y-4">
        <div className="h-8 w-64 bg-gray-200 rounded" />
        <div className="h-96 bg-gray-100 rounded-xl" />
      </div>
    );

  return (
    <div className="p-6 max-w-[1100px]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Access Control</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tick which tabs each role can see. Only you can change this.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={save}
            disabled={saving || dirty.size === 0}
            className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {saving ? 'Saving…' : dirty.size ? `Save ${dirty.size} change${dirty.size === 1 ? '' : 's'}` : 'Saved'}
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          You can see this matrix but not change it. Editing is restricted to {ADMIN_EMAIL}.
        </div>
      )}

      {toast && (
        <div className="mb-4 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
          {toast}
        </div>
      )}

      {/* Review scope — set by role, not by this matrix */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {ROLES.map((r) => (
          <div key={r.key} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="font-semibold text-gray-900 text-sm">{r.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{r.blurb}</div>
            <div className="text-[11px] text-blue-700 mt-2 leading-snug">
              {SCOPE_COPY[reviewScopeFor(r.key)]}
            </div>
          </div>
        ))}
      </div>

      {/* The matrix */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-500">Tab</th>
              {ROLES.map((r) => (
                <th key={r.key} className="px-4 py-3 text-center font-semibold text-gray-700 w-36">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <React.Fragment key={sec.name}>
                <tr className="bg-gray-50/60">
                  <td
                    colSpan={ROLES.length + 1}
                    className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-gray-400 font-semibold"
                  >
                    {sec.name}
                  </td>
                </tr>
                {sec.tabs.map((t) => (
                  <tr key={t.key} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className="mr-2">{t.icon}</span>
                      <span className="text-gray-900">{t.label}</span>
                      <span className="text-xs text-gray-400 ml-2 font-mono">{t.href}</span>
                    </td>
                    {ROLES.map((r) => {
                      const k = cellKey(r.key, t.key);
                      const on = grid.get(k) ?? false;
                      const changed = dirty.has(k);
                      const locked = r.key === 'admin';
                      return (
                        <td key={r.key} className="px-4 py-2 text-center">
                          <button
                            onClick={() => !locked && toggle(r.key, t.key)}
                            disabled={!isAdmin || locked}
                            title={locked ? 'Admin always has full access' : undefined}
                            className={`w-6 h-6 rounded-md border transition-colors ${
                              on
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : 'bg-white border-gray-300 text-transparent'
                            } ${changed ? 'ring-2 ring-blue-400' : ''} ${
                              !isAdmin || locked ? 'opacity-60 cursor-not-allowed' : 'hover:border-gray-500'
                            }`}
                          >
                            ✓
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-5">
        This matrix controls tab visibility only. Who a manager can review is decided by role, not
        by this grid — managers are limited to their own reporting line on the org chart, while
        super managers and admins can review anyone. Admin is locked on so nobody can lock
        themselves out.
      </p>
    </div>
  );
}
