'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Joiner = {
  id: string; candidate_name: string; role: string | null; dept: string | null
  location: string | null; offer_status: string; offer_date: string | null
  joining_date: string | null; last_connect: string | null
  recruiter: string | null; notes: string | null; created_at: string
}

const STATUSES = ['Offer Extended', 'Offer Accepted', 'Joined', 'Declined', 'On Hold']
const STATUS_CLS: Record<string, string> = {
  'Offer Extended': 'bg-blue-100 text-blue-700',
  'Offer Accepted': 'bg-emerald-100 text-emerald-700',
  'Joined': 'bg-green-100 text-green-700',
  'Declined': 'bg-red-100 text-red-700',
  'On Hold': 'bg-amber-100 text-amber-700',
}
const ACTIVE_STATUSES = ['Offer Extended', 'Offer Accepted', 'On Hold']

const EMPTY = {
  candidate_name: '', role: '', dept: '', location: '',
  offer_status: 'Offer Extended', offer_date: '', joining_date: '',
  last_connect: '', recruiter: '', notes: '',
}

function daysSince(d: string | null) {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000)
}
function daysUntil(d: string | null) {
  if (!d) return null
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000)
}
function fmt(d: string | null) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

export default function JoiningPipelinePage() {
  const [rows, setRows] = useState<Joiner[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Joiner | null>(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState('Active')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('joining_pipeline').select('*')
      .order('joining_date', { ascending: true, nullsFirst: false })
    setRows((data ?? []) as Joiner[])
    setLoading(false)
  }

  function startNew() {
    setForm({ ...EMPTY }); setEditing(null); setShowForm(true)
  }

  function startEdit(r: Joiner) {
    setForm({
      candidate_name: r.candidate_name, role: r.role ?? '', dept: r.dept ?? '',
      location: r.location ?? '', offer_status: r.offer_status,
      offer_date: r.offer_date ?? '', joining_date: r.joining_date ?? '',
      last_connect: r.last_connect ?? '', recruiter: r.recruiter ?? '', notes: r.notes ?? '',
    })
    setEditing(r); setShowForm(true)
  }

  async function save() {
    if (!form.candidate_name.trim()) { alert('Joiner name is required'); return }
    setSaving(true)
    const payload = {
      candidate_name: form.candidate_name.trim(),
      role: form.role || null, dept: form.dept || null, location: form.location || null,
      offer_status: form.offer_status,
      offer_date: form.offer_date || null, joining_date: form.joining_date || null,
      last_connect: form.last_connect || null,
      recruiter: form.recruiter || null, notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = editing
      ? await supabase.from('joining_pipeline').update(payload).eq('id', editing.id)
      : await supabase.from('joining_pipeline').insert(payload)
    if (error) { alert('Save failed: ' + error.message); setSaving(false); return }
    setShowForm(false); setSaving(false); load()
  }

  async function remove(r: Joiner) {
    if (!confirm(`Remove ${r.candidate_name} from the pipeline?`)) return
    await supabase.from('joining_pipeline').delete().eq('id', r.id)
    load()
  }

  async function touchConnect(r: Joiner) {
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('joining_pipeline').update({ last_connect: today, updated_at: new Date().toISOString() }).eq('id', r.id)
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, last_connect: today } : x))
  }

  const F = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const filtered = rows.filter(r =>
    statusFilter === 'All' ? true :
    statusFilter === 'Active' ? ACTIVE_STATUSES.includes(r.offer_status) :
    r.offer_status === statusFilter
  )

  const active = rows.filter(r => ACTIVE_STATUSES.includes(r.offer_status))
  const needsConnect = active.filter(r => { const d = daysSince(r.last_connect); return d === null || d > 7 })
  const joiningSoon = active.filter(r => { const d = daysUntil(r.joining_date); return d !== null && d >= 0 && d <= 14 })

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Joining Pipeline</h1>
          <p className="text-sm text-gray-400">Track offered candidates through to joining</p>
        </div>
        <button onClick={startNew} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-semibold hover:bg-blue-700">
          + Add Joiner
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-gray-900">{active.length}</div>
          <div className="text-xs text-gray-400 mt-1">In pipeline</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-green-600">{rows.filter(r => r.offer_status === 'Joined').length}</div>
          <div className="text-xs text-gray-400 mt-1">Joined</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-amber-600">{joiningSoon.length}</div>
          <div className="text-xs text-gray-400 mt-1">Joining within 14 days</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className={`text-2xl font-bold ${needsConnect.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>{needsConnect.length}</div>
          <div className="text-xs text-gray-400 mt-1">Need connect (7+ days)</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {['Active', 'All', ...STATUSES].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}>
            {s}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border shadow-sm p-6 mb-5 max-w-2xl">
          <h3 className="text-base font-bold mb-4">{editing ? 'Edit' : 'Add'} Joiner</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Joiner Name *</label>
              <input value={form.candidate_name} onChange={F('candidate_name')} placeholder="Full name" className="w-full px-3 py-2 text-sm border rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Role</label>
              <input value={form.role} onChange={F('role')} placeholder="e.g. Salesforce Developer" className="w-full px-3 py-2 text-sm border rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Department / BU</label>
              <input value={form.dept} onChange={F('dept')} placeholder="Department" className="w-full px-3 py-2 text-sm border rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Location</label>
              <input value={form.location} onChange={F('location')} placeholder="e.g. Bangalore" className="w-full px-3 py-2 text-sm border rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Offer Status</label>
              <select value={form.offer_status} onChange={F('offer_status')} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Recruiter / Owner</label>
              <input value={form.recruiter} onChange={F('recruiter')} placeholder="Who owns this joiner" className="w-full px-3 py-2 text-sm border rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Offer Date</label>
              <input type="date" value={form.offer_date} onChange={F('offer_date')} className="w-full px-3 py-2 text-sm border rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Joining Date</label>
              <input type="date" value={form.joining_date} onChange={F('joining_date')} className="w-full px-3 py-2 text-sm border rounded-lg" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Last Connect</label>
              <input type="date" value={form.last_connect} onChange={F('last_connect')} className="w-full px-3 py-2 text-sm border rounded-lg" />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={F('notes')} rows={2} placeholder="Notes from last connect, documents pending, etc." className="w-full px-3 py-2 text-sm border rounded-lg resize-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-300 text-sm">No joiners in this view — click + Add Joiner</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 font-semibold">Joiner</th>
                <th className="px-4 py-3 font-semibold">Offer</th>
                <th className="px-4 py-3 font-semibold">Joining Date</th>
                <th className="px-4 py-3 font-semibold">Last Connect</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const connectDays = daysSince(r.last_connect)
                const joinDays = daysUntil(r.joining_date)
                const isActive = ACTIVE_STATUSES.includes(r.offer_status)
                const connectStale = isActive && (connectDays === null || connectDays > 7)
                return (
                  <tr key={r.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{r.candidate_name}</div>
                      <div className="text-xs text-gray-400">{[r.role, r.location].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLS[r.offer_status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.offer_status}
                      </span>
                      <div className="text-xs text-gray-400 mt-1">{fmt(r.offer_date)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{fmt(r.joining_date)}</div>
                      {isActive && joinDays !== null && joinDays >= 0 && (
                        <div className={`text-xs mt-0.5 ${joinDays <= 14 ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>in {joinDays} day{joinDays !== 1 ? 's' : ''}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className={connectStale ? 'text-red-600 font-semibold' : 'text-gray-900'}>{fmt(r.last_connect)}</div>
                      {connectDays !== null && <div className="text-xs text-gray-400 mt-0.5">{connectDays === 0 ? 'today' : connectDays + 'd ago'}</div>}
                      {isActive && (
                        <button onClick={() => touchConnect(r)} className="text-xs text-blue-600 hover:underline mt-0.5">Connected today</button>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="text-xs text-gray-500 line-clamp-2">{r.notes ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(r)} className="text-xs text-blue-600 hover:underline mr-3">Edit</button>
                      <button onClick={() => remove(r)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
