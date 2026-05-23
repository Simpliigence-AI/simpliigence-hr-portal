'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Employee } from '@/lib/database.types';
import { formatDate, getDeptColor, tenureYears, cn } from '@/lib/utils';
import Avatar from '@/components/Avatar';

const DEPTS = ['All', 'Delivery', 'HR', 'Finance', 'Sales', 'Marketing', 'Operations', 'Talent Mgmt', 'Leadership'];
const REGIONS = ['All', 'India', 'USA'];
const TYPES = ['All', 'FTE', 'FT', 'Contractor'];

export default function DossierPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [dept,      setDept]      = useState('All');
  const [region,    setRegion]    = useState('All');
  const [type,      setType]      = useState('All');
  const [selected,  setSelected]  = useState<Employee | null>(null);
  const [revealed,  setRevealed]  = useState<Record<string, boolean>>({});
  const [view,      setView]      = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    supabase.from('employees').select('*').eq('active', true)
      .order('name')
      .then(({ data }) => { setEmployees(data ?? []); setLoading(false); });
  }, []);

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    if (q && !e.name.toLowerCase().includes(q) && !e.role?.toLowerCase().includes(q) && !e.location?.toLowerCase().includes(q)) return false;
    if (dept !== 'All' && e.dept !== dept) return false;
    if (region !== 'All' && e.region !== region) return false;
    if (type !== 'All' && e.type !== type) return false;
    return true;
  });

  const toggle = (key: string) => setRevealed(r => ({ ...r, [key]: !r[key] }));

  if (loading) return (
    <div className="p-8 flex items-center justify-center h-full">
      <div className="text-gray-400 text-sm">Loading employees…</div>
    </div>
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Dossier</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} of {employees.length} employees</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('grid')} className={cn('px-3 py-1.5 text-sm rounded-lg border', view === 'grid' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600')}>Grid</button>
          <button onClick={() => setView('list')} className={cn('px-3 py-1.5 text-sm rounded-lg border', view === 'list' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600')}>List</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search name, role, location…"
          className="flex-1 min-w-48 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {[
          { label: 'Dept', value: dept, set: setDept, options: DEPTS },
          { label: 'Region', value: region, set: setRegion, options: REGIONS },
          { label: 'Type', value: type, set: setType, options: TYPES },
        ].map(f => (
          <select key={f.label} value={f.value} onChange={e => f.set(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            {f.options.map(o => <option key={o}>{o}</option>)}
          </select>
        ))}
      </div>

      {/* Grid view */}
      {view === 'grid' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(e => (
            <div key={e.id} onClick={() => setSelected(e)}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all">
              <div className="flex flex-col items-center text-center gap-2">
                <Avatar name={e.name} photoUrl={e.photo_url} size="lg" />
                <div>
                  <div className="font-semibold text-sm text-gray-900 leading-tight">{e.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{e.role}</div>
                </div>
                <div className="flex flex-wrap gap-1 justify-center">
                  <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                    style={{ backgroundColor: getDeptColor(e.dept ?? '') }}>{e.dept}</span>
                  {e.type && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{e.type}</span>}
                  {e.wfo && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{e.wfo}</span>}
                </div>
                <div className="text-xs text-gray-400">{e.location} · {tenureYears(e.joined)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Employee', 'Role', 'Department', 'Location', 'Manager', 'Type', 'Joined', 'BGV'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(e => (
                <tr key={e.id} onClick={() => setSelected(e)}
                  className="hover:bg-blue-50 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={e.name} photoUrl={e.photo_url} size="sm" />
                      <span className="font-medium">{e.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.role}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: getDeptColor(e.dept ?? '') }}>{e.dept}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{e.location}</td>
                  <td className="px-4 py-3 text-gray-600">{e.manager ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{e.type}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(e.joined)}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                      e.bgv === 'Verified' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700')}>{e.bgv}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Profile Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="p-6 border-b flex items-start gap-4">
              <Avatar name={selected.name} photoUrl={selected.photo_url} size="lg" />
              <div className="flex-1">
                <h2 className="text-xl font-bold">{selected.name}</h2>
                <p className="text-gray-500 text-sm">{selected.role} · {selected.dept}</p>
                <div className="flex gap-2 mt-2">
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{selected.type}</span>
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">{selected.wfo}</span>
                  {selected.bgv && <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">BGV: {selected.bgv}</span>}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="p-6 grid sm:grid-cols-2 gap-6">
              {/* Employment */}
              <Section title="Employment">
                <Row label="ID"        value={selected.id} />
                <Row label="Employee ID" value={selected.id} />
                <Row label="Location"  value={selected.location} />
                <Row label="Region"    value={selected.region} />
                <Row label="Manager"   value={selected.manager} />
                <Row label="Joined"    value={formatDate(selected.joined)} />
                <Row label="Tenure"    value={tenureYears(selected.joined)} />
              </Section>

              {/* Visa / Compliance */}
              <Section title="Visa & Compliance">
                <Row label="Visa Status" value={selected.visa} />
                <Row label="Visa Expiry" value={formatDate(selected.visa_expiry)}
                  highlight={selected.visa_expiry && new Date(selected.visa_expiry) < new Date(Date.now() + 90 * 86400000) ? 'red' : undefined} />
                <Row label="BGV"        value={selected.bgv} />
                <Row label="SOW"        value={selected.sow} />
                <Row label="SOW Expiry" value={formatDate(selected.sow_expiry)} />
              </Section>

              {/* Contact (sensitive) */}
              <Section title="Contact (click to reveal)">
                <div className="space-y-1 text-sm">
                  <SensitiveRow label="Phone"     value={selected.phone}     field="phone"     id={selected.id} revealed={revealed} toggle={toggle} />
                  <SensitiveRow label="Emergency" value={selected.emergency} field="emergency" id={selected.id} revealed={revealed} toggle={toggle} />
                </div>
              </Section>

              {/* Compensation */}
              <Section title="Compensation (click to reveal)">
                <div className="space-y-1 text-sm">
                  <SensitiveRow label="Salary (₹/mo)"  value={selected.salary ? selected.salary.toLocaleString('en-IN') : null} field="salary" id={selected.id} revealed={revealed} toggle={toggle} />
                  <SensitiveRow label="Hike"           value={selected.hike ? `${selected.hike}%` : null}  field="hike"   id={selected.id} revealed={revealed} toggle={toggle} />
                  <SensitiveRow label="Last Appraisal" value={selected.appraisal} field="appraisal" id={selected.id} revealed={revealed} toggle={toggle} />
                </div>
              </Section>

              {/* Skills */}
              {selected.skills.length > 0 && (
                <Section title="Skills">
                  <div className="flex flex-wrap gap-1.5">
                    {selected.skills.map(s => <span key={s} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">{s}</span>)}
                  </div>
                </Section>
              )}

              {/* Manager check-in notes */}
              {selected.check_in && (
                <Section title="Manager Notes" className="sm:col-span-2">
                  <p className="text-sm text-gray-700 leading-relaxed">{selected.check_in}</p>
                </Section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value?: string | null; highlight?: 'red' }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={cn('font-medium text-right max-w-48 truncate', highlight === 'red' ? 'text-red-600' : 'text-gray-800')}>{value ?? '—'}</span>
    </div>
  );
}

function SensitiveRow({ label, value, field, id, revealed, toggle }: {
  label: string; value?: string | null; field: string; id: string;
  revealed: Record<string, boolean>; toggle: (k: string) => void;
}) {
  const key = `${id}-${field}`;
  const show = revealed[key];
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span onClick={() => toggle(key)} className={cn('font-medium cursor-pointer select-none', !show && 'filter blur-sm')}>{value ?? '—'}</span>
    </div>
  );
}
