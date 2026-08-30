// Internal: recompute derived scores for one appraisal. Called after a manager
// submits through the tokenised form (which has no session).
import { NextResponse } from 'next/server'
import { svc } from '@/lib/appraisal-server'
import { finalScore, bandFor, performanceTier, nineBox, raterScore } from '@/lib/appraisal'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const db = svc()
  const { data: a } = await db.from('appraisals').select('*').eq('id', id).maybeSingle()
  if (!a) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: parts } = await db.from('appraisal_participants')
    .select('kind,status,answers,score,nomination_status').eq('appraisal_id', id)
  const rows = (parts ?? []).filter(r => r.status === 'submitted' && r.nomination_status !== 'rejected')

  const one = (k: string) => rows.find(r => r.kind === k)
  const self = one('self'), mgr = one('manager')
  const peers = rows.filter(r => r.kind === 'peer')

  const selfScore = self ? (self.score ?? raterScore(self.answers ?? {}, 'self')) : null
  const mgrScore = mgr ? (mgr.score ?? raterScore(mgr.answers ?? {}, 'manager')) : null
  const ps = peers.map(p => p.score ?? raterScore(p.answers ?? {}, 'peer')).filter((n): n is number => n != null)
  const peerScore = ps.length ? Math.round((ps.reduce((s, n) => s + n, 0) / ps.length) * 10) / 10 : null

  const avgCore = (list: Array<Record<string, unknown>>) => {
    const out: Record<string, number | null> = {}
    for (const key of ['r_performance', 'r_attitude', 'r_team_mgmt']) {
      const vals = list.map(x => Number(x?.[key])).filter(n => Number.isFinite(n) && n >= 1 && n <= 10)
      out[key] = vals.length ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 10) / 10 : null
    }
    return out
  }

  const fin = finalScore({ manager: mgrScore, peer: peerScore, self: selfScore })
  const patch: Record<string, unknown> = {
    self_score: selfScore, peer_score: peerScore, manager_score: mgrScore, final_score: fin,
    self_core: self ? avgCore([self.answers ?? {}]) : {},
    peer_core: peers.length ? avgCore(peers.map(p => p.answers ?? {})) : {},
    manager_core: mgr ? avgCore([mgr.answers ?? {}]) : {},
    nine_box: nineBox(performanceTier(fin), a.potential ?? null),
    updated_at: new Date().toISOString(),
  }
  if (!a.hr_adjusted_band) patch.rating_band = bandFor(fin)?.label ?? null

  await db.from('appraisals').update(patch).eq('id', id)
  return NextResponse.json({ ok: true, final_score: fin })
}
