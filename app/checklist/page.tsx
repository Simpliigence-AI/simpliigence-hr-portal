'use client'
import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'

// Types
type Checklist = {
  id: string
  week_start: string
  status: 'in_progress' | 'completed'
  created_by: string | null
  created_at: string
}

type ChecklistItem = {
  id: string
  checklist_id: string
  item_key: string
  item_label: string
  is_reviewed: boolean
  notes: string | null
  sort_order: number
}

type ChecklistAction = {
  id: string
  checklist_id: string
  item_key: string
  description: string
  assigned_to: string | null
  due_date: string | null
  status: 'Open' | 'In Progress' | 'Done' | 'Deferred'
  created_at: string
}

type ReviewStat = { employee_id: string; employee_name: string; reviewed: boolean }
type ActionStat = { id: string; title: string; status: string; owner: string | null }

const CHECKLIST_TEMPLATE = [
  { key: 'monthly_reviews',  label: 'Monthly Reviews',                         icon: '📊' },
  { key: 'timesheets',       label: 'Timesheets & Compliance',                 icon: '🕐' },
  { key: 'offers_joinings',  label: 'Offers, Joinings & Attrition',            icon: '🤝' },
  { key: 'action_trackers',  label: 'Action Trackers',                         icon: '✅' },
  { key: 'policies',         label: 'Policies',                                icon: '📋' },
  { key: 'certifications',   label: 'Certifications, Visa & Compliance',       icon: '🏅' },
  { key: 'communications',   label: 'LinkedIn, Ambition Box & Employee Comms', icon: '📣' },
  { key: 'others',           label: 'Others',                                  icon: '💬' },
]

function getMondayOf(d: Date): string {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const m = new Date(d); m.setDate(diff)
  return m.toISOString().split('T')[0]
}

function fmtWeek(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00Z')
  const end = new Date(start); end.setDate(start.getDate() + 6)
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function statusColour(s: string) {
  if (s === 'Done')        return 'bg-green-100 text-green-700'
  if (s === 'In Progress') return 'bg-blue-100 text-blue-700'
  if (s === 'Deferred')    return 'bg-gray-100 text-gray-500'
  return 'bg-orange-100 text-orange-700'
}

export default function WeeklyChecklistPage() {
    const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )
  const [checklists,      setChecklists]      = useState<Checklist[]>([])
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [items,           setItems]           = useState<ChecklistItem[]>([])
  const [actions,         setActions]         = useState<ChecklistAction[]>([])
  const [prevActions,     setPrevActions]     = useState<ChecklistAction[]>([])
  const [reviewStats,     setReviewStats]     = useState<ReviewStat[]>([])
  const [openActions,     setOpenActions]     = useState<ActionStat[]>([])
  const [loading,         setLoading]         = useState(true)
  const [saving,          setSaving]          = useState(false)
  const [expandedKeys,    setExpandedKeys]    = useState<Set<string>>(new Set(CHECKLIST_TEMPLATE.map(t => t.key)))
  const [addingAction,    setAddingAction]    = useState<string | null>(null)
  const [newActionForm,   setNewActionForm]   = useState({ description: '', assigned_to: '', due_date: '' })

  const selected = checklists.find(c => c.id === selectedId)

  async function loadChecklists() {
    setLoading(true)
    const { data } = await supabase.from('hr_weekly_checklists').select('*').order('week_start', { ascending: false })
    setChecklists((data ?? []) as Checklist[])
    setLoading(false)
  }

  useEffect(() => { loadChecklists() }, [])

  const loadSelected = useCallback(async (id: string, allChecklists: Checklist[]) => {
    const [itemsRes, actionsRes] = await Promise.all([
      supabase.from('hr_checklist_items').select('*').eq('checklist_id', id).order('sort_order'),
      supabase.from('hr_checklist_actions').select('*').eq('checklist_id', id).order('created_at'),
    ])
    setItems((itemsRes.data ?? []) as ChecklistItem[])
    setActions((actionsRes.data ?? []) as ChecklistAction[])
    const current = allChecklists.find(c => c.id === id)
    if (current) {
      const prev = allChecklists.find(c => c.week_start < current.week_start)
      if (prev) {
        const { data } = await supabase.from('hr_checklist_actions').select('*').eq('checklist_id', prev.id).in('status', ['Open', 'In Progress']).order('created_at')
        setPrevActions((data ?? []) as ChecklistAction[])
      } else { setPrevActions([]) }
    }
  }, [])

  useEffect(() => { if (selectedId) loadSelected(selectedId, checklists) }, [selectedId, checklists, loadSelected])

  useEffect(() => {
    async function loadReviewStats() {
      const now = new Date()
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const end   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`
      const [empRes, revRes] = await Promise.all([
        supabase.from('employees').select('id, full_name').eq('status', 'Active'),
        supabase.from('monthly_reviews').select('employee_id').gte('review_month', start).lte('review_month', end),
      ])
      const reviewedIds = new Set((revRes.data ?? []).map((r: { employee_id: string }) => r.employee_id))
      setReviewStats((empRes.data ?? []).map((e: { id: string; full_name: string }) => ({ employee_id: e.id, employee_name: e.full_name, reviewed: reviewedIds.has(e.id) })))
    }
    loadReviewStats()
  }, [])

  useEffect(() => {
    supabase.from('action_items').select('id, title, status, owner').in('status', ['Open', 'In Progress']).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setOpenActions((data ?? []) as ActionStat[]))
  }, [])

  async function createChecklist() {
    setSaving(true)
    try {
      const weekStart = getMondayOf(new Date())
      const { data: existing } = await supabase.from('hr_weekly_checklists').select('id').eq('week_start', weekStart).single()
      if (existing) { setSelectedId(existing.id); return }
      const { data: cl, error } = await supabase.from('hr_weekly_checklists').insert({ week_start: weekStart }).select().single()
      if (error || !cl) { alert('Failed to create checklist'); return }
      await supabase.from('hr_checklist_items').insert(CHECKLIST_TEMPLATE.map((t, i) => ({ checklist_id: cl.id, item_key: t.key, item_label: t.label, sort_order: i })))
      await loadChecklists()
      setSelectedId(cl.id)
    } finally { setSaving(false) }
  }

  async function toggleReviewed(item: ChecklistItem) {
    const newVal = !item.is_reviewed
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, is_reviewed: newVal } : it))
    await supabase.from('hr_checklist_items').update({ is_reviewed: newVal, updated_at: new Date().toISOString() }).eq('id', item.id)
  }

  async function saveNotes(item: ChecklistItem, notes: string) {
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, notes } : it))
    await supabase.from('hr_checklist_items').update({ notes, updated_at: new Date().toISOString() }).eq('id', item.id)
  }

  async function addAction(itemKey: string) {
    if (!newActionForm.description.trim() || !selectedId) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('hr_checklist_actions').insert({ checklist_id: selectedId, item_key: itemKey, description: newActionForm.description, assigned_to: newActionForm.assigned_to || null, due_date: newActionForm.due_date || null, status: 'Open' }).select().single()
      if (error || !data) { alert('Failed to add action: ' + error?.message); return }
      setActions(prev => [...prev, data as ChecklistAction])
      setNewActionForm({ description: '', assigned_to: '', due_date: '' })
      setAddingAction(null)
    } finally { setSaving(false) }
  }

  async function updateActionStatus(id: string, status: ChecklistAction['status']) {
    setActions(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    await supabase.from('hr_checklist_actions').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  }

  async function markComplete() {
    if (!selectedId) return
    await supabase.from('hr_weekly_checklists').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', selectedId)
    setChecklists(prev => prev.map(c => c.id === selectedId ? { ...c, status: 'completed' } : c))
  }

  const reviewedCount = items.filter(i => i.is_reviewed).length
  const totalCount    = items.length
  const pct           = totalCount > 0 ? Math.round((reviewedCount / totalCount) * 100) : 0
  const reviewedEmps  = reviewStats.filter(r => r.reviewed)
  const pendingEmps   = reviewStats.filter(r => !r.reviewed)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-800 mb-3">HR Weekly Checklist</h2>
          <button onClick={createChecklist} disabled={saving} className="w-full px-3 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : '+ New Week'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? <div className="text-xs text-gray-400 text-center pt-8">Loading…</div>
          : checklists.length === 0 ? <div className="text-xs text-gray-400 text-center pt-8">No checklists yet.<br />Click + New Week to start.</div>
          : checklists.map(cl => (
            <button key={cl.id} onClick={() => setSelectedId(cl.id)} className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors ${selectedId === cl.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'}`}>
              <div className="text-xs font-semibold text-gray-800">{fmtWeek(cl.week_start)}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cl.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {cl.status === 'completed' ? 'Completed' : 'In Progress'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <div className="text-lg font-semibold text-gray-600 mb-1">No checklist selected</div>
            <div className="text-sm">Select a week on the left, or click + New Week.</div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Week of {selected ? fmtWeek(selected.week_start) : ''}</h1>
                <p className="text-sm text-gray-500 mt-0.5">HR Weekly Review — track, discuss, and action each area</p>
              </div>
              <div className="flex items-center gap-3">
                {selected?.status !== 'completed' && reviewedCount === totalCount && totalCount > 0 && (
                  <button onClick={markComplete} className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors">Mark Complete ✓</button>
                )}
                {selected?.status === 'completed' && <span className="px-3 py-1.5 bg-green-100 text-green-700 text-sm font-semibold rounded-lg">✓ Completed</span>}
              </div>
            </div>

            {/* Progress */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-6 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>{reviewedCount} of {totalCount} items reviewed</span>
                  <span className="font-semibold text-gray-700">{pct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#4f46e5' }} />
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-800">{pct}%</div>
            </div>

            {/* Checklist items */}
            {items.slice().sort((a, b) => a.sort_order - b.sort_order).map(item => {
              const tpl         = CHECKLIST_TEMPLATE.find(t => t.key === item.item_key)
              const isExpanded  = expandedKeys.has(item.item_key)
              const itemActions = actions.filter(a => a.item_key === item.item_key)
              const carryFwd    = prevActions.filter(a => a.item_key === item.item_key)
              const isAddingHere = addingAction === item.item_key

              return (
                <div key={item.id} className="bg-white rounded-xl border border-gray-100 mb-3 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setExpandedKeys(prev => { const next = new Set(prev); isExpanded ? next.delete(item.item_key) : next.add(item.item_key); return next })}>
                    <button onClick={e => { e.stopPropagation(); toggleReviewed(item) }} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${item.is_reviewed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>
                      {item.is_reviewed && <span className="text-[10px] font-bold">✓</span>}
                    </button>
                    <span className="text-base">{tpl?.icon ?? '📌'}</span>
                    <span className={`text-sm font-semibold flex-1 ${item.is_reviewed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{item.item_label}</span>
                    <div className="flex items-center gap-2">
                      {itemActions.length > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-600 font-semibold px-1.5 py-0.5 rounded-full">{itemActions.length} action{itemActions.length !== 1 ? 's' : ''}</span>}
                      {carryFwd.length > 0 && <span className="text-[10px] bg-amber-100 text-amber-600 font-semibold px-1.5 py-0.5 rounded-full">{carryFwd.length} carried fwd</span>}
                      <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-50">
                      {/* Live: Monthly Reviews */}
                      {item.item_key === 'monthly_reviews' && reviewStats.length > 0 && (
                        <div className="mt-3 mb-3 p-3 bg-indigo-50 rounded-lg">
                          <div className="text-xs font-semibold text-indigo-700 mb-2">This Month — {reviewedEmps.length}/{reviewStats.length} reviewed</div>
                          <div className="flex gap-4">
                            <div className="flex-1">
                              <div className="text-[11px] font-semibold text-green-700 mb-1">✓ Reviewed ({reviewedEmps.length})</div>
                              <div className="flex flex-wrap gap-1">
                                {reviewedEmps.map(e => <span key={e.employee_id} className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">{e.employee_name}</span>)}
                                {reviewedEmps.length === 0 && <span className="text-[11px] text-gray-400">None yet</span>}
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="text-[11px] font-semibold text-red-600 mb-1">Pending ({pendingEmps.length})</div>
                              <div className="flex flex-wrap gap-1">
                                {pendingEmps.map(e => <span key={e.employee_id} className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{e.employee_name}</span>)}
                                {pendingEmps.length === 0 && <span className="text-[11px] text-green-600 font-medium">All done!</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Live: Action Trackers */}
                      {item.item_key === 'action_trackers' && openActions.length > 0 && (
                        <div className="mt-3 mb-3 p-3 bg-amber-50 rounded-lg">
                          <div className="text-xs font-semibold text-amber-700 mb-2">Open Action Items ({openActions.length})</div>
                          <div className="space-y-1">
                            {openActions.slice(0, 8).map(a => (
                              <div key={a.id} className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${statusColour(a.status)}`}>{a.status}</span>
                                <span className="text-[11px] text-gray-700 truncate">{a.title}</span>
                                {a.owner && <span className="text-[10px] text-gray-400 shrink-0">👤 {a.owner}</span>}
                              </div>
                            ))}
                            {openActions.length > 8 && <div className="text-[10px] text-amber-600 font-medium">+{openActions.length - 8} more in Action Tracker</div>}
                          </div>
                        </div>
                      )}

                      {/* Carry-forward */}
                      {carryFwd.length > 0 && (
                        <div className="mt-3 mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="text-xs font-semibold text-yellow-700 mb-2">Carried forward from last week ({carryFwd.length})</div>
                          <div className="space-y-1.5">
                            {carryFwd.map(a => (
                              <div key={a.id} className="flex items-start gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${statusColour(a.status)}`}>{a.status}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[11px] text-gray-700">{a.description}</div>
                                  {a.assigned_to && <div className="text-[10px] text-gray-400">👤 {a.assigned_to}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      <div className="mt-3">
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Notes / Discussion Points</label>
                        <textarea defaultValue={item.notes ?? ''} onBlur={e => saveNotes(item, e.target.value)} placeholder="Add notes from the discussion…" rows={3} className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-indigo-300 outline-none bg-gray-50 placeholder-gray-400" />
                      </div>

                      {/* Existing actions */}
                      {itemActions.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-gray-500 mb-2">Action Items</div>
                          <div className="space-y-1.5">
                            {itemActions.map(a => (
                              <div key={a.id} className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2">
                                <select value={a.status} onChange={e => updateActionStatus(a.id, e.target.value as ChecklistAction['status'])} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border-0 outline-none cursor-pointer shrink-0 ${statusColour(a.status)}`}>
                                  {['Open','In Progress','Done','Deferred'].map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-gray-700">{a.description}</div>
                                  <div className="flex items-center gap-3 mt-0.5">
                                    {a.assigned_to && <span className="text-[10px] text-gray-400">👤 {a.assigned_to}</span>}
                                    {a.due_date    && <span className="text-[10px] text-gray-400">Due {a.due_date}</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add action */}
                      {isAddingHere ? (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                          <div className="text-xs font-semibold text-blue-700 mb-2">New Action Item</div>
                          <textarea value={newActionForm.description} onChange={e => setNewActionForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the action (required)…" rows={2} className="w-full px-2 py-1.5 text-xs border rounded-lg resize-none mb-2 outline-none focus:ring-2 focus:ring-blue-300" />
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input value={newActionForm.assigned_to} onChange={e => setNewActionForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="Assigned to" className="px-2 py-1.5 text-xs border rounded-lg outline-none" />
                            <input type="date" value={newActionForm.due_date} onChange={e => setNewActionForm(f => ({ ...f, due_date: e.target.value }))} className="px-2 py-1.5 text-xs border rounded-lg outline-none" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => addAction(item.item_key)} disabled={saving || !newActionForm.description.trim()} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save Action'}</button>
                            <button onClick={() => { setAddingAction(null); setNewActionForm({ description: '', assigned_to: '', due_date: '' }) }} className="px-3 py-1.5 text-xs border rounded-lg text-gray-600">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingAction(item.item_key); setNewActionForm({ description: '', assigned_to: '', due_date: '' }) }} className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                          + Add Action Item
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
