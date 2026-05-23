'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Policy } from '@/lib/database.types';
import { formatDate, cn } from '@/lib/utils';

const CATEGORIES = ['All', 'HR', 'Compliance', 'IT', 'Finance', 'Talent', 'Operations'];
const STATUSES   = ['All', 'Active', 'Under Review', 'Draft', 'Archived'];

const CAT_COLORS: Record<string, string> = {
  HR:           'bg-pink-100 text-pink-700',
  Compliance:   'bg-red-100 text-red-700',
  IT:           'bg-blue-100 text-blue-700',
  Finance:      'bg-green-100 text-green-700',
  Talent:       'bg-orange-100 text-orange-700',
  Operations:   'bg-teal-100 text-teal-700',
};

export default function PolicyPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [cat,      setCat]      = useState('All');
  const [status,   setStatus]   = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'HR', description: '', owner: '', status: 'Active', version: '1.0', effective_date: '' });

  useEffect(() => {
    supabase.from('policies').select('*').order('category').order('title')
      .then(({ data }) => { setPolicies(data ?? []); setLoading(false); });
  }, []);

  const filtered = policies.filter(p => {
    const q = search.toLowerCase();
    if (q && !p.title.toLowerCase().includes(q) && !p.owner?.toLowerCase().includes(q)) return false;
    if (cat !== 'All' && p.category !== cat) return false;
    if (status !== 'All' && p.status !== status) return false;
    return true;
  });

  async function savePolicy() {
    const { data } = await supabase.from('policies').insert(form).select().single();
    if (data) { setPolicies(ps => [...ps, data]); setShowForm(false); }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading policies…</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policy Register</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} of {policies.length} policies</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
          + Add Policy
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search policies…"
          className="flex-1 min-w-48 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
        <select value={cat} onChange={e => setCat(e.target.value)}
          className="px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-blue-400">
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-blue-400">
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Policy Name', 'Category', 'Owner', 'Version', 'Effective Date', 'Status'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-blue-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{p.title}</div>
                  {p.description && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-64">{p.description}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', CAT_COLORS[p.category ?? ''] ?? 'bg-gray-100 text-gray-600')}>{p.category}</span>
                </td>
                <td className="px-4 py-3 text-gray-600">{p.owner ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{p.version ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(p.effective_date)}</td>
                <td className="px-4 py-3">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                    p.status === 'Active' ? 'bg-green-100 text-green-700' :
                    p.status === 'Draft'  ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500')}>
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add policy modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-lg font-bold mb-4">Add Policy</h2>
            <div className="space-y-3">
              {[
                { label: 'Policy Title', key: 'title', type: 'text' },
                { label: 'Owner',        key: 'owner', type: 'text' },
                { label: 'Version',      key: 'version', type: 'text' },
                { label: 'Effective Date', key: 'effective_date', type: 'date' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">{f.label}</label>
                  <input type={f.type} value={(form as Record<string, string>)[f.key]}
                    onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg">
                    {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border rounded-lg">
                    {STATUSES.filter(s => s !== 'All').map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Description (optional)</label>
                <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border rounded-lg resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={savePolicy} disabled={!form.title}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">Save</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
