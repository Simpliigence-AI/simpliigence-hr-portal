'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useAccess } from '@/lib/access';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type Emp = {
  id: string;
  name: string;
  role: string | null;
  dept: string | null;
  region: string | null;
  manager: string | null;
  type: string | null;
  status: string | null;
  active: boolean | null;
  ms_email: string | null;
};

type Review = {
  id: string;
  employee_id: string;
  review_month: string;
  manager_name: string | null;
  composite_score: number | null;
  score: number | null;
  overall_feedback: string | null;
  review_template: string | null;
};

type ActionPoint = {
  id: string;
  employee_id: string | null;
  description: string | null;
  priority: string | null;
  status: string | null;
  due_date: string | null;
};

/** Trimmed shape of what /api/timesheets returns. */
type TsPayload = {
  people: { email: string; name: string }[];
  entries: [number, string, number, number, 0 | 1, 0 | 1][];
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const clean = (s: unknown) =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Everyone below `managerName` in the tree, by name match on employees.manager. */
function getReports(all: Emp[], managerName: string, seen = new Set<string>()): Emp[] {
  const key = clean(managerName);
  if (!key || seen.has(key)) return [];
  seen.add(key);
  const direct = all.filter((e) => clean(e.manager) === key);
  return [...direct, ...direct.flatMap((d) => getReports(all, d.name, seen))];
}

/** First of the month, n months back from today. */
function monthStart(offset = 0) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 10);
}

const monthLabel = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

function businessDays(from: string, to: string) {
  if (!from || !to || from > to) return 0;
  let n = 0;
  const cur = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (cur <= end) {
    const d = cur.getUTCDay();
    if (d !== 0 && d !== 6) n++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return n;
}

const pct = (n: number | null) => (n == null || !isFinite(n) ? '—' : `${Math.round(n)}%`);

function scoreTone(s: number | null) {
  if (s == null) return 'bg-gray-100 text-gray-500';
  if (s >= 80) return 'bg-emerald-100 text-emerald-700';
  if (s >= 65) return 'bg-blue-100 text-blue-700';
  if (s >= 50) return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

function utilTone(p: number | null) {
  if (p == null) return 'text-gray-400';
  if (p >= 80) return 'text-emerald-700';
  if (p >= 55) return 'text-blue-700';
  if (p >= 30) return 'text-amber-700';
  return 'text-rose-700';
}

/** Tiny inline sparkline over a score history. */
function Spark({ vals }: { vals: number[] }) {
  if (vals.length < 2) return <span className="text-xs text-gray-300">—</span>;
  const w = 56;
  const h = 18;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals
    .map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / span) * h}`)
    .join(' ');
  const rising = vals[vals.length - 1] >= vals[0];
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline
        points={pts}
        fill="none"
        strokeWidth="1.5"
        stroke={rising ? '#059669' : '#e11d48'}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function CockpitPage() {
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ),
    [],
  );

  const { email, reviewScope, loading: accessLoading } = useAccess();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [points, setPoints] = useState<ActionPoint[]>([]);
  const [util, setUtil] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState(monthStart(-1));
  const [quick, setQuick] = useState<Emp | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const [e, r, p] = await Promise.all([
        supabase
          .from('employees')
          .select('id,name,role,dept,region,manager,type,status,active,ms_email')
          .eq('active', true),
        supabase
          .from('monthly_reviews')
          .select('id,employee_id,review_month,manager_name,composite_score,score,overall_feedback,review_template'),
        supabase.from('review_action_points').select('id,employee_id,description,priority,status,due_date'),
      ]);
      if (dead) return;
      setEmps((e.data as Emp[]) ?? []);
      setReviews((r.data as Review[]) ?? []);
      setPoints((p.data as ActionPoint[]) ?? []);
      setLoading(false);
    })();
    return () => {
      dead = true;
    };
  }, [supabase]);

  /* Billable utilisation for the selected cycle, from the timesheet API. */
  useEffect(() => {
    let dead = false;
    fetch('/api/timesheets')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: TsPayload | null) => {
        if (dead || !j) return;
        const end = monthStart(0) === cycle ? new Date().toISOString().slice(0, 10) : null;
        const monthEnd =
          end ??
          new Date(Date.UTC(Number(cycle.slice(0, 4)), Number(cycle.slice(5, 7)), 0))
            .toISOString()
            .slice(0, 10);
        const cap = businessDays(cycle, monthEnd) * 8;
        const billable = new Map<number, number>();
        for (const en of j.entries) {
          if (en[1] < cycle || en[1] > monthEnd) continue;
          if (en[4] !== 1) continue;
          billable.set(en[0], (billable.get(en[0]) ?? 0) + en[3]);
        }
        const m = new Map<string, number>();
        billable.forEach((hrs, idx) => {
          const person = j.people[idx];
          if (!person) return;
          const k = clean(person.name);
          if (k && cap > 0) m.set(k, (hrs / cap) * 100);
        });
        setUtil(m);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [cycle]);

  /* ---- who this user is responsible for ---- */
  /* Super managers and admins review anyone; managers only their own line. */
  const scope = useMemo(() => {
    if (!email || reviewScope === 'none') return [] as Emp[];
    if (reviewScope === 'all') return emps;

    const local = email.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
    const me =
      emps.find((e) => (e.ms_email ?? '').toLowerCase() === email.toLowerCase()) ??
      // Several managers have no ms_email, so fall back to matching the email
      // local-part against a name token: sudha@ -> "Sudha Raghu".
      emps.find((e) => clean(e.name).split(' ').includes(local));

    const myName =
      me?.name ??
      email.split('@')[0].split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return getReports(emps, myName);
  }, [emps, email, reviewScope]);

  /* ---- per-person roll-up ---- */
  const rows = useMemo(() => {
    const byEmp = new Map<string, Review[]>();
    for (const r of reviews) {
      const list = byEmp.get(r.employee_id) ?? [];
      list.push(r);
      byEmp.set(r.employee_id, list);
    }
    return scope
      .map((e) => {
        const hist = (byEmp.get(String(e.id)) ?? []).sort((a, b) =>
          a.review_month.localeCompare(b.review_month),
        );
        const scores = hist
          .map((h) => (h.composite_score ?? h.score))
          .filter((s): s is number => s != null)
          .map(Number);
        const thisCycle = hist.find((h) => h.review_month === cycle);
        const last = scores[scores.length - 1] ?? null;
        const prev = scores.length > 1 ? scores[scores.length - 2] : null;
        const open = points.filter(
          (p) => String(p.employee_id) === String(e.id) && p.status !== 'completed',
        );
        const overdue = open.filter((p) => p.due_date && p.due_date < new Date().toISOString().slice(0, 10));
        return {
          e,
          hist,
          scores,
          last,
          prev,
          delta: last != null && prev != null ? last - prev : null,
          reviewed: Boolean(thisCycle),
          lastReviewMonth: hist.length ? hist[hist.length - 1].review_month : null,
          open,
          overdue,
          util: util.get(clean(e.name)) ?? null,
        };
      })
      .sort((a, b) => a.e.name.localeCompare(b.e.name));
  }, [scope, reviews, points, cycle, util]);

  const owed = rows.filter((r) => !r.reviewed);
  const slipping = rows.filter((r) => r.delta != null && r.delta < 0);
  const allOverdue = rows.flatMap((r) => r.overdue.map((p) => ({ p, e: r.e })));
  const neverReviewed = rows.filter((r) => r.hist.length === 0);

  async function saveQuick(form: {
    score: number;
    went_well: string;
    to_fix: string;
    flight_risk: boolean;
  }) {
    if (!quick) return;
    const { error } = await supabase.from('monthly_reviews').insert({
      employee_id: String(quick.id),
      review_month: cycle,
      manager_name: email,
      composite_score: form.score,
      score: form.score,
      mood: form.flight_risk ? 'At risk' : 'Stable',
      overall_feedback: `Went well: ${form.went_well}\n\nTo improve: ${form.to_fix}`,
      review_template: 'quick',
      detailed_data: { quick: true, ...form },
    } as never);
    if (error) {
      setToast(`Couldn't save: ${error.message}`);
      return;
    }
    const { data } = await supabase
      .from('monthly_reviews')
      .select('id,employee_id,review_month,manager_name,composite_score,score,overall_feedback,review_template');
    setReviews((data as Review[]) ?? []);
    setQuick(null);
    setToast(`Saved ${quick.name} — ${monthLabel(cycle)}`);
    setTimeout(() => setToast(null), 4000);
  }

  if (loading || accessLoading)
    return (
      <div className="p-8 animate-pulse space-y-4">
        <div className="h-8 w-72 bg-gray-200 rounded" />
        <div className="h-28 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    );

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Cockpit</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {scope.length} {scope.length === 1 ? 'person' : 'people'} in your scope ·{' '}
            {reviewScope === 'all' ? 'everyone in the organisation' : 'your direct and indirect reports'}
          </p>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
            Review cycle
          </label>
          <select
            value={cycle}
            onChange={(ev) => setCycle(ev.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
          >
            {[0, -1, -2, -3, -4, -5].map((o) => (
              <option key={o} value={monthStart(o)}>
                {monthLabel(monthStart(o))}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ---- What needs you ---- */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Tile
          label="Reviews owed"
          value={String(owed.length)}
          sub={monthLabel(cycle)}
          tone={owed.length ? 'text-rose-600' : 'text-emerald-600'}
        />
        <Tile
          label="Trending down"
          value={String(slipping.length)}
          sub="score fell vs. last cycle"
          tone={slipping.length ? 'text-amber-600' : undefined}
        />
        <Tile
          label="Overdue actions"
          value={String(allOverdue.length)}
          sub={`${rows.reduce((s, r) => s + r.open.length, 0)} open in total`}
          tone={allOverdue.length ? 'text-rose-600' : undefined}
        />
        <Tile
          label="Never reviewed"
          value={String(neverReviewed.length)}
          sub="no review on record"
          tone={neverReviewed.length ? 'text-amber-600' : undefined}
        />
      </div>

      {toast && (
        <div className="mb-4 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2">
          {toast}
        </div>
      )}

      {/* ---- Overdue action points ---- */}
      {allOverdue.length > 0 && (
        <div className="bg-white rounded-xl border border-rose-200 overflow-hidden mb-6">
          <div className="px-4 py-3 bg-rose-50 border-b border-rose-200">
            <span className="font-semibold text-rose-800">Overdue action points</span>
            <p className="text-xs text-rose-700/80 mt-0.5">
              Raised in a previous review and past their due date.
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {allOverdue.map(({ p, e }) => (
                <tr key={p.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-gray-900 w-48">{e.name}</td>
                  <td className="px-3 py-2 text-gray-700">{p.description ?? '—'}</td>
                  <td className="px-3 py-2 text-rose-600 text-xs whitespace-nowrap w-28">due {p.due_date}</td>
                  <td className="px-3 py-2 w-28">
                    <button
                      onClick={async () => {
                        await supabase
                          .from('review_action_points')
                          .update({ status: 'completed' } as never)
                          .eq('id', p.id);
                        setPoints((prev) =>
                          prev.map((x) => (x.id === p.id ? { ...x, status: 'completed' } : x)),
                        );
                      }}
                      className="text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                    >
                      Mark done
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- The team ---- */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold">Person</th>
              <th className="px-3 py-2 font-semibold">Dept</th>
              <th className="px-3 py-2 font-semibold text-right">Billable util.</th>
              <th className="px-3 py-2 font-semibold text-right">Score</th>
              <th className="px-3 py-2 font-semibold text-right">Δ</th>
              <th className="px-3 py-2 font-semibold">Trend</th>
              <th className="px-3 py-2 font-semibold text-right">Open actions</th>
              <th className="px-3 py-2 font-semibold">{monthLabel(cycle)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.e.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{r.e.name}</div>
                  <div className="text-xs text-gray-500">{r.e.role ?? '—'}</div>
                </td>
                <td className="px-3 py-2 text-gray-600">{r.e.dept ?? '—'}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${utilTone(r.util)}`}>
                  {pct(r.util)}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${scoreTone(r.last)}`}>
                    {r.last == null ? '—' : Math.round(r.last)}
                  </span>
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums text-xs ${
                    r.delta == null ? 'text-gray-400' : r.delta < 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {r.delta == null ? '—' : `${r.delta > 0 ? '+' : ''}${Math.round(r.delta)}`}
                </td>
                <td className="px-3 py-2">
                  <Spark vals={r.scores} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {r.open.length || '—'}
                </td>
                <td className="px-3 py-2">
                  {r.reviewed ? (
                    <span className="text-xs text-emerald-700 font-medium">Reviewed</span>
                  ) : (
                    <button
                      onClick={() => setQuick(r.e)}
                      className="text-xs px-2.5 py-1 rounded-md bg-gray-900 text-white hover:bg-gray-800"
                    >
                      Quick review
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-gray-400">
                  {reviewScope === 'none'
                    ? 'Your role does not include performance reviews. Ask an admin to change it.'
                    : 'Nobody reports to you in the roster, so there is nothing to review here.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-5">
        Billable utilisation is pulled from the Zoho timesheet feed for the selected month and
        matched to the roster by name, so it is blank for anyone who does not log hours. Capacity
        assumes 8 h × Mon–Fri with no holiday or leave deduction.
      </p>

      {quick && <QuickReview emp={quick} cycle={cycle} onCancel={() => setQuick(null)} onSave={saveQuick} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone ?? 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function QuickReview({
  emp,
  cycle,
  onCancel,
  onSave,
}: {
  emp: Emp;
  cycle: string;
  onCancel: () => void;
  onSave: (f: { score: number; went_well: string; to_fix: string; flight_risk: boolean }) => void;
}) {
  const [score, setScore] = useState(70);
  const [wentWell, setWentWell] = useState('');
  const [toFix, setToFix] = useState('');
  const [risk, setRisk] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto" onClick={onCancel}>
      <div className="bg-white rounded-2xl max-w-lg w-full my-10 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{emp.name}</h2>
          <p className="text-sm text-gray-500">
            {[emp.role, emp.dept].filter(Boolean).join(' · ')} · {monthLabel(cycle)}
          </p>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-2">
              Overall score
              <span className="ml-2 text-lg font-bold tabular-nums text-blue-700">{score}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>Struggling</span>
              <span>Meeting bar</span>
              <span>Exceptional</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">One thing that went well</label>
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              rows={2}
              placeholder="Shipped the Carrier migration two days early"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1">One thing to fix</label>
            <textarea
              value={toFix}
              onChange={(e) => setToFix(e.target.value)}
              rows={2}
              placeholder="Needs to raise blockers earlier in the sprint"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={risk} onChange={(e) => setRisk(e.target.checked)} className="rounded" />
            Flight risk — worth a retention conversation
          </label>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-200">
          <button onClick={onCancel} className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={saving || (!wentWell.trim() && !toFix.trim())}
            onClick={() => {
              setSaving(true);
              onSave({ score, went_well: wentWell.trim(), to_fix: toFix.trim(), flight_risk: risk });
            }}
            className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save review'}
          </button>
        </div>
      </div>
    </div>
  );
}
