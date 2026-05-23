'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Employee, EngagementConnect } from '@/lib/database.types';
import { formatDate, cn } from '@/lib/utils';
import Avatar from '@/components/Avatar';

const TABS = ['1-on-1 Connects', 'Recognition & Rewards', 'Team Townhalls'];
const MOODS = ['Good', 'Needs Attention', 'At Risk'];
const MOOD_COLORS: Record<string, string> = { 'Good': 'bg-green-100 text-green-700', 'Needs Attention': 'bg-yellow-100 text-yellow-700', 'At Risk': 'bg-red-100 text-red-700' };

interface ConnectWithEmployee extends EngagementConnect { employee?: Employee; }

export default function EngagementPage() {
  const [tab,       setTab]       = useState(0);
  const [connects,  setConnects]  = useState<ConnectWithEmployee[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [showForm,  setShowForm]  = useState(false);

  // New connect form state
  const [form, setForm] = useState({ employee_id: '', connect_date: new Date().toISOString().split('T')[0], notes: '', mood: 'Good', action_items: '', conducted_by: '' });

  useEffect(() => {
    Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('name'),
      supabase.from('engagement_connects').select('*').order('connect_date', { ascending: false }),
    ]).then(([{ data: emps }, { data: cons }]) => {
      const empList = emps ?? [];
      setEmployees(empList);
      setConnects((cons ?? []).map(c => ({ ...c, employee: empList.find(e => e.id === c.employee_id) })));
      setLoading(false);
    });
  }, []);

  async function saveConnect() {
    const payload = {
      ...form,
      action_items: form.action_items.split('\n').filter(Boolean),
    };
    const { data } = await supabase.from('engagement_connects').insert(payload).select().single();
    if (data) {
      const emp = employees.find(e => e.id === data.employee_id);
      setConnects(cs => [{ ...data, employee: emp }, ...cs]);
      setShowForm(false);
      setForm({ employee_id: '', connect_date: new Date().toISOString().split('T')[0], notes: '', mood: 'Good', action_items: '', conducted_by: '' });
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading engagement data…</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employee Engagement</h1>
          <p className="text-sm text-gray-500 mt-0.5">{connects.length} connects recorded</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
          + New Connect
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={cn('px-4 py-1.5 text-sm rounded-lg transition-colors', tab === i ? 'bg-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700')}>
            {t}
          </button>
        ))}
      </div>

      {/* 1-on-1 connects */}
      {tab === 0 && (
        <div className="space-y-3">
          {connects.length === 0 && <div className="text-gray-400 text-sm">No connects recorded yet. Add the first one!</div>}
          {connects.map(c => (
            <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                {c.employee && <Avatar name={c.employee.name} photoUrl={c.employee.photo_url} size="sm" />}
                <div className="flex-1">
                  <div className="font-semibold text-sm">{c.employee?.name ?? c.employee_id}</div>
                  <div className="text-xs text-gray-400">{c.employee?.role} · {formatDate(c.connect_date)}</div>
                </div>
                {c.mood && <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', MOOD_COLORS[c.mood] ?? 'bg-gray-100 text-gray-600')}>{c.mood}</span>}
                <span className="text-gray-400 text-sm">{expanded === c.id ? '▲' : '▼'}</span>
              </div>
              {expanded === c.id && (
                <div className="border-t border-gray-50 p-4 bg-gray-50 space-y-3">
                  {c.notes && <div><div className="text-xs font-semibold text-gray-400 mb-1">NOTES</div><p className="text-sm text-gray-700 leading-relaxed">{c.notes}</p></div>}
                  {c.action_items.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-400 mb-1">ACTION ITEMS</div>
                      <ul className="space-y-1">
                        {c.action_items.map((a, i) => <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-blue-400">→</span>{a}</li>)}
                      </ul>
                    </div>
                  )}
                  {c.conducted_by && <div className="text-xs text-gray-400">Conducted by: {c.conducted_by}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* R&R */}
      {tab === 1 && (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-400 text-sm">
          <div className="text-4xl mb-3">🏆</div>
          Recognition & Rewards module — coming soon.<br />
          Employee recognition data will be added here.
        </div>
      )}

      {/* Townhalls */}
      {tab === 2 && (
        <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-400 text-sm">
          <div className="text-4xl mb-3">📢</div>
          Townhall tracker — coming soon.<br />
          Add townhall dates, agenda, and attendance here.
        </div>
      )}

      {/* New connect modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold mb-4">New 1-on-1 Connect</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Employee</label>
                <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400">
                  <option value="">Select employee…</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.role}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Date</label>
                  <input type="date" value={form.connect_date} onChange={e => setForm(f => ({ ...f, connect_date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Mood</label>
                  <select value={form.mood} onChange={e => setForm(f => ({ ...f, mood: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400">
                    {MOODS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Notes</label>
                <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Action Items (one per line)</label>
                <textarea rows={3} value={form.action_items} onChange={e => setForm(f => ({ ...f, action_items: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Conducted by</label>
                <input value={form.conducted_by} onChange={e => setForm(f => ({ ...f, conducted_by: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={saveConnect} disabled={!form.employee_id}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                Save Connect
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
