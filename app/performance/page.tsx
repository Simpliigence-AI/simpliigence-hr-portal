'use client'
import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import DetailedTemplate from './DetailedTemplate'

type Employee = {
  id: string; name: string; role: string | null; dept: string | null
  manager: string | null; region: string | null; type: string | null
}

type Review = {
  id: string; employee_id: string; review_month: string
  manager_name: string | null; project: string | null; billable: boolean | null
  mood: string | null; targets: string | null; achievements: string | null
  overall_feedback: string | null; review_template: string | null
  detailed_data: Record<string,string> | null; created_at: string
  role_fitment: string|null; delivery: string|null; quality_speed: string|null
  updating_skills: string|null; ownership: string|null; accountability: string|null
  critical_thinking: string|null; innovation: string|null; independent: string|null
  critical_situations: string|null; client_mgmt: string|null; client_professional: string|null
  professional_attitude: string|null; team_morale: string|null
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const YEARS = [2024, 2025, 2026]
const BILLABLE_OPTS = ['Yes','No','Partial']
const MOOD_OPTS = ['Excellent','Good','Neutral','Needs Support']

function initForm(empId: string) {
  const now = new Date()
  return {
    employee_id: empId,
    sel_month: now.getMonth() + 1,
    sel_year: now.getFullYear(),
    manager_name: '',
    project: '',
    billable: true,
    mood: 'Good',
    targets: '',
    achievements: '',
    overall_feedback: '',
    review_template: 'standard',
    detailed_answers: {} as Record<string,string>,
  }
}

export default function PerformancePage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selected, setSelected] = useState<Employee | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [form, setForm] = useState(initForm(''))
  const [editReview, setEditReview] = useState<Review | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    supabase
      .from('employees')
      .select('id,name,role,dept,manager,region,type')
      .eq('active', true)
      .in('status', ['Active', 'Contractor'])
      .order('name')
      .then(({ data }) => {
        setEmployees((data ?? []) as Employee[])
        setLoading(false)
      })
  }, [])

  function selectEmployee(emp: Employee) {
    setSelected(emp)
    setShowForm(false)
    setEditReview(null)
    supabase
      .from('monthly_reviews')
      .select('*')
      .eq('employee_id', emp.id)
      .order('review_month', { ascending: false })
      .then(({ data }) => setReviews((data ?? []) as Review[]))
  }

  function startNew() {
    if (!selected) return
    setForm(initForm(selected.id))
    setEditReview(null)
    setFormKey(k => k + 1)
    setShowForm(true)
  }

  function startEdit(r: Review) {
    const d = new Date(r.review_month)
    setForm({
      employee_id: r.employee_id,
      sel_month: d.getMonth() + 1,
      sel_year: d.getFullYear(),
      manager_name: r.manager_name ?? '',
      project: r.project ?? '',
      billable: r.billable ?? true,
      mood: r.mood ?? 'Good',
      targets: r.targets ?? '',
      achievements: r.achievements ?? '',
      overall_feedback: r.overall_feedback ?? '',
      review_template: r.review_template ?? 'standard',
      detailed_answers: {
        role_fitment: r.role_fitment ?? '',
        delivery: r.delivery ?? '',
        quality_speed: r.quality_speed ?? '',
        updating_skills: r.updating_skills ?? '',
        ownership: r.ownership ?? '',
        accountability: r.accountability ?? '',
        critical_thinking: r.critical_thinking ?? '',
        innovation: r.innovation ?? '',
        independent: r.independent ?? '',
        critical_situations: r.critical_situations ?? '',
        client_mgmt: r.client_mgmt ?? '',
        client_professional: r.client_professional ?? '',
        professional_attitude: r.professional_attitude ?? '',
        team_morale: r.team_morale ?? '',
      },
    })
    setFormKey(k => k + 1)
    setEditReview(r)
    setShowForm(true)
  }

  const saveReview = useCallback(async () => {
    if (!selected) retur
    setSaving(true)
    const reviewMonth = `${form.sel_year}-${String(form.sel_month).padStart(2,'0')}-01`
    const a = form.detailed_answers
    const payload = {
      employee_id: selected.id,
      review_month: reviewMonth,
      manager_name: form.manager_name || null,
      project: form.project || null,
      billable: form.billable,
      mood: form.mood,
      targets: form.targets || null,
      achievements: form.achievements || null,
      overall_feedback: form.overall_feedback || null,
      review_template: form.review_template,
      detailed_data: form.review_template === 'detailed' ? a : null,
      role_fitment: a.role_fitment || null,
      delivery: a.delivery || null,
      quality_speed: a.quality_speed || null,
      updating_skills: a.updating_skills || a.skill_dev || null,
      ownership: a.ownership || null,
      accountability: a.accountability || null,
      critical_thinking: a.critical_thinking || null,
      innovation: a.innovation || null,
      independent: a.independent || a.autonomy || null,
      critical_situations: a.critical_situations || null,
      client_mgmt: a.client_mgmt || null,
      client_professional: a.client_professional || null,
      professional_attitude: a.professional_attitude || null,
      team_morale: a.team_morale || null,
    }
    const { error } = await supabase
      .from('monthly_reviews')
      .upsert(payload, { onConflict: 'employee_id,review_month' })
    if (error) { alert('Save failed: ' + error.message); setSaving(false); return }
    const { data } = await supabase
      .from('monthly_reviews')
      .select('*')
      .eq('employee_id', selected.id)
      .order('review_month', { ascending: false })
    setReviews((data ?? []) as Review[])
    setShowForm(false)
    setSaving(false)
  }, [form, selected])

  const F = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.role ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function formatMonth(dateStr: string) {
    const d = new Date(dateStr)
    return MONTHS[d.getMonth()] + ' ' + d.getFullYear()
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      <div className="w-[300px] border-r flex flex-col bg-gray-50 shrink-0">
        <div className="p-3 border-b bg-white">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees..." className="w-full px-3 py-1.5 text-sm border rounded-lg" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="p-4 text-sm text-gray-400">Loading...</div> :
            filtered.map(emp => (
              <button key={emp.id} onClick={() => selectEmployee(emp)}
                className={'w-full text-left px-4 py-3 border-b hover:bg-white transition-colors ' + (selected?.id === emp.id ? 'bg-white border-l-4 border-l-blue-500' : '')}>
                <div className="text-sm font-medium text-gray-900 truncate">{emp.name}</div>
                <div className="text-xs text-gray-400 truncate">{emp.role} · {emp.dept}</div>
              </button>
            ))
          }
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">Select an employee to view reviews</div>
        ) : (
          <>
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selected.name}</h2>
                <div className="text-xs text-gray-400">{selected.role} · {selected.dept}</div>
              </div>
              <button onClick={startNew} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-semibold hover:bg-blue-700">
                + New Monthly Review
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {showForm ? (
                <div className="bg-white rounded-xl border shadow-sm p-6 max-w-2xl">
                  <h3 className="text-base font-bold mb-4">{editReview ? 'Edit' : 'New'} Review — {selected.name}</h3>
                  <DetailedTemplate
                    key={formKey}
                    initialTemplate={form.review_template}
                    initialAnswers={form.detailed_answers}
                    onDataChange={function(template: string, data: Record<string,string>) {
                      setForm(f => ({ ...f, review_template: template, detailed_answers: data }))
                    }}
                  />
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Month</label>
                      <select value={form.sel_month} onChange={F('sel_month')} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
                        {MONTHS.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Year</label>
                      <select value={form.sel_year} onChange={F('sel_year')} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
                        {YEARS.map(y => <option key={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Manager / Reviewer</label>
                      <input value={form.manager_name} onChange={F('manager_name')} placeholder="Name" className="w-full px-3 py-2 text-sm border rounded-lg" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Project</label>
                      <input value={form.project} onChange={F('project')} placeholder="Current project" className="w-full px-3 py-2 text-sm border rounded-lg" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Billable</label>
                      <select value={form.billable ? 'Yes' : 'No'} onChange={e => setForm(f => ({ ...f, billable: e.target.value === 'Yes' }))} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
                        {BILLABLE_OPTS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Mood / Sentiment</label>
                      <select value={form.mood} onChange={F('mood')} className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
                        {MOOD_OPTS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Targets / Goals</label>
                    <textarea value={form.targets} onChange={F('targets')} rows={2} placeholder="Goals..." className="w-full px-3 py-2 text-sm border rounded-lg resize-none" />
                  </div>
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Achievements</label>
                    <textarea value={form.achievements} onChange={F('achievements')} rows={2} placeholder="Key achievements..." className="w-full px-3 py-2 text-sm border rounded-lg resize-none" />
                  </div>
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Overall Feedback</label>
                    <textarea value={form.overall_feedback} onChange={F('overall_feedback')} rows={3} placeholder="Overall feedback..." className="w-full px-3 py-2 text-sm border rounded-lg resize-none" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={saveReview} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save Review'}
                    </button>
                  </div>
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-12 text-gray-300 text-sm">No reviews yet — click + New Monthly Review</div>
              ) : (
                <div className="space-y-3 max-w-2xl">
                  {reviews.map(r => (
                    <div key={r.id} className="bg-white rounded-xl border p-4 hover:shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-gray-900 text-sm">{formatMonth(r.review_month)}</div>
                        <div className="flex items-center gap-2">
                          {r.review_template === 'detailed' && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Detailed</span>}
                          {r.mood && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{r.mood}</span>}
                          <button onClick={() => startEdit(r)} className="text-xs text-blue-600 hover:underline">Edit</button>
                        </div>
                      </div>
                      {r.manager_name && <div className="text-xs text-gray-400">Reviewed by {r.manager_name}</div>}
                      {r.overall_feedback && <div className="text-sm text-gray-600 mt-2 line-clamp-2">{r.overall_feedback}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
