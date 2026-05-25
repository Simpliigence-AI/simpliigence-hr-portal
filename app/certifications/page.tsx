'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Cert {
  id: string;
  employee_id: string;
  cert_name: string;
  issuer: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  employees?: { name: string; role: string | null; dept: string | null; location: string | null };
}

const ISSUERS = ['Salesforce', 'AWS', 'Microsoft', 'Google', 'PMI', 'ISTQB', 'Scrum.org', 'SAFe', 'Other'];

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function ExpiryBadge({ date }: { date: string | null }) {
  if (!date) return <span className="text-xs text-gray-400">No expiry</span>;
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0)  return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Expired</span>;
  if (days <= 30) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Expires in {days}d</span>;
  if (days <= 90) return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Expires in {days}d</span>;
  return <span className="text-xs text-gray-500">{new Date(date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>;
}

export default function CertificationsPage() {
  const [certs, setCerts]       = useState<Cert[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; role: string | null; dept: string | null; location: string | null }[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterIssuer, setFilterIssuer] = useState('');
  const [filterExpiry, setFilterExpiry] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);

  const [form, setForm] = useState({
    employee_id: '', cert_name: '', issuer: '', issued_date: '', expiry_date: '', notes: '',
  });

  async function load() {
    setLoading(true);
    const [{ data: c }, { data: e }] = await Promise.all([
      supabase.from('certifications').select('*, employees(name, role, dept, location)').order('created_at', { ascending: false }),
      supabase.from('employees').select('id, name, role, dept, location').eq('active', true).order('name'),
    ]);
    setCerts((c ?? []) as Cert[]);
    setEmployees(e ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveCert(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employee_id || !form.cert_name) return;
    setSaving(true);
    await supabase.from('certifications').insert({
      employee_id: form.employee_id,
      cert_name:   form.cert_name.trim(),
      issuer:      form.issuer || null,
      issued_date: form.issued_date || null,
      expiry_date: form.expiry_date || null,
      notes:       form.notes || null,
    });
    setForm({ employee_id: '', cert_name: '', issuer: '', issued_date: '', expiry_date: '', notes: '' });
    setShowForm(false);
    setSaving(false);
    load();
  }

  async function deleteCert(id: string) {
    if (!confirm('Delete this certification?')) return;
    await supabase.from('certifications').delete().eq('id', id);
    load();
  }

  const today = new Date().toISOString().slice(0, 10);
  const filtered = certs.filter(c => {
    const name = c.employees?.name?.toLowerCase() ?? '';
    const cert = c.cert_name.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || cert.includes(search.toLowerCase());
    const matchIssuer = !filterIssuer || c.issuer === filterIssuer;
    const matchExpiry = !filterExpiry || (() => {
      const days = daysUntil(c.expiry_date);
      if (filterExpiry === 'expired')  return days !== null && days < 0;
      if (filterExpiry === '30')       return days !== null && days >= 0 && days <= 30;
      if (filterExpiry === '90')       return days !== null && days >= 0 && days <= 90;
      if (filterExpiry === 'valid')    return days === null || days > 0;
      return true;
    })();
    return matchSearch && matchIssuer && matchExpiry;
  });

  const expiredCount = certs.filter(c => daysUntil(c.expiry_date) !== null && (daysUntil(c.expiry_date) ?? 1) < 0).length;
  const expiring30   = certs.filter(c => { const d = daysUntil(c.expiry_date); return d !== null && d >= 0 && d <= 30; }).length;
  const expiring90   = certs.filter(c => { const d = daysUntil(c.expiry_date); return d !== null && d > 30 && d <= 90; }).length;

  // Group by issuer for summary
  const byIssuer = certs.reduce((acc, c) => {
    const key = c.issuer || 'Other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏅 Certification Tracker</h1>
          <p className="text-sm text-gray-500 mt-0.5">{certs.length} certifications across {new Set(certs.map(c => c.employee_id)).size} employees</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          + Add Certification
        </button>
      </div>

      {/* Alert chips */}
      {(expiredCount > 0 || expiring30 > 0 || expiring90 > 0) && (
        <div className="flex flex-wrap gap-2 mb-5">
          {expiredCount > 0 && (
            <button onClick={() => setFilterExpiry('expired')}
              className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100">
              🚨 {expiredCount} expired
            </button>
          )}
          {expiring30 > 0 && (
            <button onClick={() => setFilterExpiry('30')}
              className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100">
              ⚠️ {expiring30} expiring in 30 days
            </button>
          )}
          {expiring90 > 0 && (
            <button onClick={() => setFilterExpiry('90')}
              className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-1.5 text-sm font-medium text-yellow-700 hover:bg-yellow-100">
              📅 {expiring90} expiring in 90 days
            </button>
          )}
        </div>
      )}

      {/* Summary by issuer */}
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.entries(byIssuer).sort((a,b) => b[1]-a[1]).map(([issuer, count]) => (
          <button key={issuer} onClick={() => setFilterIssuer(filterIssuer === issuer ? '' : issuer)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filterIssuer === issuer ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'}`}>
            {issuer} <span className="ml-1 opacity-70">{count}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or cert…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={filterExpiry} onChange={e => setFilterExpiry(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All statuses</option>
          <option value="expired">Expired</option>
          <option value="30">Expiring in 30 days</option>
          <option value="90">Expiring in 90 days</option>
          <option value="valid">Valid</option>
        </select>
        {(search || filterIssuer || filterExpiry) && (
          <button onClick={() => { setSearch(''); setFilterIssuer(''); setFilterExpiry(''); }}
            className="text-sm text-blue-600 hover:underline">Clear filters</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">No certifications found.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Employee', 'Certification', 'Issuer', 'Issued', 'Expiry', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.employees?.name ?? c.employee_id}</div>
                    <div className="text-xs text-gray-500">{c.employees?.role ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{c.cert_name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.issuer ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.issued_date ? new Date(c.issued_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                  </td>
                  <td className="px-4 py-3"><ExpiryBadge date={c.expiry_date} /></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => deleteCert(c.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add Certification</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={saveCert} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
                <select value={form.employee_id} onChange={e => setForm(f => ({...f, employee_id: e.target.value}))} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select employee…</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.role ?? e.dept}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Certification Name *</label>
                <input value={form.cert_name} onChange={e => setForm(f => ({...f, cert_name: e.target.value}))} required
                  placeholder="e.g. Salesforce Administrator, AWS Solutions Architect…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issuer</label>
                <select value={form.issuer} onChange={e => setForm(f => ({...f, issuer: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select issuer…</option>
                  {ISSUERS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issued Date</label>
                  <input type="date" value={form.issued_date} max={today}
                    onChange={e => setForm(f => ({...f, issued_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input type="date" value={form.expiry_date}
                    onChange={e => setForm(f => ({...f, expiry_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} rows={2}
                  placeholder="Badge URL, credential ID, etc."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save Certification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
