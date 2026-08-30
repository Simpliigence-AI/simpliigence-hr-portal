'use client'
import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import {
  BANDS, bandFor, CORE_RATINGS, COMPETENCIES, POTENTIAL, STAGES,
  performanceTier, parseProjects, SELF_NARRATIVES, PEER_NARRATIVES, MANAGER_NARRATIVES,
} from '@/lib/appraisal'

type Cycle = { id: string; name: string; status: string; period_start: string | null; period_end: string | null; self_due: string | null; peer_due: string | null; manager_due: string | null }
type Appraisal = {
  id: string; cycle_id: string; employee_id: string; employee_name: string; employee_role: string | null
  employee_dept: string | null; manager_name: string | null; stage: string; status: string
  self_score: number | null; peer_score: number | null; manager_score: number | null; final_score: number | null
  self_core: Record<string, number | null>; peer_core: Record<string, number | null>; manager_core: Record<string, number | null>
  rating_band: string | null; potential: string | null; nine_box: string | null
  hike_percent: number | null; promotion_recommended: boolean; new_role: string | null; hr_comments: string | null
  released_at: string | null
}
type Participant = {
  id: string; appraisal_id: string; kind: 'self' | 'peer' | 'manager'; person_name: string; person_email: string | null
  nomination_status: string; status: string; invited_at: string | null; submitted_at: string | null
  score: number | null; answers: Record<string, any>; projects: any; token: string
}
type Emp = { id: string; name: string; role: string | null; dept: string | null; manager: string | null; region: string | null; country: string | null; type: string | null; ms_email: string | null }

const CARD = 'bg-white rounded-2xl border border-gray-200 shadow-sm'
const STAGE_TONE: Record<string, string> = {
  self: 'bg-blue-100 text-blue-700', nomination: 'bg-purple-100 text-purple-700',
  peer: 'bg-amber-100 text-amber-700', manager: 'bg-orange-100 text-orange-700',
  hr: 'bg-indigo-100 text-indigo-700', released: 'bg-emerald-100 text-emerald-700',
}
const BAND_TONE: Record<string, string> = {
  'Outstanding': 'bg-emerald-100 text-emerald-700', 'Exceeds expectations': 'bg-green-100 text-green-700',
  'Meets expectations': 'bg-blue-100 text-blue-700', 'Partially meets': 'bg-amber-100 text-amber-700',
  'Below expectations': 'bg-red-100 text-red-700',
}

export default function AppraisalPage() {
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<{ email: string; role: string; isHr: boolean } | null>(null)
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [appraisals, setAppraisals] = useState<Appraisal[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [employees, setEmployees] = useState<Emp[]>([])
  const [smtp, setSmtp] = useState(true)
  const [tab, setTab] = useState<'board' | 'trigger' | 'calibration'>('board')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [newCycle, setNewCycle] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')

  async function load(cid?: string | null) {
    const r = await fetch(`/api/appraisal${cid ? `?cycle=${cid}` : ''}`)
    const j = await r.json()
    if (!r.ok) { setToast(j.error ?? 'Failed to load'); setLoading(false); return }
    setMe(j.me); setCycles(j.cycles); setCycleId(j.activeCycle)
    setAppraisals(j.appraisals); setParticipants(j.participants)
    setEmployees(j.employees); setSmtp(j.smtp)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function act(payload: Record<string, unknown>, label: string) {
    setBusy(label)
    const r = await fetch('/api/appraisal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const j = await r.json()
    setBusy(null)
    if (!r.ok) { setToast(j.error ?? 'Something went wrong'); return null }
    await load(cycleId)
    return j
  }

  const cycle = cycles.find(c => c.id === cycleId) ?? null
  const partsOf = (id: string) => participants.filter(p => p.appraisal_id === id)

  // India FTEs are the eligible population for the annual appraisal.
  const eligible = useMemo(() => employees.filter(e =>
    (e.region === 'India' || e.country === 'India') && ['FTE', 'FT'].includes(String(e.type ?? ''))
  ), [employees])
  const triggeredIds = new Set(appraisals.map(a => a.employee_id))
  const notYet = eligible.filter(e => !triggeredIds.has(e.id))

  const stats = useMemo(() => {
    const s = { total: appraisals.length, self: 0, peer: 0, manager: 0, hr: 0, released: 0 }
    for (const a of appraisals) {
      if (a.stage === 'released') s.released++
      else if (a.stage === 'hr') s.hr++
      else if (a.stage === 'manager') s.manager++
      else if (a.stage === 'peer' || a.stage === 'nomination') s.peer++
      else s.self++
    }
    return s
  }, [appraisals])

  const filtered = appraisals.filter(a =>
    !q || `${a.employee_name} ${a.employee_role} ${a.employee_dept} ${a.manager_name}`.toLowerCase().includes(q.toLowerCase())
  )

  if (loading) return <AppShell><div className="p-8 text-sm text-gray-400">Loading appraisals…</div></AppShell>

  return (
    <AppShell>
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
        {/* header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Appraisal</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              360° annual appraisal — self-assessment, peer feedback, manager review, HR calibration and release.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={cycleId ?? ''} onChange={e => { setCycleId(e.target.value); load(e.target.value) }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white font-medium">
              {cycles.length === 0 && <option value="">No cycle yet</option>}
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}{c.status === 'closed' ? ' (closed)' : ''}</option>)}
            </select>
            {me?.isHr && (
              <button onClick={() => setNewCycle(true)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                New cycle
              </button>
            )}
          </div>
        </div>

        {!smtp && (
          <div className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            Email is not configured on this deployment (GMAIL_USER / GMAIL_APP_PASSWORD). Appraisals will still be created, but invite links must be copied and sent manually — use the copy-link button on each participant row.
          </div>
        )}

        {!cycle && (
          <div className={`${CARD} p-12 text-center`}>
            <div className="text-4xl mb-3">📋</div>
            <div className="font-semibold text-gray-800 mb-1">No appraisal cycle yet</div>
            <div className="text-sm text-gray-500 mb-5 max-w-md mx-auto">Create a cycle first — it sets the review period and the due dates that appear on everyone&apos;s form.</div>
            {me?.isHr && <button onClick={() => setNewCycle(true)} className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Create a cycle</button>}
          </div>
        )}

        {cycle && (
          <>
            {/* stat strip */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-5">
              <Stat label="Triggered" value={stats.total} sub={`of ${eligible.length} eligible`} tone="text-gray-900" />
              <Stat label="Self-assessment" value={stats.self} tone="text-blue-600" />
              <Stat label="Peer feedback" value={stats.peer} tone="text-amber-600" />
              <Stat label="Manager review" value={stats.manager} tone="text-orange-600" />
              <Stat label="HR review" value={stats.hr} tone="text-indigo-600" />
              <Stat label="Released" value={stats.released} tone="text-emerald-600" />
            </div>

            {/* tabs */}
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              {([['board', 'Board'], ['trigger', `Trigger (${notYet.length})`], ['calibration', 'Calibration']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                  {l}
                </button>
              ))}
            </div>

            {/* ---------------------------------------------------- TRIGGER */}
            {tab === 'trigger' && (
              <div className={`${CARD} p-5`}>
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <div className="font-bold text-gray-900">Trigger the appraisal</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      Active India full-time employees who have not been triggered for <strong>{cycle.name}</strong>. Each person selected gets an email with a personal link to their self-assessment.
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setSel(new Set(notYet.map(e => e.id)))} className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Select all</button>
                    <button onClick={() => setSel(new Set())} className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Clear</button>
                    <button
                      disabled={!sel.size || !!busy || !me?.isHr}
                      onClick={async () => {
                        const j = await act({ action: 'trigger', cycle_id: cycle.id, employee_ids: [...sel] }, 'trigger')
                        if (j) { setSel(new Set()); setToast(`Triggered ${j.results.filter((r: any) => r.ok).length} appraisal(s)`); setTab('board') }
                      }}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">
                      {busy === 'trigger' ? 'Triggering…' : `Trigger ${sel.size || ''} appraisal${sel.size === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </div>
                {notYet.length === 0
                  ? <div className="text-sm text-gray-400 py-8 text-center">Every eligible employee has been triggered for this cycle.</div>
                  : (
                    <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-[540px] overflow-y-auto">
                      {notYet.map(e => (
                        <label key={e.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={sel.has(e.id)} className="w-4 h-4"
                            onChange={ev => setSel(s => { const n = new Set(s); ev.target.checked ? n.add(e.id) : n.delete(e.id); return n })} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">{e.name}</div>
                            <div className="text-xs text-gray-500 truncate">{e.role} · {e.dept} · Manager: {e.manager ?? '—'}</div>
                          </div>
                          {!e.ms_email && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">no email</span>}
                        </label>
                      ))}
                    </div>
                  )}
              </div>
            )}

            {/* ---------------------------------------------------- BOARD */}
            {tab === 'board' && (
              <>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, role, department or manager…"
                  className="w-full mb-3 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
                {filtered.length === 0 && <div className={`${CARD} p-12 text-center text-sm text-gray-400`}>Nothing triggered yet — use the Trigger tab to start.</div>}
                <div className="space-y-2">
                  {filtered.map(a => (
                    <Row key={a.id} a={a} parts={partsOf(a.id)} open={open === a.id}
                      onToggle={() => setOpen(open === a.id ? null : a.id)}
                      me={me} busy={busy} act={act} setToast={setToast} />
                  ))}
                </div>
              </>
            )}

            {/* ---------------------------------------------------- CALIBRATION */}
            {tab === 'calibration' && <Calibration appraisals={appraisals} />}
          </>
        )}
      </div>

      {newCycle && <NewCycleModal onClose={() => setNewCycle(false)} onCreate={async d => {
        const j = await act({ action: 'create_cycle', ...d }, 'cycle')
        if (j) { setNewCycle(false); setCycleId(j.cycle.id); load(j.cycle.id); setTab('trigger') }
      }} busy={busy === 'cycle'} />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50 flex items-center gap-3">
          {toast}<button onClick={() => setToast(null)} className="text-white/50 hover:text-white">✕</button>
        </div>
      )}
    </AppShell>
  )
}

// ------------------------------------------------------------------ row
function Row({ a, parts, open, onToggle, me, busy, act, setToast }: {
  a: Appraisal; parts: Participant[]; open: boolean; onToggle: () => void
  me: { isHr: boolean } | null; busy: string | null
  act: (p: Record<string, unknown>, l: string) => Promise<any>
  setToast: (s: string) => void
}) {
  const self = parts.find(p => p.kind === 'self')
  const mgr = parts.find(p => p.kind === 'manager')
  const peers = parts.filter(p => p.kind === 'peer')
  const pendingNoms = peers.filter(p => p.nomination_status === 'pending')
  const [noms, setNoms] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [hr, setHr] = useState({ band: a.rating_band ?? '', potential: a.potential ?? '', hike: a.hike_percent ?? '', comments: a.hr_comments ?? '', promo: a.promotion_recommended, role: a.new_role ?? '' })
  const stageIdx = STAGES.findIndex(s => s.key === a.stage)

  return (
    <div className={`${CARD} overflow-hidden`}>
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-50 text-left">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-sm truncate">{a.employee_name}</div>
          <div className="text-xs text-gray-500 truncate">{a.employee_role} · {a.employee_dept} · Manager: {a.manager_name ?? '—'}</div>
        </div>
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          {STAGES.map((s, i) => (
            <span key={s.key} title={s.label}
              className={`w-6 h-1.5 rounded-full ${i < stageIdx ? 'bg-emerald-400' : i === stageIdx ? 'bg-indigo-500' : 'bg-gray-200'}`} />
          ))}
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${STAGE_TONE[a.stage] ?? 'bg-gray-100 text-gray-600'}`}>
          {STAGES.find(s => s.key === a.stage)?.label ?? a.stage}
        </span>
        {a.final_score != null && <span className="text-sm font-bold text-gray-800 shrink-0 w-16 text-right">{a.final_score}<span className="text-xs text-gray-400">/100</span></span>}
        {a.rating_band && <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 hidden lg:inline ${BAND_TONE[a.rating_band] ?? 'bg-gray-100'}`}>{a.rating_band}</span>}
        <span className="text-gray-300 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-4 bg-gray-50/50 space-y-4">
          {/* three views side by side */}
          <div>
            <H>Ratings side by side</H>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
                  <tr className="text-gray-400 text-[10px] uppercase tracking-wider">
                    <th className="text-left font-bold pb-2">Dimension (1–10)</th>
                    <th className="text-center font-bold pb-2 w-20">Self</th>
                    <th className="text-center font-bold pb-2 w-20">Peers</th>
                    <th className="text-center font-bold pb-2 w-20">Manager</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {CORE_RATINGS.map(c => (
                    <tr key={c.id}>
                      <td className="py-2 text-gray-700 font-medium">{c.label}</td>
                      <Cell v={a.self_core?.[c.id]} /><Cell v={a.peer_core?.[c.id]} /><Cell v={a.manager_core?.[c.id]} />
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200">
                    <td className="py-2 font-bold text-gray-800">Overall score /100</td>
                    <Cell v={a.self_score} big /><Cell v={a.peer_score} big /><Cell v={a.manager_score} big />
                  </tr>
                </tbody>
              </table>
            </div>
            {a.final_score != null && (
              <div className="mt-3 flex items-center gap-4 flex-wrap text-xs bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div><span className="text-gray-500">Final </span><strong className="text-lg text-gray-900">{a.final_score}</strong><span className="text-gray-400">/100</span></div>
                <div className="text-gray-300">|</div>
                <div className="text-gray-500">Manager 70% · Peers 20% · Self 10%</div>
                {a.rating_band && <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${BAND_TONE[a.rating_band] ?? ''}`}>{a.rating_band}</span>}
                {a.nine_box && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">9-box: {a.nine_box}</span>}
                {a.promotion_recommended && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700">Promotion recommended{a.new_role ? ` → ${a.new_role}` : ''}</span>}
                {a.hike_percent != null && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">Hike {a.hike_percent}%</span>}
              </div>
            )}
          </div>

          {/* participants */}
          <div>
            <H>Participants</H>
            <div className="space-y-1.5">
              {parts.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2 text-xs flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${p.kind === 'self' ? 'bg-blue-100 text-blue-700' : p.kind === 'peer' ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>{p.kind}</span>
                  <span className="font-semibold text-gray-800">{p.person_name ?? '—'}</span>
                  <span className="text-gray-400 truncate">{p.person_email ?? 'no email on file'}</span>
                  <span className="flex-1" />
                  {p.nomination_status === 'pending' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">awaiting approval</span>}
                  {p.nomination_status === 'rejected' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">declined</span>}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.status === 'submitted' ? 'bg-emerald-100 text-emerald-700' : p.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{p.status.replace('_', ' ')}</span>
                  {p.score != null && <span className="font-bold text-gray-700">{p.score}/100</span>}
                  <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/appraisal/${p.token}`); setToast('Link copied') }}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold">copy link</button>
                  {p.status !== 'submitted' && p.nomination_status !== 'pending' && p.person_email && (
                    <button onClick={async () => { const j = await act({ action: 'remind', participant_id: p.id }, 'r' + p.id); setToast(j?.ok ? 'Reminder sent' : 'Reminder failed') }}
                      className="text-gray-500 hover:text-gray-800 font-semibold">remind</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* peer nomination approval */}
          {pendingNoms.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <H>Approve peer nominations</H>
              <div className="text-xs text-gray-600 mb-3">{a.employee_name} nominated these colleagues. Approve the ones who have genuinely seen their work — invites go out immediately on approval.</div>
              <div className="space-y-2">
                {pendingNoms.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-xs">
                    <span className="font-semibold text-gray-800 flex-1">{p.person_name}</span>
                    {(['approved', 'rejected'] as const).map(d => (
                      <button key={d} onClick={() => setNoms(n => ({ ...n, [p.id]: d }))}
                        className={`px-3 py-1 rounded-lg font-semibold border ${noms[p.id] === d ? (d === 'approved' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-gray-600 text-white border-gray-600') : 'bg-white text-gray-500 border-gray-200'}`}>
                        {d === 'approved' ? 'Approve' : 'Decline'}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <button
                disabled={Object.keys(noms).length !== pendingNoms.length || !!busy}
                onClick={async () => {
                  const j = await act({ action: 'decide_peers', appraisal_id: a.id, decisions: Object.entries(noms).map(([id, decision]) => ({ id, decision })) }, 'noms')
                  if (j) setToast('Nominations processed — approved peers invited')
                }}
                className="mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40">
                Confirm and invite
              </button>
            </div>
          )}

          {/* nudge manager */}
          {a.stage !== 'released' && mgr && mgr.status !== 'submitted' && pendingNoms.length === 0 && self?.status === 'submitted' && (
            <button onClick={async () => { const j = await act({ action: 'open_manager', appraisal_id: a.id }, 'om'); setToast(j?.mail?.ok ? 'Manager notified' : 'Stage moved — email not sent') }}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100">
              Send the manager their review link now
            </button>
          )}

          {/* submitted responses */}
          {parts.some(p => p.status === 'submitted') && (
            <div>
              <H>Submitted responses</H>
              <div className="space-y-2">{parts.filter(p => p.status === 'submitted').map(p => <Response key={p.id} p={p} />)}</div>
            </div>
          )}

          {/* HR decision */}
          {me?.isHr && a.stage !== 'released' && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <H>HR calibration &amp; release</H>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <Field label="Final band">
                  <select value={hr.band} onChange={e => setHr(h => ({ ...h, band: e.target.value }))} className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg bg-white">
                    <option value="">Auto from score{a.final_score != null ? ` (${bandFor(a.final_score)?.label})` : ''}</option>
                    {BANDS.map(b => <option key={b.key} value={b.label}>{b.label}</option>)}
                  </select>
                </Field>
                <Field label="Potential">
                  <select value={hr.potential} onChange={e => setHr(h => ({ ...h, potential: e.target.value }))} className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg bg-white">
                    <option value="">—</option>{POTENTIAL.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label={`Hike %${hr.band ? ` (guide ${BANDS.find(b => b.label === hr.band)?.hikeLow}–${BANDS.find(b => b.label === hr.band)?.hikeHigh}%)` : ''}`}>
                  <input type="number" step={0.5} value={hr.hike} onChange={e => setHr(h => ({ ...h, hike: e.target.value }))} className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg" />
                </Field>
                <Field label="Promotion">
                  <label className="flex items-center gap-2 px-2.5 py-2 text-xs bg-white border border-gray-200 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={hr.promo} onChange={e => setHr(h => ({ ...h, promo: e.target.checked }))} className="w-3.5 h-3.5" />
                    Recommended
                  </label>
                </Field>
                {hr.promo && <Field label="New title"><input value={hr.role} onChange={e => setHr(h => ({ ...h, role: e.target.value }))} className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg" /></Field>}
              </div>
              <Field label="HR notes (internal — not shown to the employee)">
                <textarea rows={2} value={hr.comments} onChange={e => setHr(h => ({ ...h, comments: e.target.value }))} className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg resize-y" />
              </Field>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={async () => { await act({ action: 'hr_decision', appraisal_id: a.id, rating_band: hr.band || null, potential: hr.potential || null, hike_percent: hr.hike, promotion_recommended: hr.promo, new_role: hr.role, hr_comments: hr.comments }, 'hr'); setToast('HR decision saved') }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100">Save decision</button>
                <button
                  disabled={mgr?.status !== 'submitted' || !!busy}
                  title={mgr?.status !== 'submitted' ? 'The manager review must be submitted first' : ''}
                  onClick={async () => {
                    if (!confirm(`Release the appraisal outcome to ${a.employee_name}? They will receive the rating, score and their manager's written assessment by email. This cannot be undone.`)) return
                    const j = await act({ action: 'release', appraisal_id: a.id }, 'rel')
                    setToast(j?.mail?.ok ? 'Released and emailed to the employee' : 'Released — email could not be sent')
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                  Release to employee
                </button>
              </div>
            </div>
          )}

          {a.released_at && (
            <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Released {new Date(a.released_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} — outcome emailed to the employee and written back to their HR record.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ response viewer
function Response({ p }: { p: Participant }) {
  const [open, setOpen] = useState(false)
  const qs = p.kind === 'self' ? SELF_NARRATIVES : p.kind === 'peer' ? PEER_NARRATIVES : MANAGER_NARRATIVES
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-gray-50">
        <span className="font-semibold text-gray-800">{p.person_name} <span className="font-normal text-gray-400">· {p.kind}</span></span>
        <span className="flex items-center gap-2">
          {p.score != null && <span className="font-bold text-indigo-600">{p.score}/100</span>}
          <span className="text-gray-300">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 text-xs">
          <div className="flex gap-3 flex-wrap pt-1">
            {CORE_RATINGS.map(c => p.answers?.[c.id] ? (
              <span key={c.id} className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 font-semibold">{c.label} {p.answers[c.id]}/10</span>
            ) : null)}
          </div>
          {parseProjects(p.projects).filter(r => r.project).map((r, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
              <div className="font-semibold text-gray-800">{r.project}{r.client ? ` — ${r.client}` : ''} <span className="font-normal text-gray-400">{r.duration}</span></div>
              {r.targets && <div className="mt-1 text-gray-600"><span className="text-gray-400">Targets: </span>{r.targets}</div>}
              {r.achievements && <div className="mt-0.5 text-gray-600"><span className="text-gray-400">Achieved: </span>{r.achievements}</div>}
              {r.skills && <div className="mt-0.5 text-gray-500"><span className="text-gray-400">Skills: </span>{r.skills}</div>}
            </div>
          ))}
          {qs.filter(q => p.answers?.[q.id]).map(q => (
            <div key={q.id}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">{q.label}</div>
              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">{p.answers[q.id]}</div>
            </div>
          ))}
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 pt-2 border-t border-gray-100">
            {COMPETENCIES.filter(c => p.answers?.[c.id]).map(c => (
              <div key={c.id} className="flex justify-between gap-2 text-[11px]">
                <span className="text-gray-500 truncate">{c.label}</span><span className="font-bold text-gray-700">{p.answers[c.id]}/5</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ calibration
function Calibration({ appraisals }: { appraisals: Appraisal[] }) {
  const scored = appraisals.filter(a => a.final_score != null)
  const dist = BANDS.map(b => ({ ...b, n: scored.filter(a => a.rating_band === b.label).length }))
  const grid: Record<string, Appraisal[]> = {}
  for (const a of scored) {
    const key = `${performanceTier(a.final_score)}|${a.potential ?? '—'}`
    ;(grid[key] ||= []).push(a)
  }
  const perfRows = ['High', 'Medium', 'Low']
  const potCols = ['Low', 'Medium', 'High']

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="font-bold text-gray-900 mb-1">Rating distribution</div>
        <div className="text-sm text-gray-500 mb-4">{scored.length} of {appraisals.length} appraisals have a final score. Watch for grade inflation — a healthy curve has most people in the middle bands.</div>
        <div className="space-y-2">
          {dist.map(b => (
            <div key={b.key} className="flex items-center gap-3">
              <div className="w-40 text-xs font-semibold text-gray-700 shrink-0">{b.label}</div>
              <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden">
                <div className={`h-full ${BAND_TONE[b.label]?.split(' ')[0] ?? 'bg-gray-300'} transition-all`} style={{ width: scored.length ? `${(b.n / scored.length) * 100}%` : '0%' }} />
              </div>
              <div className="w-24 text-xs text-gray-500 shrink-0 text-right">
                {b.n} · {scored.length ? Math.round((b.n / scored.length) * 100) : 0}%
              </div>
              <div className="w-24 text-[10px] text-gray-400 shrink-0 text-right">hike {b.hikeLow}–{b.hikeHigh}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="font-bold text-gray-900 mb-1">9-box: performance vs potential</div>
        <div className="text-sm text-gray-500 mb-4">Performance from the final appraisal score; potential from the manager&apos;s rating. Only appraisals where both exist are placed.</div>
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[80px_repeat(3,1fr)] gap-1.5">
              <div />
              {potCols.map(c => <div key={c} className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider pb-1">{c} potential</div>)}
              {perfRows.map(r => (
                <>
                  <div key={r} className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-end pr-2 text-right">{r} perf.</div>
                  {potCols.map(c => {
                    const list = grid[`${r}|${c}`] ?? []
                    const hot = r === 'High' && c === 'High'
                    return (
                      <div key={r + c} className={`min-h-[92px] rounded-xl border p-2 ${hot ? 'bg-emerald-50 border-emerald-200' : list.length ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100'}`}>
                        {list.map(a => (
                          <div key={a.id} className="text-[11px] text-gray-700 truncate leading-snug" title={`${a.employee_name} — ${a.final_score}/100`}>{a.employee_name}</div>
                        ))}
                        {!list.length && <div className="text-[10px] text-gray-300">—</div>}
                      </div>
                    )
                  })}
                </>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ bits
function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone: string }) {
  return (
    <div className={`${CARD} px-4 py-3`}>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-[11px] text-gray-500 font-medium">{label}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  )
}
function H({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[11px] font-semibold text-gray-600 mb-1 block">{label}</label>{children}</div>
}
function Cell({ v, big }: { v?: number | null; big?: boolean }) {
  return (
    <td className={`text-center py-2 ${big ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
      {v == null ? <span className="text-gray-300">—</span> : v}
    </td>
  )
}

function NewCycleModal({ onClose, onCreate, busy }: { onClose: () => void; onCreate: (d: Record<string, string>) => void; busy: boolean }) {
  const y = new Date().getFullYear()
  const [d, setD] = useState({ name: `FY${String(y).slice(2)} Annual Appraisal`, period_start: `${y - 1}-04-01`, period_end: `${y}-03-31`, self_due: '', peer_due: '', manager_due: '' })
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className={`${CARD} p-6 w-full max-w-md`} onClick={e => e.stopPropagation()}>
        <div className="font-bold text-lg text-gray-900 mb-1">New appraisal cycle</div>
        <div className="text-sm text-gray-500 mb-4">Due dates appear on each participant&apos;s form and in their invite email.</div>
        <div className="space-y-3">
          <Field label="Cycle name"><input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Period from"><input type="date" value={d.period_start} onChange={e => setD({ ...d, period_start: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" /></Field>
            <Field label="Period to"><input type="date" value={d.period_end} onChange={e => setD({ ...d, period_end: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Self due"><input type="date" value={d.self_due} onChange={e => setD({ ...d, self_due: e.target.value })} className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg" /></Field>
            <Field label="Peer due"><input type="date" value={d.peer_due} onChange={e => setD({ ...d, peer_due: e.target.value })} className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg" /></Field>
            <Field label="Manager due"><input type="date" value={d.manager_due} onChange={e => setD({ ...d, manager_due: e.target.value })} className="w-full px-2 py-2 text-xs border border-gray-200 rounded-lg" /></Field>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button disabled={!d.name || busy} onClick={() => onCreate(d)} className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create cycle'}
          </button>
        </div>
      </div>
    </div>
  )
}
