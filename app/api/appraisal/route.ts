// Admin / HR / manager side of the appraisal module. Session-authenticated.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { svc, newToken, baseUrl, sendMail, logEvent, esc } from '@/lib/appraisal-server'
import { finalScore, bandFor, performanceTier, nineBox, raterScore, scoreCore } from '@/lib/appraisal'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'raghu.seetharam@simpliigence.com'
const HR_ROLES = ['admin', 'super_manager']

async function session() {
  const store = cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return store.getAll() },
        setAll(list) { list.forEach(({ name, value, options }) => { try { store.set(name, value, options) } catch {} }) },
      },
    }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data } = await sb.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  const role = (user.email ?? '').toLowerCase() === ADMIN_EMAIL ? 'admin' : ((data as { role?: string } | null)?.role ?? 'viewer')
  return { email: user.email ?? '', role, isHr: HR_ROLES.includes(role) || (user.email ?? '').toLowerCase() === ADMIN_EMAIL }
}

/** Recompute and persist every derived score on an appraisal. */
async function recompute(appraisalId: string) {
  const db = svc()
  const { data: a } = await db.from('appraisals').select('*').eq('id', appraisalId).maybeSingle()
  if (!a) return null
  const { data: parts } = await db
    .from('appraisal_participants')
    .select('kind,status,answers,score,nomination_status')
    .eq('appraisal_id', appraisalId)

  const rows = parts ?? []
  const submitted = (k: string) =>
    rows.filter(r => r.kind === k && r.status === 'submitted' && r.nomination_status !== 'rejected')

  const self = submitted('self')[0]
  const mgr = submitted('manager')[0]
  const peers = submitted('peer')

  const selfScore = self ? (self.score ?? raterScore(self.answers ?? {}, 'self')) : null
  const mgrScore = mgr ? (mgr.score ?? raterScore(mgr.answers ?? {}, 'manager')) : null
  const peerScores = peers.map(p => p.score ?? raterScore(p.answers ?? {}, 'peer')).filter((n): n is number => n != null)
  const peerScore = peerScores.length ? Math.round((peerScores.reduce((s, n) => s + n, 0) / peerScores.length) * 10) / 10 : null

  const avgCore = (list: Array<Record<string, unknown>>) => {
    const ids = ['r_performance', 'r_attitude', 'r_team_mgmt']
    const out: Record<string, number | null> = {}
    for (const id of ids) {
      const vals = list.map(x => Number(x?.[id])).filter(n => Number.isFinite(n) && n >= 1 && n <= 10)
      out[id] = vals.length ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10 : null
    }
    return out
  }

  const fin = finalScore({ manager: mgrScore, peer: peerScore, self: selfScore })
  const band = bandFor(fin)
  const tier = performanceTier(fin)

  const patch: Record<string, unknown> = {
    self_score: selfScore,
    peer_score: peerScore,
    manager_score: mgrScore,
    final_score: fin,
    self_core: self ? avgCore([self.answers ?? {}]) : {},
    peer_core: peers.length ? avgCore(peers.map(p => p.answers ?? {})) : {},
    manager_core: mgr ? avgCore([mgr.answers ?? {}]) : {},
    updated_at: new Date().toISOString(),
  }
  // Band is HR-adjustable; only auto-set it while HR has not overridden it.
  if (!a.hr_adjusted_band) patch.rating_band = band?.label ?? null
  patch.nine_box = nineBox(tier, a.potential ?? null)

  await db.from('appraisals').update(patch).eq('id', appraisalId)
  return { ...a, ...patch }
}

// ------------------------------------------------------------------ GET board
export async function GET(req: Request) {
  const s = await session()
  if (!s) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const db = svc()
  const url = new URL(req.url)
  const cycleId = url.searchParams.get('cycle')

  const { data: cycles } = await db.from('appraisal_cycles').select('*').order('created_at', { ascending: false })
  const active = cycleId || cycles?.[0]?.id || null

  let appraisals: unknown[] = []
  let participants: unknown[] = []
  if (active) {
    const { data: aps } = await db.from('appraisals').select('*').eq('cycle_id', active).order('employee_name')
    appraisals = aps ?? []
    const ids = (aps ?? []).map(a => a.id)
    if (ids.length) {
      const { data: ps } = await db
        .from('appraisal_participants')
        .select('id,appraisal_id,kind,person_name,person_email,person_employee_id,nomination_status,status,invited_at,submitted_at,score,answers,projects,token')
        .in('appraisal_id', ids)
      participants = ps ?? []
    }
  }

  const { data: employees } = await db
    .from('employees')
    .select('id,name,role,dept,manager,region,country,type,active,ms_email')
    .eq('active', true)
    .order('name')

  return NextResponse.json({
    me: s,
    cycles: cycles ?? [],
    activeCycle: active,
    appraisals,
    participants,
    employees: employees ?? [],
    smtp: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
  })
}

// ------------------------------------------------------------------ POST
export async function POST(req: Request) {
  const s = await session()
  if (!s) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const db = svc()
  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')
  const site = baseUrl(req)

  // ---------------------------------------------------------- cycle
  if (action === 'create_cycle') {
    if (!s.isHr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data, error } = await db.from('appraisal_cycles').insert({
      name: body.name,
      period_start: body.period_start || null,
      period_end: body.period_end || null,
      self_due: body.self_due || null,
      peer_due: body.peer_due || null,
      manager_due: body.manager_due || null,
      status: 'active',
      created_by: s.email,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ cycle: data })
  }

  if (action === 'update_cycle') {
    if (!s.isHr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { error } = await db.from('appraisal_cycles')
      .update({ name: body.name, status: body.status, self_due: body.self_due || null, peer_due: body.peer_due || null, manager_due: body.manager_due || null, updated_at: new Date().toISOString() })
      .eq('id', body.cycle_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ---------------------------------------------------------- trigger
  if (action === 'trigger') {
    if (!s.isHr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const cycleId = body.cycle_id
    const ids: string[] = Array.isArray(body.employee_ids) ? body.employee_ids : []
    if (!cycleId || !ids.length) return NextResponse.json({ error: 'Cycle and employees required' }, { status: 400 })

    const { data: cycle } = await db.from('appraisal_cycles').select('*').eq('id', cycleId).maybeSingle()
    const { data: emps } = await db.from('employees').select('id,name,role,dept,manager,ms_email').in('id', ids)
    const { data: all } = await db.from('employees').select('id,name,ms_email').eq('active', true)
    const byName = new Map((all ?? []).map(e => [String(e.name ?? '').trim().toLowerCase(), e]))

    const results: Array<{ employee: string; ok: boolean; note: string }> = []

    for (const e of emps ?? []) {
      const { data: existing } = await db.from('appraisals').select('id').eq('cycle_id', cycleId).eq('employee_id', e.id).maybeSingle()
      if (existing) { results.push({ employee: e.name, ok: false, note: 'Already triggered' }); continue }

      const { data: ap, error } = await db.from('appraisals').insert({
        cycle_id: cycleId,
        employee_id: e.id,
        employee_name: e.name,
        employee_role: e.role,
        employee_dept: e.dept,
        manager_name: e.manager,
        stage: 'self',
        triggered_by: s.email,
      }).select().single()
      if (error || !ap) { results.push({ employee: e.name, ok: false, note: error?.message ?? 'insert failed' }); continue }

      const mgr = byName.get(String(e.manager ?? '').trim().toLowerCase())
      const selfToken = newToken()
      const mgrToken = newToken()
      await db.from('appraisal_participants').insert([
        { appraisal_id: ap.id, kind: 'self', person_name: e.name, person_email: e.ms_email, person_employee_id: e.id, token: selfToken, invited_at: new Date().toISOString() },
        { appraisal_id: ap.id, kind: 'manager', person_name: e.manager, person_email: mgr?.ms_email ?? null, person_employee_id: mgr?.id ?? null, token: mgrToken },
      ])

      const mail = await sendMail({
        to: e.ms_email ?? '',
        subject: `Your ${cycle?.name ?? 'annual'} appraisal — self-assessment`,
        heading: `Your appraisal is open, ${esc(String(e.name).split(' ')[0])}`,
        body: `<p>Your <strong>${esc(cycle?.name ?? 'annual appraisal')}</strong> has been opened. The first step is your self-assessment.</p>
<p>You will be asked to list the projects you worked on this year, the targets you were given and what you achieved against them, the skills you picked up, and your contributions outside project work. You will also rate yourself on <strong>performance, attitude and team management</strong>.</p>
<p>At the end you can nominate up to <strong>three colleagues</strong> to give feedback on your work. Your manager reviews the nominations before they are invited.</p>
${cycle?.self_due ? `<p><strong>Please submit by ${esc(cycle.self_due)}.</strong></p>` : ''}
<p>Your answers save as you go, so you can come back to the form.</p>`,
        cta: { label: 'Start my self-assessment', url: `${site}/appraisal/${selfToken}` },
      })

      await logEvent(ap.id, s.email, 'triggered', mail.ok ? 'Self-assessment invite sent' : `Invite not sent: ${mail.error}`)
      results.push({ employee: e.name, ok: true, note: mail.ok ? 'Invite sent' : `Created — email failed (${mail.error})` })
    }
    return NextResponse.json({ results })
  }

  // ---------------------------------------------------------- peer nominations
  if (action === 'decide_peers') {
    const appraisalId = body.appraisal_id
    const decisions: Array<{ id: string; decision: 'approved' | 'rejected' }> = body.decisions ?? []
    const { data: ap } = await db.from('appraisals').select('*').eq('id', appraisalId).maybeSingle()
    if (!ap) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: cycle } = await db.from('appraisal_cycles').select('*').eq('id', ap.cycle_id).maybeSingle()

    const notes: string[] = []
    for (const d of decisions) {
      await db.from('appraisal_participants').update({ nomination_status: d.decision }).eq('id', d.id)
      if (d.decision === 'approved') {
        const { data: p } = await db.from('appraisal_participants').select('*').eq('id', d.id).maybeSingle()
        if (p && !p.invited_at) {
          const mail = await sendMail({
            to: p.person_email ?? '',
            subject: `Feedback request: ${ap.employee_name}`,
            heading: `${esc(ap.employee_name)} has asked for your feedback`,
            body: `<p><strong>${esc(ap.employee_name)}</strong> (${esc(ap.employee_role ?? '')}) nominated you as a peer reviewer for their <strong>${esc(cycle?.name ?? 'annual appraisal')}</strong>, and their manager has approved the nomination.</p>
<p>It takes about ten minutes. You will rate them on <strong>performance, attitude and team management</strong> on a 1&ndash;10 scale, score a short set of competencies, and answer three written questions.</p>
<p>Your individual responses are shown to the manager and HR as part of the appraisal. Please be candid and specific &mdash; examples are far more useful than adjectives.</p>
${cycle?.peer_due ? `<p><strong>Please submit by ${esc(cycle.peer_due)}.</strong></p>` : ''}`,
            cta: { label: 'Give feedback', url: `${site}/appraisal/${p.token}` },
          })
          await db.from('appraisal_participants').update({ invited_at: new Date().toISOString() }).eq('id', d.id)
          notes.push(`${p.person_name}: ${mail.ok ? 'invited' : 'email failed — ' + mail.error}`)
        }
      }
    }

    // Once nominations are decided, the appraisal moves to peer collection.
    await db.from('appraisals').update({ stage: 'peer', updated_at: new Date().toISOString() }).eq('id', appraisalId)
    await logEvent(appraisalId, s.email, 'peers_decided', notes.join('; '))
    return NextResponse.json({ ok: true, notes })
  }

  // ---------------------------------------------------------- open manager step
  if (action === 'open_manager') {
    const appraisalId = body.appraisal_id
    const { data: ap } = await db.from('appraisals').select('*').eq('id', appraisalId).maybeSingle()
    if (!ap) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: cycle } = await db.from('appraisal_cycles').select('*').eq('id', ap.cycle_id).maybeSingle()
    const { data: p } = await db.from('appraisal_participants').select('*').eq('appraisal_id', appraisalId).eq('kind', 'manager').maybeSingle()
    if (!p) return NextResponse.json({ error: 'No manager participant' }, { status: 400 })

    const mail = await sendMail({
      to: p.person_email ?? '',
      subject: `Manager review due: ${ap.employee_name}`,
      heading: `Time to review ${esc(ap.employee_name)}`,
      body: `<p>The self-assessment and peer feedback for <strong>${esc(ap.employee_name)}</strong> (${esc(ap.employee_role ?? '')}) are in. Your review is the final rating input.</p>
<p>You will see their self-assessment and every peer response side by side before you rate. You will be asked for the 1&ndash;10 ratings, the competency grid, a written assessment, next-cycle goals, a potential rating and a hike recommendation.</p>
${cycle?.manager_due ? `<p><strong>Please submit by ${esc(cycle.manager_due)}.</strong></p>` : ''}`,
      cta: { label: 'Open the review', url: `${site}/appraisal/${p.token}` },
    })
    await db.from('appraisal_participants').update({ invited_at: new Date().toISOString() }).eq('id', p.id)
    await db.from('appraisals').update({ stage: 'manager', updated_at: new Date().toISOString() }).eq('id', appraisalId)
    await logEvent(appraisalId, s.email, 'manager_opened', mail.ok ? 'Manager notified' : `Email failed: ${mail.error}`)
    return NextResponse.json({ ok: true, mail })
  }

  // ---------------------------------------------------------- reminders
  if (action === 'remind') {
    const { data: p } = await db.from('appraisal_participants').select('*').eq('id', body.participant_id).maybeSingle()
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: ap } = await db.from('appraisals').select('*').eq('id', p.appraisal_id).maybeSingle()
    const who = p.kind === 'self' ? 'your self-assessment' : p.kind === 'peer' ? `your feedback on ${ap?.employee_name}` : `your review of ${ap?.employee_name}`
    const mail = await sendMail({
      to: p.person_email ?? '',
      subject: `Reminder: ${p.kind === 'self' ? 'your appraisal self-assessment' : `appraisal input for ${ap?.employee_name}`}`,
      heading: 'A quick reminder',
      body: `<p>This is a reminder that <strong>${esc(who)}</strong> is still outstanding. It only takes a few minutes and everything you have already typed has been saved.</p>`,
      cta: { label: 'Open the form', url: `${site}/appraisal/${p.token}` },
    })
    await db.from('appraisal_participants').update({ reminded_at: new Date().toISOString(), invited_at: p.invited_at ?? new Date().toISOString() }).eq('id', p.id)
    return NextResponse.json({ ok: mail.ok, error: mail.error })
  }

  // ---------------------------------------------------------- HR decision
  if (action === 'hr_decision') {
    if (!s.isHr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const patch: Record<string, unknown> = {
      hr_comments: body.hr_comments ?? null,
      hike_percent: body.hike_percent === '' || body.hike_percent == null ? null : Number(body.hike_percent),
      promotion_recommended: Boolean(body.promotion_recommended),
      new_role: body.new_role || null,
      stage: 'hr',
      updated_at: new Date().toISOString(),
    }
    if (body.rating_band) { patch.rating_band = body.rating_band; patch.hr_adjusted_band = body.rating_band }
    if (body.potential) patch.potential = body.potential
    const { error } = await db.from('appraisals').update(patch).eq('id', body.appraisal_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await recompute(body.appraisal_id)
    await logEvent(body.appraisal_id, s.email, 'hr_review', body.rating_band ? `Band set to ${body.rating_band}` : 'HR review saved')
    return NextResponse.json({ ok: true })
  }

  // ---------------------------------------------------------- release
  if (action === 'release') {
    if (!s.isHr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data: ap } = await db.from('appraisals').select('*').eq('id', body.appraisal_id).maybeSingle()
    if (!ap) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: cycle } = await db.from('appraisal_cycles').select('*').eq('id', ap.cycle_id).maybeSingle()
    const { data: self } = await db.from('appraisal_participants').select('*').eq('appraisal_id', ap.id).eq('kind', 'self').maybeSingle()
    const { data: mgrP } = await db.from('appraisal_participants').select('answers').eq('appraisal_id', ap.id).eq('kind', 'manager').maybeSingle()
    const mgrAns = (mgrP?.answers ?? {}) as Record<string, string>

    await db.from('appraisals').update({
      stage: 'released', status: 'released',
      released_at: new Date().toISOString(), released_by: s.email,
      updated_at: new Date().toISOString(),
    }).eq('id', ap.id)

    // Write the outcome back onto the employee record.
    await db.from('employees').update({
      appraisal: `${cycle?.name ?? 'Appraisal'}: ${ap.rating_band ?? 'n/a'}${ap.final_score != null ? ` (${ap.final_score}/100)` : ''}`,
      ...(ap.hike_percent != null ? { hike: ap.hike_percent } : {}),
    }).eq('id', ap.employee_id)

    const mail = await sendMail({
      to: self?.person_email ?? '',
      subject: `Your ${cycle?.name ?? 'appraisal'} outcome`,
      heading: `Your appraisal is complete, ${esc(String(ap.employee_name ?? '').split(' ')[0])}`,
      body: `<p>Your <strong>${esc(cycle?.name ?? 'annual appraisal')}</strong> has been finalised.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
  <tr><td style="padding:8px 0;color:#666;">Overall rating</td><td style="padding:8px 0;font-weight:700;color:#1a1a2e;text-align:right;">${esc(ap.rating_band ?? '—')}</td></tr>
  <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">Overall score</td><td style="padding:8px 0;font-weight:700;color:#1a1a2e;text-align:right;border-top:1px solid #eee;">${ap.final_score != null ? esc(ap.final_score) + ' / 100' : '—'}</td></tr>
  ${ap.promotion_recommended ? `<tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">Progression</td><td style="padding:8px 0;font-weight:700;color:#1a1a2e;text-align:right;border-top:1px solid #eee;">Recommended${ap.new_role ? ' — ' + esc(ap.new_role) : ''}</td></tr>` : ''}
</table>
${mgrAns.summary ? `<div style="background:#f7f7fb;border-left:3px solid #4f46e5;padding:14px 16px;border-radius:0 8px 8px 0;margin:16px 0;"><div style="font-size:11px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Your manager's assessment</div><div style="font-size:13px;color:#333;line-height:1.6;white-space:pre-wrap;">${esc(mgrAns.summary)}</div></div>` : ''}
${mgrAns.goals_next ? `<div style="margin:16px 0;"><div style="font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Goals for the next cycle</div><div style="font-size:13px;color:#333;line-height:1.6;white-space:pre-wrap;">${esc(mgrAns.goals_next)}</div></div>` : ''}
<p>Your manager will schedule a conversation to walk through this with you in detail. Compensation, where applicable, is communicated separately.</p>`,
      footer: 'Simpliigence People &amp; Performance. Please raise any questions with your manager or the HR team.',
    })

    await logEvent(ap.id, s.email, 'released', mail.ok ? 'Outcome emailed to employee' : `Email failed: ${mail.error}`)
    return NextResponse.json({ ok: true, mail })
  }

  // ---------------------------------------------------------- misc
  if (action === 'recompute') { const a = await recompute(body.appraisal_id); return NextResponse.json({ appraisal: a }) }

  if (action === 'cancel') {
    if (!s.isHr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await db.from('appraisals').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', body.appraisal_id)
    await logEvent(body.appraisal_id, s.email, 'cancelled', body.reason ?? null)
    return NextResponse.json({ ok: true })
  }

  if (action === 'events') {
    const { data } = await db.from('appraisal_events').select('*').eq('appraisal_id', body.appraisal_id).order('created_at', { ascending: false })
    return NextResponse.json({ events: data ?? [] })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
