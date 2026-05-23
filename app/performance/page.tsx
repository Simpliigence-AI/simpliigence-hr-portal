'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Employee, PerformanceReview } from '@/lib/database.types';
import { cn } from '@/lib/utils';

const KRAS = [
  'Innovation / Extra Mile','Meets Delivery Expectations/Commitments','Managing Critical Project Situations',
  'Client Management (Needs Intervention?)','Teamwork / Attitude','Ownership','Problem Solving',
  'Client Interaction Professionalism','Accountability','Critical Thinking',
  'Proactive in Solutions & Improvements','Independent as IC/Lead','Balances Quality & Speed',
  'Updating Skills','Positive Professional Attitude','Contribution to Team Morale/Culture',
  'Overall Feedback (Strengths/Improvements)',
];
const RATINGS = ['', 'Good', 'Very Good', 'Excellent', 'Outstanding', 'Needs Improvement'];
const CYCLES  = ['H1 2026', 'H2 2025', 'Annual 2025'];

function ratingClass(r: string) {
  if (r === 'Outstanding')       return 'bg-orange-100 text-orange-800';
  if (r === 'Excellent')         return 'bg-purple-100 text-purple-800';
  if (r === 'Very Good')         return 'bg-blue-100 text-blue-800';
  if (r === 'Good')              return 'bg-green-100 text-green-800';
  if (r === 'Needs Improvement') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-500';
}

type RowData = { employee: Employee; ratings: Record<string, string> };

export default function PerformancePage() {
  const [cycle,    setCycle]    = useState(CYCLES[0]);
  const [rows,     setRows]     = useState<RowData[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle]);

  async function loadData() {
    setLoading(true);
    const { data: employees } = await supabase.from('employees').select('*').eq('active', true).order('name');
    const { data: reviews   } = await supabase.from('performance_reviews').select('*').eq('cycle', cycle);

    const emps = (employees ?? []).filter(e => e.region === 'India');
    const reviewMap: Record<string, Record<string, string>> = {};
    for (const r of reviews ?? []) {
      reviewMap[r.employee_id] ??= {};
      reviewMap[r.employee_id][r.kra] = r.rating ?? '';
    }
    setRows(emps.map(e => ({ employee: e, ratings: reviewMap[e.id] ?? {} })));
    setLoading(false);
  }

  function setRating(empId: string, kra: string, rating: string) {
    setRows(rs => rs.map(r => r.employee.id === empId ? { ...r, ratings: { ...r.ratings, [kra]: rating } } : r));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    const upserts = rows.flatMap(r =>
      KRAS.map(kra => ({
        employee_id: r.employee.id,
        cycle,
        kra,
        rating: r.ratings[kra] || null,
      }))
    );
    await supabase.from('performance_reviews').upsert(upserts, { onConflict: 'employee_id,cycle,kra' });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // Summary counts
  const ratingCounts: Record<string, number> = {};
  for (const r of rows) for (const v of Object.values(r.ratings)) { if (v) ratingCounts[v] = (ratingCounts[v] ?? 0) + 1; }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading performance data…</div>;

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">KRA ratings by employee · {rows.length} employees</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={cycle} onChange={e => setCycle(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
            {CYCLES.map(c => <option key={c}>{c}</option>)}
          </select>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Ratings'}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {RATINGS.filter(Boolean).map(r => (
          <div key={r} className={cn('text-xs px-3 py-1 rounded-full font-medium', ratingClass(r))}>
            {r}: {ratingCounts[r] ?? 0}
          </div>
        ))}
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="text-xs border-collapse">
          <thead className="bg-[#0f1e3d] text-white sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 bg-[#0f1e3d] px-4 py-3 text-left font-semibold min-w-44 border-r border-white/20">Employee</th>
              {KRAS.map(kra => (
                <th key={kra} className="px-2 py-3 font-medium min-w-36 border-r border-white/10">
                  <div className="max-w-32 leading-tight">{kra}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.employee.id} className="hover:bg-blue-50 transition-colors">
                <td className="sticky left-0 bg-white px-4 py-2 font-medium text-gray-900 border-r border-gray-100 min-w-44">
                  <div>{r.employee.name}</div>
                  <div className="text-xs text-gray-400 font-normal">{r.employee.role}</div>
                </td>
                {KRAS.map(kra => (
                  <td key={kra} className="px-1 py-1 border-r border-gray-50">
                    <select
                      value={r.ratings[kra] ?? ''}
                      onChange={e => setRating(r.employee.id, kra, e.target.value)}
                      className={cn('w-full text-xs rounded px-1 py-0.5 border-0 focus:ring-1 focus:ring-blue-400', ratingClass(r.ratings[kra] ?? ''))}
                    >
                      {RATINGS.map(rt => <option key={rt} value={rt}>{rt || '—'}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
