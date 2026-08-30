// Tokenised participant endpoint. No session — the token IS the credential.
import { NextResponse } from 'next/server'
import { svc, newToken, baseUrl, sendMail, logEvent, esc } from '@/lib/appraisal-server'
import { raterScore, MAX_PEERS } from '@/lib/appraisal'

export const dynamic = 'force-dynamic'

async function load(token: string) {
  const db = svc()
  const { data: p } = await db.from('appraisal_participants').select('*').eq('token', token).maybeSingle()
  if (!p) return null
  const { data: ap } = await db.from('appraisals').select('*').eq('id', p.appraisal_id).maybeSingle()
  if (!ap) return null
  const { data: cycle } = await db.from('appraisal_cycles').select('*').eq('id', ap.cycle_id).maybeSingle()
  return { db, p, ap, cycle }
}

// ------------------------------------------------------------------ GET
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const ctx = await load(token)
  if (!ctx) return NextResponse.json({ error: 'This link is not valid. It may have been withdrawn — please contact the HR team.' }, { status: 404 })
  const { db, p, ap, cycle } = ctx

  if (ap.status === 'cancelled') return NextResponse.json({ error: 'This appraisal has been withdrawn.' }, { status: 410 })
  if (cycle?.status === 'closed' && p.status !== 'submitted') {
    return NextResponse.json({ error: 'This appraisal cycle is now closed.' }, { status: 410 })
  }

  const payload: Record<string, unknown> = {
    participant: {
      id: p.id, kind: p.kind, name: p.person_name, status: p.status,
      answers: p.answers ?? {}, projects: p.projects ?? [],
      nomination_status: p.nomination_status, submitted_at: p.submitted_at,
    },
    appraisal: {
      id: ap.id, employee_name: ap.employee_name, employee_role: ap.employee_role,
      employee_dept: ap.employee_dept, manager_name: ap.manager_name, stage: ap.stage,
    },
    cycle: cycle ? { name: cycle.name, period_start: cycle.period_start, period_end: cycle.period_end, self_due: cycle.self_due, peer_due: cycle.peer_due, manager_due: cycle.manager_due } : null,
  }

  // The self-assessment page also needs the nomination state and the colleague list.
  if (p.kind === 'self') {
    const { data: peers } = await db.from('appraisal_participants')
      .select('id,person_name,person_email,nomination_status,status')
      .eq('appraisal_id', ap.id).eq('kind', 'peer')
    payload.peers = peers ?? []
    const { data: colleagues } = await db.from('employees')
      .select('id,name,role,dept,ms_email').eq('active', true).order('name')
    payload.colleagues = (colleagues ?? []).filter(c => c.id !== ap.employee_id)
    payload.maxPeers = MAX_PEERS
  }

  // The manager sees everything that has come in before rating.
  if (p.kind === 'manager') {
    const { data: others } = await db.from('appraisal_participants')
      .select('kind,person_name,status,answers,projects,score,submitted_at,nomination_status')
      .eq('appraisal_id', ap.id).neq('kind', 'manager')
    payload.inputs = (others ?? []).filter(o => o.status === 'submitted' && o.nomination_status !== 'rejected')
    payload.pending = (others ?? []).filter(o => o.status !== 'submitted' && o.nomination_status !== 'rejected')
      .map(o => ({ kind: o.kind, person_name: o.person_name }))
  }

  return NextResponse.json(payload)
}

// ------------------------------------------------------------------ POST
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const ctx = await load(String(body.token ?? ''))
  if (!ctx) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  const { db, p, ap, cycle } = ctx
  const action = String(body.action ?? '')
  const site = baseUrl(req)

  if (p.status === 'submitted' && action !== 'nominate') {
    return NextResponse.json({ error: 'You have already submitted this form.' }, { status: 409 })
  }

  // ---------------------------------------------------------- autosave
  if (action === 'save') {
    const { error } = await db.from('appraisal_participants').update({
      answers: body.answers ?? {},
      projects: body.projects ?? [],
      status: p.status === 'pending' ? 'in_progress' : p.status,
      updated_at: new Date().toISOString(),
    }).eq('id', p.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, saved_at: new Date().toISOString() })
  }

  // ---------------------------------------------------------- peer nominations
  if (action === 'nominate') {
    if (p.kind !== 'self') return NextResponse.json({ error: 'Only the employee can nominate.' }, { status: 403 })
    const noms: Array<{ id?: string; name: string; email: string }> = (body.nominees ?? []).slice(0, MAX_PEERS)

    // Replace any nominations that have not been invited yet.
    const { data: existing } = await db.from('appraisal_participants').select('id,invited_at').eq('appraisal_id', ap.id).eq('kind', 'peer')
    const removable = (existing ?? []).filter(e => !e.invited_at).map(e => e.id)
    if (removable.length) await db.from('appraisal_participants').delete().in('id', removable)

    if (noms.length) {
      await db.from('appraisal_participants').insert(noms.map(n => ({
        appraisal_id: ap.id, kind: 'peer',
        person_name: n.name, person_email: n.email || null, person_employee_id: n.id || null,
        token: newToken(), nomination_status: 'pending', status: 'pending',
      })))
    }
    await db.from('appraisals').update({ stage: 'nomination', updated_at: new Date().toISOString() }).eq('id', ap.id)
    await logEvent(ap.id, p.person_name ?? 'employee', 'nominated', noms.map(n => n.name).join(', ') || 'none')
    return NextResponse.json({ ok: true })
  }

  // ---------------------------------------------------------- submit
  if (action === 'submit') {
    const answers = body.answers ?? {}
    const projects = body.projects ?? []
    const score = raterScore(answers, p.kind as 'self' | 'peer' | 'manager')

    await db.from('appraisal_participants').update({
      answers, projects, score,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', p.id)

    // ---- manager submitted: capture the rating decision on the appraisal
    if (p.kind === 'manager') {
      await db.from('appraisals').update({
        potential: answers.potential || null,
        hike_percent: answers.hike_percent === '' || answers.hike_percent == null ? null : Number(answers.hike_percent),
        promotion_recommended: Boolean(answers.promotion_recommended === true || answers.promotion_recommended === 'yes'),
        new_role: answers.new_role || null,
        stage: 'hr',
        updated_at: new Date().toISOString(),
      }).eq('id', ap.id)
      await fetch(`${site}/api/appraisal/recompute?id=${ap.id}`, { method: 'POST' }).catch(() => {})
    }

    // ---- self submitted: notify the manager that nominations need a decision
    if (p.kind === 'self') {
      const { data: mgr } = await db.from('appraisal_participants').select('*').eq('appraisal_id', ap.id).eq('kind', 'manager').maybeSingle()
      const { data: noms } = await db.from('appraisal_participants').select('person_name').eq('appraisal_id', ap.id).eq('kind', 'peer')
      const list = (noms ?? []).map(n => n.person_name).filter(Boolean)
      await db.from('appraisals').update({ stage: list.length ? 'nomination' : 'manager', updated_at: new Date().toISOString() }).eq('id', ap.id)
      if (mgr?.person_email) {
        await sendMail({
          to: mgr.person_email,
          subject: `${ap.employee_name} submitted their self-assessment`,
          heading: `${esc(ap.employee_name)} has submitted`,
          body: `<p><strong>${esc(ap.employee_name)}</strong> (${esc(ap.employee_role ?? '')}) has completed their self-assessment for the <strong>${esc(cycle?.name ?? 'annual appraisal')}</strong>.</p>
${list.length ? `<p>They nominated <strong>${esc(list.join(', '))}</strong> as peer reviewers. Please approve or change the nominations in the HR portal &mdash; peers are only invited once you have.</p>`
  : '<p>They did not nominate any peer reviewers, so the appraisal is ready for your review.</p>'}`,
          cta: { label: 'Open the Appraisal board', url: `${site}/appraisal` },
        })
      }
    }

    // ---- peer submitted: tell the manager when the last one is in
    if (p.kind === 'peer') {
      const { data: peers } = await db.from('appraisal_participants').select('status,nomination_status').eq('appraisal_id', ap.id).eq('kind', 'peer')
      const live = (peers ?? []).filter(x => x.nomination_status === 'approved')
      const done = live.every(x => x.status === 'submitted')
      if (done && live.length) {
        const { data: mgr } = await db.from('appraisal_participants').select('*').eq('appraisal_id', ap.id).eq('kind', 'manager').maybeSingle()
        await db.from('appraisals').update({ stage: 'manager', updated_at: new Date().toISOString() }).eq('id', ap.id)
        if (mgr?.person_email) {
          await sendMail({
            to: mgr.person_email,
            subject: `All feedback is in for ${ap.employee_name}`,
            heading: `Ready for your review: ${esc(ap.employee_name)}`,
            body: `<p>Every nominated peer has submitted their feedback for <strong>${esc(ap.employee_name)}</strong>. Their self-assessment and all peer responses are waiting for you on the review form.</p>
${cycle?.manager_due ? `<p><strong>Please submit your review by ${esc(cycle.manager_due)}.</strong></p>` : ''}`,
            cta: { label: 'Open the review', url: `${site}/appraisal/${mgr.token}` },
          })
          await db.from('appraisal_participants').update({ invited_at: mgr.invited_at ?? new Date().toISOString() }).eq('id', mgr.id)
        }
      }
    }

    await logEvent(ap.id, p.person_name ?? p.kind, `${p.kind}_submitted`, score != null ? `Score ${score}/100` : undefined)
    return NextResponse.json({ ok: true, score })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
