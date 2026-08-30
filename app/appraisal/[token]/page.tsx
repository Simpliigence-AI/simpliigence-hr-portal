'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CORE_RATINGS, COMPETENCIES, competenciesFor, RATING_LABELS,
  SELF_NARRATIVES, PEER_NARRATIVES, MANAGER_NARRATIVES,
  PROJECT_COLUMNS, emptyProjectRow, parseProjects, GROUPS,
  scoreCore, raterScore, POTENTIAL,
  type ProjectRow, type Audience, type NarrativeQ,
} from '@/lib/appraisal'

type Participant = {
  id: string; kind: Audience; name: string; status: string
  answers: Record<string, any>; projects: ProjectRow[]
  nomination_status: string; submitted_at: string | null
}
type Appraisal = { id: string; employee_name: string; employee_role: string | null; employee_dept: string | null; manager_name: string | null; stage: string }
type Cycle = { name: string; period_start: string | null; period_end: string | null; self_due: string | null; peer_due: string | null; manager_due: string | null }
type Colleague = { id: string; name: string; role: string | null; dept: string | null; ms_email: string | null }
type PeerRow = { id: string; person_name: string; person_email: string | null; nomination_status: string; status: string }
type Input = { kind: string; person_name: string; answers: Record<string, any>; projects: ProjectRow[]; score: number | null; submitted_at: string }

const CARD = 'bg-white rounded-2xl border border-gray-200 shadow-sm'

export default function AppraisalFormPage({ params }: { params: { token: string } }) {
  const token = params.token
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [p, setP] = useState<Participant | null>(null)
  const [ap, setAp] = useState<Appraisal | null>(null)
  const [cycle, setCycle] = useState<Cycle | null>(null)
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [peers, setPeers] = useState<PeerRow[]>([])
  const [inputs, setInputs] = useState<Input[]>([])
  const [pending, setPending] = useState<{ kind: string; person_name: string }[]>([])

  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [nominees, setNominees] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const dirty = useRef(false)

  useEffect(() => {
    ;(async () => {
      const r = await fetch(`/api/appraisal/form?token=${encodeURIComponent(token)}`)
      const j = await r.json()
      if (!r.ok) { setError(j.error ?? 'Could not load this form.'); setLoading(false); return }
      setP(j.participant); setAp(j.appraisal); setCycle(j.cycle)
      setAnswers(j.participant.answers ?? {})
      setProjects(parseProjects(j.participant.projects))
      setColleagues(j.colleagues ?? []); setPeers(j.peers ?? [])
      setInputs(j.inputs ?? []); setPending(j.pending ?? [])
      if (j.participant.status === 'submitted') setDone(true)
      const existing: PeerRow[] = j.peers ?? []
      if (existing.length) setNominees(existing.map(x => ({ id: '', name: x.person_name, email: x.person_email ?? '' })))
      setLoading(false)
    })()
  }, [token])

  // autosave every 15s while dirty
  useEffect(() => {
    if (done || !p) return
    const t = setInterval(() => { if (dirty.current) save() }, 15000)
    return () => clearInterval(t)
  }, [done, p, answers, projects])

  async function save() {
    if (!p || done) return
    setSaving('saving')
    await fetch('/api/appraisal/form', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'save', answers, projects }),
    })
    dirty.current = false
    setSaving('saved')
    setTimeout(() => setSaving('idle'), 2000)
  }

  function set(id: string, v: any) { setAnswers(a => ({ ...a, [id]: v })); dirty.current = true }
  function setProj(i: number, k: keyof ProjectRow, v: string) {
    setProjects(rows => rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r)); dirty.current = true
  }

  const audience = p?.kind ?? 'self'
  const comps = useMemo(() => competenciesFor(audience), [audience])
  const narratives: NarrativeQ[] = audience === 'self' ? SELF_NARRATIVES : audience === 'peer' ? PEER_NARRATIVES : MANAGER_NARRATIVES

  const missing = useMemo(() => {
    const m: string[] = []
    for (const c of CORE_RATINGS) if (!answers[c.id]) m.push(c.id)
    for (const c of comps) if (!answers[c.id]) m.push(c.id)
    for (const n of narratives) if (n.required && !String(answers[n.id] ?? '').trim()) m.push(n.id)
    if (audience === 'self' && !projects.some(r => r.project.trim())) m.push('__projects')
    if (audience === 'manager' && !answers.potential) m.push('potential')
    return m
  }, [answers, projects, comps, narratives, audience])

  const liveScore = raterScore(answers, audience)
  const coreScore = scoreCore(answers)

  async function submit() {
    setShowErrors(true)
    if (missing.length) {
      const first = document.getElementById(`q-${missing[0]}`)
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true)
    if (audience === 'self') {
      await fetch('/api/appraisal/form', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'nominate', nominees: nominees.filter(n => n.name.trim()) }),
      })
    }
    const r = await fetch('/api/appraisal/form', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action: 'submit', answers, projects }),
    })
    const j = await r.json()
    setSubmitting(false)
    if (!r.ok) { setError(j.error ?? 'Submission failed.'); return }
    setDone(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ------------------------------------------------------------------ states
  if (loading) return <Shell><div className="text-center py-24 text-gray-400 text-sm">Loading your form…</div></Shell>
  if (error) return <Shell><div className={`${CARD} p-10 text-center`}><div className="text-4xl mb-3">🔒</div><div className="font-semibold text-gray-800 mb-1">Link unavailable</div><div className="text-sm text-gray-500">{error}</div></div></Shell>
  if (!p || !ap) return null

  if (done) return (
    <Shell>
      <div className={`${CARD} p-10 text-center`}>
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 text-2xl flex items-center justify-center mx-auto mb-4">✓</div>
        <div className="text-xl font-bold text-gray-900 mb-2">Thank you — your response is recorded</div>
        <div className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
          {audience === 'self' && 'Your self-assessment has gone to your manager. If you nominated colleagues, they will be invited once your manager approves them. You will hear back when the appraisal is finalised.'}
          {audience === 'peer' && `Your feedback on ${ap.employee_name} has been submitted. Thank you for taking the time — candid peer input is what makes this process worth running.`}
          {audience === 'manager' && `Your review of ${ap.employee_name} is complete and has gone to HR for calibration and release.`}
        </div>
      </div>
    </Shell>
  )

  const title = audience === 'self' ? 'Your self-assessment'
    : audience === 'peer' ? `Feedback on ${ap.employee_name}`
    : `Manager review — ${ap.employee_name}`
  const due = audience === 'self' ? cycle?.self_due : audience === 'peer' ? cycle?.peer_due : cycle?.manager_due

  return (
    <Shell>
      {/* header */}
      <div className={`${CARD} p-6 mb-4`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 mb-1">{cycle?.name ?? 'Annual appraisal'}</div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <div className="text-sm text-gray-500 mt-1">
              {audience === 'self'
                ? <>{ap.employee_role} · {ap.employee_dept} · Manager: {ap.manager_name}</>
                : <>{ap.employee_name} — {ap.employee_role}{ap.employee_dept ? ` · ${ap.employee_dept}` : ''}</>}
            </div>
          </div>
          <div className="text-right">
            {due && <div className="text-xs text-gray-500 mb-1">Due <span className="font-semibold text-gray-700">{new Date(due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>}
            <div className="text-[11px] text-gray-400 h-4">
              {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Draft saved' : 'Answers save automatically'}
            </div>
          </div>
        </div>
        {audience === 'peer' && (
          <div className="mt-4 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-xl p-3 leading-relaxed">
            <strong>Before you start:</strong> your responses are shown to {ap.employee_name}&apos;s manager and to HR as part of the appraisal, attributed to you. Specific examples are far more useful than general praise or criticism.
          </div>
        )}
      </div>

      {/* Manager: everything already submitted */}
      {audience === 'manager' && (
        <div className={`${CARD} p-6 mb-4`}>
          <SectionTitle n="A" title="What has come in" sub="Read this before you rate. Nothing here is visible to the employee." />
          {pending.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
              Still outstanding: {pending.map(x => `${x.person_name} (${x.kind})`).join(', ')}
            </div>
          )}
          {inputs.length === 0 && <div className="text-sm text-gray-400">No submissions yet.</div>}
          <div className="space-y-3">
            {inputs.map((i, idx) => <InputCard key={idx} input={i} />)}
          </div>
        </div>
      )}

      {/* Self: technical template — projects */}
      {audience === 'self' && (
        <div className={`${CARD} p-6 mb-4`} id="q-__projects">
          <SectionTitle n="A" title="Projects this year" sub="Add a row for each project you worked on. List the targets you were given and what you actually achieved against them." />
          {showErrors && missing.includes('__projects') && <Err>Add at least one project.</Err>}
          <div className="space-y-3">
            {projects.map((row, i) => (
              <div key={i} className="border border-gray-200 rounded-xl p-4 bg-gray-50/60">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wide">Project {i + 1}</div>
                  <button onClick={() => { setProjects(r => r.filter((_, x) => x !== i)); dirty.current = true }}
                    className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {PROJECT_COLUMNS.map(c => (
                    <div key={c.id} className={c.kind === 'area' ? 'sm:col-span-2' : ''}>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">{c.label}</label>
                      {c.kind === 'area'
                        ? <textarea rows={3} value={row[c.id]} placeholder={c.placeholder}
                            onChange={e => setProj(i, c.id, e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none resize-y" />
                        : <input value={row[c.id]} placeholder={c.placeholder}
                            onChange={e => setProj(i, c.id, e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none" />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { setProjects(r => [...r, emptyProjectRow()]); dirty.current = true }}
            className="mt-3 px-4 py-2 text-sm font-semibold rounded-lg border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 w-full">
            + Add a project
          </button>
        </div>
      )}

      {/* Core 1–10 ratings */}
      <div className={`${CARD} p-6 mb-4`}>
        <SectionTitle
          n={audience === 'self' ? 'B' : audience === 'manager' ? 'B' : 'A'}
          title={audience === 'self' ? 'Rate yourself' : `Rate ${ap.employee_name.split(' ')[0]}`}
          sub="One to ten on each. Everyone in this appraisal — the employee, the nominated colleagues and the manager — answers exactly these three, so the views sit side by side."
        />
        <div className="space-y-5">
          {CORE_RATINGS.map(c => (
            <div key={c.id} id={`q-${c.id}`}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <div className="text-sm font-semibold text-gray-800">{c.label}</div>
                <div className="text-xs text-gray-400">weight {c.weight}%</div>
              </div>
              <div className="text-xs text-gray-500 mb-2">{c.hint}</div>
              {showErrors && missing.includes(c.id) && <Err>Please give a rating.</Err>}
              <div className="flex gap-1.5 flex-wrap">
                {Array.from({ length: 10 }, (_, k) => k + 1).map(n => {
                  const on = Number(answers[c.id]) === n
                  const tone = n <= 3 ? 'bg-red-500' : n <= 6 ? 'bg-amber-500' : n <= 8 ? 'bg-blue-500' : 'bg-emerald-500'
                  return (
                    <button key={n} onClick={() => set(c.id, n)}
                      className={`w-10 h-10 rounded-lg text-sm font-bold border transition-all ${on ? `${tone} text-white border-transparent shadow-sm scale-105` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                      {n}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 mt-2">
                {c.scale.map(s => <div key={s} className="text-[10px] text-gray-400 leading-tight">{s}</div>)}
              </div>
            </div>
          ))}
        </div>
        {coreScore != null && (
          <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
            <div className="text-xs text-gray-500">Weighted from your three ratings</div>
            <div className="text-lg font-bold text-indigo-600">{coreScore}<span className="text-sm text-gray-400 font-medium">/100</span></div>
          </div>
        )}
      </div>

      {/* Competency grid */}
      <div className={`${CARD} p-6 mb-4`}>
        <SectionTitle
          n={audience === 'peer' ? 'B' : 'C'}
          title="Competency assessment"
          sub={audience === 'peer'
            ? 'Only the competencies you are in a position to observe. If you genuinely cannot judge one, pick the closest honest answer rather than guessing high.'
            : 'Pick the description that best matches the behaviour actually seen this cycle, not the aspiration.'}
        />
        <div className="space-y-6">
          {GROUPS.filter(g => comps.some(c => c.group === g)).map(g => (
            <div key={g}>
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-1.5 mb-3">{g}</div>
              <div className="space-y-4">
                {comps.filter(c => c.group === g).map(c => (
                  <div key={c.id} id={`q-${c.id}`}>
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <div className="text-sm font-semibold text-gray-800">{c.label}</div>
                      <div className="text-xs text-gray-400">{c.weight}%</div>
                    </div>
                    {showErrors && missing.includes(c.id) && <Err>Please choose one.</Err>}
                    <div className="space-y-1.5">
                      {c.anchors.map((a, idx) => {
                        const v = idx + 1
                        const on = Number(answers[c.id]) === v
                        return (
                          <button key={v} onClick={() => set(c.id, v)}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-xs flex gap-3 items-start transition-colors ${on ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-200' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
                            <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center font-bold ${on ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{v}</span>
                            <span className="pt-0.5">
                              <span className={`font-semibold ${on ? 'text-indigo-800' : 'text-gray-600'}`}>{RATING_LABELS[v]} · </span>
                              <span className={on ? 'text-indigo-700' : 'text-gray-500'}>{a}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Narratives */}
      <div className={`${CARD} p-6 mb-4`}>
        <SectionTitle
          n={audience === 'peer' ? 'C' : 'D'}
          title={audience === 'self' ? 'Your year in your own words' : audience === 'peer' ? 'In your own words' : 'Your written assessment'}
          sub={audience === 'manager' ? 'The overall assessment and next-cycle goals are shared with the employee when the appraisal is released. The rest stays internal.' : undefined}
        />
        <div className="space-y-4">
          {narratives.map(n => (
            <div key={n.id} id={`q-${n.id}`}>
              <label className="text-sm font-semibold text-gray-800 block mb-0.5">
                {n.label}{n.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              {n.hint && <div className="text-xs text-gray-500 mb-1.5">{n.hint}</div>}
              {showErrors && missing.includes(n.id) && <Err>This one is required.</Err>}
              <textarea rows={n.rows ?? 3} value={answers[n.id] ?? ''} onChange={e => set(n.id, e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none resize-y" />
            </div>
          ))}
        </div>
      </div>

      {/* Self: peer nomination */}
      {audience === 'self' && (
        <div className={`${CARD} p-6 mb-4`}>
          <SectionTitle n="E" title="Nominate colleagues for feedback" sub="Choose up to three people who have seen your work closely this year. Your manager reviews the nominations before anyone is contacted — this is optional but strongly encouraged." />
          <div className="space-y-2">
            {[0, 1, 2].map(i => {
              const cur = nominees[i]
              return (
                <select key={i} value={cur?.name ?? ''}
                  onChange={e => {
                    const c = colleagues.find(x => x.name === e.target.value)
                    setNominees(list => {
                      const next = [...list]
                      if (!e.target.value) next.splice(i, 1)
                      else next[i] = { id: c?.id ?? '', name: e.target.value, email: c?.ms_email ?? '' }
                      return next.filter(Boolean)
                    })
                  }}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-400 focus:outline-none">
                  <option value="">Colleague {i + 1} — optional</option>
                  {colleagues.map(c => <option key={c.id} value={c.name}>{c.name}{c.role ? ` — ${c.role}` : ''}</option>)}
                </select>
              )
            })}
          </div>
          {nominees.some(n => n && !n.email) && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
              One of your choices has no email address on record. HR will send them the link manually.
            </div>
          )}
        </div>
      )}

      {/* Manager: rating decision */}
      {audience === 'manager' && (
        <div className={`${CARD} p-6 mb-4`}>
          <SectionTitle n="E" title="Rating decision" sub="HR calibrates across the org before anything is released, so treat these as your recommendation." />
          <div className="grid sm:grid-cols-2 gap-4">
            <div id="q-potential">
              <label className="text-sm font-semibold text-gray-800 block mb-1">Potential <span className="text-red-400">*</span></label>
              <div className="text-xs text-gray-500 mb-2">Capacity to take on materially bigger scope in the next 12–24 months — independent of this year&apos;s performance.</div>
              {showErrors && missing.includes('potential') && <Err>Please pick one.</Err>}
              <div className="flex gap-2">
                {POTENTIAL.map(v => (
                  <button key={v} onClick={() => set('potential', v)}
                    className={`flex-1 px-3 py-2 text-sm font-semibold rounded-lg border transition-colors ${answers.potential === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-800 block mb-1">Recommended hike %</label>
              <div className="text-xs text-gray-500 mb-2">Indicative only — final numbers are set in the compensation review.</div>
              <input type="number" min={0} max={60} step={0.5} value={answers.hike_percent ?? ''}
                onChange={e => set('hike_percent', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none" placeholder="e.g. 10" />
            </div>
            <div className="sm:col-span-2 flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
              <input type="checkbox" id="promo" checked={Boolean(answers.promotion_recommended)}
                onChange={e => set('promotion_recommended', e.target.checked)} className="mt-0.5 w-4 h-4" />
              <div className="flex-1">
                <label htmlFor="promo" className="text-sm font-semibold text-gray-800 cursor-pointer">Recommend for promotion this cycle</label>
                {answers.promotion_recommended && (
                  <input value={answers.new_role ?? ''} onChange={e => set('new_role', e.target.value)}
                    placeholder="Proposed title, e.g. Senior Salesforce Consultant"
                    className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* submit bar */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-white/95 backdrop-blur border-t border-gray-200 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-xs text-gray-500">
          {missing.length === 0
            ? <span className="text-emerald-600 font-semibold">All questions answered</span>
            : <>{missing.length} question{missing.length === 1 ? '' : 's'} left</>}
          {liveScore != null && <span className="ml-3 text-gray-400">Your overall rating: <strong className="text-gray-700">{liveScore}/100</strong></span>}
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Save draft</button>
          <button onClick={submit} disabled={submitting}
            className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
      <div className="text-center text-[11px] text-gray-400 py-6">
        Once submitted you cannot change your answers. Contact the HR team if you need a response reopened.
      </div>
    </Shell>
  )
}

// ------------------------------------------------------------------ bits
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1a1a2e] px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-white font-bold text-lg leading-tight">Simpliigence</div>
            <div className="text-white/40 text-[11px]">People &amp; Performance</div>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-6">{children}</div>
    </div>
  )
}

function SectionTitle({ n, title, sub }: { n: string; title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">{n}</span>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      {sub && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{sub}</p>}
    </div>
  )
}

function Err({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-red-600 font-medium mb-1.5">{children}</div>
}

function InputCard({ input }: { input: Input }) {
  const [open, setOpen] = useState(false)
  const core = CORE_RATINGS.map(c => ({ label: c.label, v: input.answers?.[c.id] }))
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left">
        <div>
          <div className="text-sm font-semibold text-gray-800">
            {input.person_name} <span className="text-xs font-normal text-gray-400">· {input.kind === 'self' ? 'self-assessment' : 'peer feedback'}</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {core.filter(c => c.v).map(c => `${c.label} ${c.v}/10`).join(' · ') || 'no ratings'}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {input.score != null && <span className="text-xs font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">{input.score}/100</span>}
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="p-4 space-y-3 bg-white">
          {parseProjects(input.projects).filter(r => r.project).map((r, i) => (
            <div key={i} className="text-xs bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="font-semibold text-gray-800">{r.project}{r.client ? ` — ${r.client}` : ''} <span className="font-normal text-gray-400">{r.duration}</span></div>
              {r.targets && <div className="mt-1.5 text-gray-600"><span className="font-medium text-gray-500">Targets: </span>{r.targets}</div>}
              {r.achievements && <div className="mt-1 text-gray-600"><span className="font-medium text-gray-500">Achieved: </span>{r.achievements}</div>}
              {r.skills && <div className="mt-1 text-gray-500"><span className="font-medium">Skills: </span>{r.skills}</div>}
            </div>
          ))}
          {[...SELF_NARRATIVES, ...PEER_NARRATIVES].filter(q => input.answers?.[q.id]).map(q => (
            <div key={q.id} className="text-xs">
              <div className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">{q.label}</div>
              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">{input.answers[q.id]}</div>
            </div>
          ))}
          <div className="pt-2 border-t border-gray-100">
            <div className="font-semibold text-gray-500 uppercase tracking-wide text-[10px] mb-1.5">Competency ratings</div>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
              {COMPETENCIES.filter(c => input.answers?.[c.id]).map(c => (
                <div key={c.id} className="flex justify-between text-[11px] gap-2">
                  <span className="text-gray-500 truncate">{c.label}</span>
                  <span className="font-bold text-gray-700 shrink-0">{input.answers[c.id]}/5</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
