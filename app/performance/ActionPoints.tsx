'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type ActionPoint = {
  id: string
  review_id: string
  employee_id: string
  category: string
  description: string
  priority: string
  status: string
  due_date: string | null
  assigned_to: string | null
  notes: string | null
  auto_generated: boolean
  created_at: string
}

type Props = {
  reviewId: string
  employeeId: string
  onClose?: () => void
}

const PRIORITIES = ['High', 'Medium', 'Low']
const STATUSES = ['Open', 'In Progress', 'Done', 'Deferred']

function priorityBadge(p: string) {
  if (p === 'High') return 'bg-red-100 text-red-700'
  if (p === 'Medium') return 'bg-amber-100 text-amber-700'
  return 'bg-green-100 text-green-700'
}

function statusBadge(s: string) {
  if (s === 'Done') return 'bg-green-50 text-green-600 border border-green-200'
  if (s === 'In Progress') return 'bg-blue-50 text-blue-600 border border-blue-200'
  if (s === 'Deferred') return 'bg-gray-50 text-gray-500 border border-gray-200'
  return 'bg-orange-50 text-orange-600 border border-orange-200'
}

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const STATUS_ORDER: Record<string, number> = { Open: 0, 'In Progress': 1, Deferred: 2, Done: 3 }

const EMPTY_NEW = {
  category: '', description: '', priority: 'Medium', status: 'Open',
  due_date: '', assigned_to: '', notes: '',
}

export default function ActionPoints({ reviewId, employeeId, onClose }: Props) {
  const [points, setPoints] = useState<ActionPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ActionPoint>>({})
  const [addingNew, setAddingNew] = useState(false)
  const [newForm, setNewForm] = useState(EMPTY_NEW)

  useEffect(() => { loadPoints() }, [reviewId])

  async function loadPoints() {
    setLoading(true)
    const { data } = await supabase
      .from('review_action_points')
      .select('*')
      .eq('review_id', reviewId)
      .order('created_at', { ascending: true })
    setPoints((data ?? []) as ActionPoint[])
    setLoading(false)
  }

  async function saveEdit(id: string) {
    setSaving(true)
    await supabase
      .from('review_action_points')
      .update({ ...editForm, updated_at: new Date().toISOString() })
      .eq('id', id)
    setEditId(null)
    await loadPoints()
    setSaving(false)
  }

  async function deletePoint(id: string) {
    if (!confirm('Delete this action point?')) return
    await supabase.from('review_action_points').delete().eq('id', id)
    await loadPoints()
  }

  async function addPoint() {
    if (!newForm.description.trim()) return
    setSaving(true)
    await supabase.from('review_action_points').insert({
      review_id: reviewId,
      employee_id: employeeId,
      category: newForm.category || 'General',
      description: newForm.description,
      priority: newForm.priority,
      status: newForm.status,
      due_date: newForm.due_date || null,
      assigned_to: newForm.assigned_to || null,
      notes: newForm.notes || null,
      auto_generated: false,
    })
    setNewForm(EMPTY_NEW)
    setAddingNew(false)
    await loadPoints()
    setSaving(false)
  }

  const sorted = [...points].sort((a, b) => {
    const po = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (po !== 0) return po
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  })

  const openCount = points.filter(p => p.status !== 'Done' && p.status !== 'Deferred').length
  const doneCount = points.filter(p => p.status === 'Done').length

  return (
    <div className="bg-white rounded-xl border border-indigo-100 shadow-sm mt-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-50 bg-indigo-50 rounded-t-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">Action Points</span>
            {points.length > 0 && (
              <span className="text-xs text-gray-400">{openCount} open · {doneCount} done</span>
            )}
          </div>
          <p className="text-xs text-indigo-500 mt-0.5">Auto-generated from review ratings — update status and assign owners</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setAddingNew(true); setEditId(null) }}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
            + Add Point
          </button>
          {onClose && (
            <button onClick={onClose}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
              Close ✕
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-4 text-sm text-gray-400 text-center">Loading action points…</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {addingNew && (
            <div className="p-4 bg-blue-50 border-b border-blue-100">
              <div className="text-xs font-semibold text-blue-700 mb-3">New Action Point</div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <input value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="Category (e.g. Delivery)" className="col-span-2 px-2 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-blue-300 outline-none" />
                <textarea value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Description (required)" rows={2} className="col-span-2 px-2 py-1.5 text-xs border rounded-lg resize-none focus:ring-2 focus:ring-blue-300 outline-none" />
                <select value={newForm.priority} onChange={e => setNewForm(f => ({ ...f, priority: e.target.value }))} className="px-2 py-1.5 text-xs border rounded-lg bg-white">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
                <select value={newForm.status} onChange={e => setNewForm(f => ({ ...f, status: e.target.value }))} className="px-2 py-1.5 text-xs border rounded-lg bg-white">
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <input type="date" value={newForm.due_date} onChange={e => setNewForm(f => ({ ...f, due_date: e.target.value }))} className="px-2 py-1.5 text-xs border rounded-lg" />
                <input value={newForm.assigned_to} onChange={e => setNewForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="Assigned to" className="px-2 py-1.5 text-xs border rounded-lg" />
                <input value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes (optional)" className="col-span-2 px-2 py-1.5 text-xs border rounded-lg" />
              </div>
              <div className="flex gap-2">
                <button onClick={addPoint} disabled={saving || !newForm.description.trim()} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50">Save</button>
                <button onClick={() => { setAddingNew(false); setNewForm(EMPTY_NEW) }} className="px-3 py-1.5 text-xs border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}

          {sorted.length === 0 && !addingNew && (
            <div className="p-6 text-center text-gray-300 text-sm">No action points yet</div>
          )}

          {sorted.map(pt => (
            <div key={pt.id} className={`p-4 hover:bg-gray-50 transition-colors ${pt.status === 'Done' ? 'opacity-50' : ''}`}>
              {editId === pt.id ? (
                <div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <input value={editForm.category ?? ''} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} placeholder="Category" className="px-2 py-1.5 text-xs border rounded-lg" />
                    <div />
                    <textarea value={editForm.description ?? ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={2} className="col-span-2 px-2 py-1.5 text-xs border rounded-lg resize-none focus:ring-2 focus:ring-blue-300 outline-none" />
                    <select value={editForm.priority ?? 'Medium'} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))} className="px-2 py-1.5 text-xs border rounded-lg bg-white">
                      {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                    </select>
                    <select value={editForm.status ?? 'Open'} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className="px-2 py-1.5 text-xs border rounded-lg bg-white">
                      {STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <input type="date" value={editForm.due_date ?? ''} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} className="px-2 py-1.5 text-xs border rounded-lg" />
                    <input value={editForm.assigned_to ?? ''} onChange={e => setEditForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="Assigned to" className="px-2 py-1.5 text-xs border rounded-lg" />
                    <input value={editForm.notes ?? ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" className="col-span-2 px-2 py-1.5 text-xs border rounded-lg" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(pt.id)} disabled={saving} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50">Save</button>
                    <button onClick={() => setEditId(null)} className="px-3 py-1.5 text-xs border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${priorityBadge(pt.priority)}`}>{pt.priority}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusBadge(pt.status)}`}>{pt.status}</span>
                      {pt.category && <span className="text-[10px] font-medium text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">{pt.category}</span>}
                      {pt.auto_generated && <span className="text-[10px] text-purple-400 italic">auto</span>}
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{pt.description}</p>
                    {(pt.assigned_to || pt.due_date || pt.notes) && (
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {pt.assigned_to && <span className="text-[10px] text-gray-400">👤 {pt.assigned_to}</span>}
                        {pt.due_date && <span className="text-[10px] text-gray-400">📅 Due {pt.due_date}</span>}
                        {pt.notes && <span className="text-[10px] text-gray-400 italic">"{pt.notes}"</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <button onClick={() => { setEditId(pt.id); setEditForm({ ...pt }); setAddingNew(false) }} className="px-2 py-1 text-[11px] text-blue-600 hover:underline font-medium">Edit</button>
                    <button onClick={() => deletePoint(pt.id)} className="px-2 py-1 text-[11px] text-red-400 hover:underline">Del</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
