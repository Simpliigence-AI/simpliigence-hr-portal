'use client'
import { useState, useCallback, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import DetailedTemplate from './DetailedTemplate'
import ActionPoints from './ActionPoints'
import { calculateScore, calculateTrend, generateActionPoints, type TrendDirection } from '@/lib/scoring'

const ADMIN_EMAIL = 'raghu.seetharam@simpliigence.com'

// Collect all direct + indirect reports recursively
function getReports(all: any[], managerName: string): any[] {
  const direct = all.filter(e =>
    (e.manager ?? '').trim().toLowerCase() === managerName.trim().toLowerCase()
  )
  return [...direct, ...direct.flatMap(d => getReports(all, d.name))]
}

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
  composite_score: number | null
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

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 75 ? 'bg-green-100 text-green-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`} title="Composite performance score">
      {score}/100
    </span>
  )
}

const TREND_CFG: Record<TrendDirection, { icon: string; cls: string; label: string }> = {
  up_strong:   { icon: '\u2191\u2191', cls: 'text-green-600', label: 'Strong improvement vs previous review' },
  up:          { icon: '\u2191',       cls: 'text-green-500', label: 'Improving vs previous review' },
  stable:      { icon: '\u2192',       cls: 'text-gray-400',  label: 'Stable vs previous review' },
  down:        { icon: '\u2193',       cls: 'text-amber-500', label: 'Declining vs previous review' },
  down_strong: { icon: '\u2193\u2193', cls: 'text-red-500',   label: 'Significant decline vs previous review' },
}

function TrendBadge({ trend }: { trend: TrendDirection }) {
  const c = TREND_CFG[trend]
  return <span className={`text-sm font-bold leading-none ${c.cls}`} title={c.label}>{c.icon}</span>
}

const SCORE_MAP_INLINE: Record<string,Record<string,number>> = {
  role_fitment:{'Development Needed':25,'Developing':50,'Proficient':75,'Advanced':100},
  delivery:{'Rarely':25,'Sometimes':50,'Consistently':75,'Always':100},
  quality_speed:{'Struggles to Balance':25,'Inconsistent':50,'Effective Balance':75,'Exceptional Balance':100},
  updating_skills:{'Needs Improvement':25,'Passive Learner':50,'Proactive':75,'Continuous Learner':100},
  ownership:{'Good':60,'Very Good':80,'Excellent':100},
  accountability:{'Good':60,'Very Good':80,'Excellent':100},
  critical_thinking:{'Reactive':33,'Occasionally Proactive':67,'Highly Proactive':100},
  innovation:{'Meets Expectations Only':33,'Occasionally Steps Up':67,'Consistently Goes the Extra Mile':100},
  independent:{'High Supervision Needed':33,'Moderate Supervision Needed':67,'Independent':100},
  critical_situations:{'Easily Overwhelmed':25,'Stabilizes Gradually':50,'Calm & Effective':75,'Thrives Under Pressure':100},
  client_mgmt:{'Needs Intervention':25,'Needs Occasional Support':50,'Independent Management':75,'Trusted Advisor':100},
  client_professional:{'Needs Improvement':33,'Generally Professional':67,'Exemplary Professionalism':100},
  professional_attitude:{'Needs Improvement':33,'Professional':67,'Highly Positive':100},
  team_morale:{'Detrimental':25,'Neutral Participant':50,'Positive Contributor':75,'Culture Champion':100},
}
const WEIGHTS_INLINE: Record<string,number> = {
  role_fitment:8,delivery:8,quality_speed:7,updating_skills:7,
  ownership:6,accountability:6,critical_thinking:7,innovation:6,
  independent:7,critical_situations:8,client_mgmt:8,client_professional:7,
  professional_attitude:7,team_morale:8,
}
const CAT_FIELDS = [
  { label: 'Technical Performance', fields: ['role_fitment','delivery','quality_speed','updating_skills'] },
  { label: 'Professional Mindset',  fields: ['ownership','accountability','critical_thinking','innovation'] },
  { label: 'Leadership & Autonomy', fields: ['independent','critical_situations'] },
  { label: 'Client Interactions',   fields: ['client_mgmt','client_professional'] },
  { label: 'Teamwork & Culture',    fields: ['professional_attitude','team_morale'] },
]

function catScore(fields: string[], ans: Record<string, string|null|undefined>) {
  let tw = 0, ws = 0
  for (const f of fields) {
    const v = ans[f]; const w = WEIGHTS_INLINE[f]
    if (v && SCORE_MAP_INLINE[f]?.[v] !== undefined) { ws += SCORE_MAP_INLINE[f][v] * w; tw += w }
  }
  return tw === 0 ? null : Math.round((ws / tw) * 10) / 10
}

function ScoreBar({ label, score }: { label: string; score: number | null }) {
  if (score == null) return null
  const color = score >= 75 ? 'bg-green-400' : score >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[10px] text-gray-400 w-32 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.round(score)}%` }} />
      </div>
      <span className="text-[10px] text-gray-500 w-8 text-right">{score}</span>
    </div>
  )
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
  const [apReviewId, setApReviewId] = useState<string | null>(null)
  const [expandedScores, setExpandedScores] = useState<Set<string>>(new Set())
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [roleLoaded, setRoleLoaded] = useState(false)
  const [managerName, setManagerName] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/my-role')
      .then(r => r.json())
      .then(d => { setUserRole(d?.role ?? null); setUserEmail(d?.email ?? null) })
      .catch(() => {})
      .finally(() => setRoleLoaded(true))
  }, [])

  useEffect(() => {
    supabase.from('employees').select('id,name,role,dept,manager,region,type')
      .eq('active', true).in('status', ['Active', 'Contractor']).order('name')
      .then(({ data }) => { setEmployees((data ?? []) as Employee[]); setLoading(false) })
  }, [])

  function selectEmployee(emp: Employee) {
    setSelected(emp); setShowForm(false); setEditReview(null)
    setApReviewId(null); setExpandedScores(new Set())
    supabase.from('monthly_reviews').select('*').eq('employee_id', emp.id)
      .order('review_month', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data }) => setReviews((data ?? []) as Review[]))
  }

  function startNew() {
    if (!selected) return
    setForm(initForm(selected.id)); setEditReview(null)
    setFormKey(k => k + 1); setApReviewId(null); setShowForm(true)
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
        role_fitment: r.role_fitment ?? '', delivery: r.delivery ?? '',
        quality_speed: r.quality_speed ?? '', updating_skills: r.updating_skills ?? '',
        ownership: r.ownership ?? '', accountability: r.accountability ?? '',
        critical_thinking: r.critical_thinking ?? '', innovation: r.innovation ?? '',
        independent: r.independent ?? '', critical_situations: r.critical_situations ?? '',
        client_mgmt: r.client_mgmt ?? '', client_professional: r.client_professional ?? '',
        professional_attitude: r.professional_attitude ?? '', team_morale: r.team_morale ?? '',
      },
    })
    setFormKey(k => k + 1); setEditReview(r); setShowForm(true)
  }

  const saveReview = useCallback(async () => {
    if (!selected) return
    setSaving(true)
    const reviewMonth = `${form.sel_year}-${String(form.sel_month).padStart(2,'0')}-01`
    const a = form.detailed_answers
    const score = form.review_template === 'detailed' ? calculateScore(a) : null
    const payload = {
      employee_id: selected.id, review_month: reviewMonth,
      manager_name: form.manager_name || null, project: form.project || null,
      billable: form.billable, mood: form.mood,
      targets: form.targets || null, achievements: form.achievements || null,
      overall_feedback: form.overall_feedback || null,
      review_template: form.review_template,
      detailed_data: form.review_template === 'detailed' ? a : null,
      composite_score: score,
      role_fitment: a.role_fitment || null, delivery: a.delivery || null,
      quality_speed: a.quality_speed || null, updating_skills: a.updating_skills || null,
      ownership: a.ownership || null, accountability: a.accountability || null,
      critical_thinking: a.critical_thinking || null, innovation: a.innovation || null,
      independent: a.independent || null, critical_situations: a.critical_situations || null,
      client_mgmt: a.client_mgmt || null, client_professional: a.client_professional || null,
      professional_attitude: a.professional_attitude || null, team_morale: a.team_morale || null,
    }
    // multiple reviews per month are allowed - update only when editing an existing review
    const query = editReview
      ? supabase.from('monthly_reviews').update(payload).eq('id', editReview.id)
      : supabase.from('monthly_reviews').insert(payload)
    const { data: saved, error } = await query.select().single()
    if (error) { alert('Save failed: ' + error.message); setSaving(false); return }
    if (!editReview && form.review_template === 'detailed' && saved) {
      const autoPoints = generateActionPoints(a)
      if (autoPoints.length > 0) {
        await supabase.from('review_action_points').insert(
          autoPoints.map(p => ({ review_id: saved.id, employee_id: selected.id, ...p, status: 'Open', auto_generated: true }))
        )
      }
    }
    const { data } = await supabase.from('monthly_reviews').select('*')
      .eq('employee_id', selected.id).order('review_month', { ascending: false }).order('created_at', { ascending: false })
    setReviews((data ?? []) as Review[])
    setShowForm(false)
    if (saved?.id) setApReviewId(saved.id)
    setSaving(false)
  }, [form, selected, editReview])

  const F = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // Resolve scope. admin + super_manager review anybody; manager is limited to their chain.
  useEffect(() => {
    if (!roleLoaded || employees.length === 0) return
    if (userRole === 'admin' || userRole === 'super_manager' || userEmail === ADMIN_EMAIL) {
      setManagerName(null); return
    }
    if (!userEmail) return
    // employees table has no email column, so derive the name from the login
    // e.g. manjunath.tadahal@... -> "Manjunath Tadahal", then match against employees.name
    const derived = userEmail.split('@')[0].split('.')
      .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
    const match = employees.find((e: any) =>
      (e.name ?? '').trim().toLowerCase() === derived.trim().toLowerCase()
    )
    setManagerName(match ? match.name : derived)
  }, [userEmail, userRole, roleLoaded, employees])

  // Managers only see their direct + indirect reports; admin sees all
  const visibleEmployees = useMemo(
    () => (managerName ? getReports(employees, managerName) : employees),
    [employees, managerName]
  )

  const filtered = visibleEmployees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.role ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function formatMonth(s: string) {
    const d = new Date(s); return MONTHS[d.getMonth()] + ' ' + d.getFullYear()
  }

  function toggleScores(id: string) {
    setExpandedScores(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function reviewAnswers(r: Review): Record<string, string|null|undefined> {
    return {
      role_fitment: r.role_fitment, delivery: r.delivery, quality_speed: r.quality_speed,
      updating_skills: r.updating_skills, ownership: r.ownership, accountability: r.accountability,
      critical_thinking: r.critical_thinking, innovation: r.innovation,
      independent: r.independent, critical_situations: r.critical_situations,
      client_mgmt: r.client_mgmt, client_professional: r.client_professional,
      professional_attitude: r.professional_attitude, team_morale: r.team_morale,
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      <div className="w-[300px] border-r flex flex-col bg-gray-50 shrink-0">
        <div className="p-3 border-b bg-white">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees\u2026" className="w-full px-3 py-1.5 text-sm border rounded-lg" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="p-4 text-sm text-gray-400">Loading\u2026</div> :
            filtered.map(emp => (
              <button key={emp.id} onClick={() => selectEmployee(emp)}
                className={'w-full text-left px-4 py-3 border-b hover:bg-white transition-colors ' +
                  (selected?.id === emp.id ? 'bg-white border-l-4 border-l-blue-500' : '')}>
                <div className="text-sm font-medium text-gray-900 truncate">{emp.name}</div>
                <div className="text-xs text-gray-400 truncate">{emp.role} \u00b7 {emp.dept}</div>
              </button>
            ))
          }
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
            Select an employee to view reviews
          </div>
        ) : (
          <>
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selected.name}</h2>
                <div className="text-xs text-gray-400">{selected.role} \u00b7 {selected.dept}</div>
              </div>
              <button onClick={startNew} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-semibold hover:bg-blue-700">
                + New Monthly Review
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {showForm ? (
                <div className="bg-white rounded-xl border shadow-sm p-6 max-w-2xl">
                  <h3 className="text-base font-bold mb-4">{editReview ? 'Edit' : 'New'} Review \u2014 {selected.name}</h3>
                  <DetailedTemplate key={formKey} initialTemplate={form.review_template}
                    initialAnswers={form.detailed_answers}
                    onDataChange={(template, data) => setForm(f => ({ ...f, review_template: template, detailed_answers: data }))}
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
                      <select value={form.billable ? 'Yes' : 'No'}
                        onChange={e => setForm(f => ({ ...f, billable: e.target.value === 'Yes' }))}
                        className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
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
                    <textarea value={form.targets} onChange={F('targets')} rows={2} placeholder="Goals\u2026" className="w-full px-3 py-2 text-sm border rounded-lg resize-none" />
                  </div>
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Achievements</label>
                    <textarea value={form.achievements} onChange={F('achievements')} rows={2} placeholder="Key achievements\u2026" className="w-full px-3 py-2 text-sm border rounded-lg resize-none" />
                  </div>
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Overall Feedback</label>
                    <textarea value={form.overall_feedback} onChange={F('overall_feedback')} rows={3} placeholder="Overall feedback\u2026" className="w-full px-3 py-2 text-sm border rounded-lg resize-none" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={saveReview} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {saving ? 'Saving\u2026' : 'Save Review'}
                    </button>
                  </div>
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-12 text-gray-300 text-sm">No reviews yet \u2014 click + New Monthly Review</div>
              ) : (
                <div className="space-y-3 max-w-2xl">
                  {reviews.map((r, idx) => {
                    const prevScore = reviews[idx + 1]?.composite_score
                    const trend = r.composite_score != null ? calculateTrend(r.composite_score, prevScore) : null
                    const isApOpen = apReviewId === r.id
                    const isScoreExpanded = expandedScores.has(r.id)
                    const ans = reviewAnswers(r)
                    return (
                      <div key={r.id} className="bg-white rounded-xl border hover:shadow-sm transition-shadow">
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm">{formatMonth(r.review_month)}</span>
                              {r.composite_score != null && <ScoreBadge score={r.composite_score} />}
                              {trend && <TrendBadge trend={trend} />}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {r.review_template === 'detailed' && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Detailed</span>}
                              {r.mood && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{r.mood}</span>}
                              {r.composite_score != null && (
                                <button onClick={() => toggleScores(r.id)} className="text-xs text-indigo-500 hover:underline">
                                  {isScoreExpanded ? 'Hide scores' : 'View scores'}
                                </button>
                              )}
                              <button onClick={() => setApReviewId(isApOpen ? null : r.id)}
                                className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                                  isApOpen ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500 hover:bg-amber-50 hover:text-amber-600'
                                }`}>
                                {isApOpen ? 'Close action points \u25b2' : 'Action points \u25bc'}
                              </button>
                              <button onClick={() => startEdit(r)} className="text-xs text-blue-600 hover:underline">Edit</button>
                            </div>
                          </div>
                          {r.manager_name && <div className="text-xs text-gray-400">Reviewed by {r.manager_name}</div>}
                          {r.overall_feedback && <div className="text-sm text-gray-600 mt-2 line-clamp-2">{r.overall_feedback}</div>}
                          {isScoreExpanded && r.composite_score != null && (
                            <div className="mt-3 pt-3 border-t border-gray-50">
                              {CAT_FIELDS.map(cat => (
                                <ScoreBar key={cat.label} label={cat.label} score={catScore(cat.fields, ans)} />
                              ))}
                            </div>
                          )}
                        </div>
                        {isApOpen && (
                          <div className="px-4 pb-4">
                            <ActionPoints reviewId={r.id} employeeId={r.employee_id} onClose={() => setApReviewId(null)} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
