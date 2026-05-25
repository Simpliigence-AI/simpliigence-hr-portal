'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface ABEntry {
  id: string;
  employee_id: string;
  category: string;
  description: string;
  client_project: string | null;
  recorded_by: string | null;
  recorded_date: string;
  points: number | null;
  created_at: string;
  employees?: { name: string; role: string | null; dept: string | null; location: string | null; region: string | null };
}

const CATEGORIES = ['Overtime', 'Extra Project', 'Client Escalation Handled', 'Mentoring', 'Innovation', 'Process Improvement', 'Recruitment Support', 'Other'];
const POINTS_LABEL: Record<number, string> = { 1: 'Good', 2: 'Great', 3: 'Excellent', 4: 'Outstanding', 5: 'Exceptional' };
const POINTS_COLOR: Record<number, string> = {
  1: 'bg-gray-100 text-gray-600',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-green-100 text-green-700',
  4: 'bg-purple-100 text-purple-700',
  5: 'bg-amber-100 text-amber-700',
};

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${POINTS_COLOR[n]}`}>
      {'★'.repeat(n)}{'☆'.repeat(5 - n)} {POINTS_LABEL[n]}
    </span>
  );
}

export default function AboveBeyondPage() {
  const [entries, setEntries]   = useState<ABEntry[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; role: string | null; dept: string | null }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const [form, setForm] = useState({
    employee_id: '', category: '', description: '', client_project: '', recorded_by: '', recorded_date: new Date().toISOString().slice(0, 10), points: '3',
  });

  async function load() {
    setLoading(true);
    const [{ data: ab }, { data: emp }] = await Promise.all([
      supabase.from('above_beyond').select('*, employees(name, role, dept, location, region)').order('recorded_date', { ascending: false }),
      supabase.from('employees').select('id, name, role, dept').eq('active', true).order('name'),
    ]);
    setEntries((ab ?? []) as ABEntry[]);
    setEmployees(emp ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employee_id || !form.category || !form.description) return;
    setSaving(true);
    await supabase.from('above_beyond').insert({
      employee_id:    form.employee_id,
      category:       form.category,
      description:    form.description.trim(),
      client_project: form.client_project || null,
      recorded_by:    form.recorded_by || null,
      recorded_date:  form.recorded_date,
      points:         Number(form.points),
    });
    setForm({ employee_id: '', category: '', description: '', client_project: '', recorded_by: '', recorded_date: new Date().toISOString().slice(0, 10), points: '3' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this entry?')) return;
    await supabase.from('above_beyond').delete().eq('id', id);
    load();
  }

  const filtered = entries.filter(e => {
    const name = e.employees?.name?.toLowerCase() ?? '';
    const matchSearch = !search || name.includes(search.toLowerCase()) || e.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || e.category === filterCategory;
    return matchSearch && matchCat;
  });

  // Leaderboard by total points
  const leaderboard = Object.values(
    entries.reduce((acc, e) => {
      const key = e.employee_id;
      if (!acc[key]) acc[key] = { name: e.employees?.name ?? e.employee_id, points: 0, count: 0 };
      acc[key].points += e.points ?? 0;
      acc[key].count++;
      return acc;
    }, {} as Record<string, { name: string; points: number; count: number }>)
  ).sort((a, b) => b.points - a.points).slice(0, 5);

  const totalPoints = entries.reduce((s, e) => s + (e.points ?? 0), 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⭐ Above & Beyond</h1>
          <p className="text-sm text-gray-500 mt-0.5">{entries.length} recognition entries · {totalPoints} total points awarded</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors">
          + Record Achievement
        </button>
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-4 mb-6">
          <div className="text-sm font-semibold text-amber-800 mb-3">🏆 Top Contributors (All Time)</div>
          <div className="flex flex-wrap gap-3">
            {leaderboard.map((l, i) => (
              <div key={l.name} className="bg-white rounded-xl px-4 py-2.5 shadow-sm border border-amber-100 flex items-center gap-3">
                <span className="text-xl">{['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</span>
                <div>
                  <div className="font-semibold text-sm text-gray-900">{l.name}</div>
                  <div className="text-xs text-amber-700">{l.points} pts · {l.count} entries</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterCategory === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by employee or description…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {(search || filterCategory) && (
          <button onClick={() => { setSearch(''); setFilterCategory(''); }} className="text-sm text-blue-600 hover:underline">Clear</button>
        )}
      </div>

      {/* Entries */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-12 text-center">
          <div className="text-4xl mb-3">⭐</div>
          <div>No entries yet. Start recording achievements!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-gray-900">{entry.employees?.name ?? entry.employee_id}</span>
                    <span className="text-xs text-gray-500">{entry.employees?.role ?? ''}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      entry.category === 'Overtime'        ? 'bg-blue-100 text-blue-700' :
                      entry.category === 'Extra Project'   ? 'bg-green-100 text-green-700' :
                      entry.category === 'Mentoring'       ? 'bg-purple-100 text-purple-700' :
                      entry.category === 'Innovation'      ? 'bg-cyan-100 text-cyan-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{entry.category}</span>
                    <Stars n={entry.points} />
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{entry.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    {entry.client_project && <span>📁 {entry.client_project}</span>}
                    {entry.recorded_by    && <span>👤 Recorded by {entry.recorded_by}</span>}
                    <span>📅 {new Date(entry.recorded_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
                  </div>
                </div>
                <button onClick={() => deleteEntry(entry.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0 mt-1">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-gray-900">Record Achievement</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={saveEntry} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
                <select value={form.employee_id} onChange={e => setForm(f => ({...f, employee_id: e.target.value}))} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select employee…</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.role ?? e.dept}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select category…</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} required rows={3}
                  placeholder="Describe what the employee did above and beyond their normal role…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client / Project</label>
                <input value={form.client_project} onChange={e => setForm(f => ({...f, client_project: e.target.value}))}
                  placeholder="e.g. Cool Air, Carrier, Internal…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recorded By</label>
                  <input value={form.recorded_by} onChange={e => setForm(f => ({...f, recorded_by: e.target.value}))}
                    placeholder="Manager name…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" value={form.recorded_date} onChange={e => setForm(f => ({...f, recorded_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Recognition Points</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map(p => (
                    <button key={p} type="button" onClick={() => setForm(f => ({...f, points: String(p)}))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${form.points === String(p) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-400'}`}>
                      {'★'.repeat(p)}<br/>{POINTS_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
