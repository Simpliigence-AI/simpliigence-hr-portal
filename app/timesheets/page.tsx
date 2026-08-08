'use client';

import { useEffect, useMemo, useState } from 'react';

/* ================================================================== */
/* Types                                                              */
/* ================================================================== */

type Person = {
  email: string;
  name: string;
  dept: string | null;
  role: string | null;
  region: string | null;
  location: string | null;
  manager: string | null;
  type: string | null;
  status: string | null;
  active: boolean | null;
  matched: boolean;
};

type Project = { name: string; category: string };

/** [personIdx, workDate, projectIdx, hours, billable, source] */
type Entry = [number, string, number, number, 0 | 1, 0 | 1];

type Payload = {
  people: Person[];
  projects: Project[];
  entries: Entry[];
  meta: {
    generatedAt: string;
    counts: Record<string, number>;
    dateRange: { min: string | null; max: string | null };
    internalError: string | null;
  };
};

/* ================================================================== */
/* Helpers                                                            */
/* ================================================================== */

const CAT_COLOR: Record<string, string> = {
  'Delivery / Project': '#2563eb',
  'Internal Meetings': '#8b5cf6',
  'Recruitment / TA': '#f59e0b',
  'HR / People Ops': '#ec4899',
  'Finance / Admin': '#14b8a6',
  'Sales / Marketing': '#f97316',
  'Internal Tooling / IT': '#0ea5e9',
  'Learning / Upskill': '#22c55e',
  'Bench / Idle': '#ef4444',
  'Leave / Holiday': '#94a3b8',
  'Other / Uncategorised': '#64748b',
};

const catColor = (c: string) => CAT_COLOR[c] ?? '#64748b';

const UTIL_BANDS: { label: string; test: (u: number) => boolean; color: string }[] = [
  { label: '85%+', test: (u) => u >= 85, color: 'bg-emerald-500' },
  { label: '60–85%', test: (u) => u >= 60 && u < 85, color: 'bg-blue-500' },
  { label: '35–60%', test: (u) => u >= 35 && u < 60, color: 'bg-amber-500' },
  { label: 'Under 35%', test: (u) => u < 35, color: 'bg-rose-500' },
];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: string, n: number) {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
}

/** Mon–Fri count between two ISO dates, inclusive. Holidays not modelled. */
function businessDays(from: string, to: string): number {
  if (!from || !to || from > to) return 0;
  const a = new Date(from + 'T00:00:00Z');
  const b = new Date(to + 'T00:00:00Z');
  const totalDays = Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
  const fullWeeks = Math.floor(totalDays / 7);
  let days = fullWeeks * 5;
  let rem = totalDays - fullWeeks * 7;
  let cur = new Date(a);
  cur.setUTCDate(cur.getUTCDate() + fullWeeks * 7);
  while (rem-- > 0) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) days++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

const monthKey = (d: string) => d.slice(0, 7);

/** ISO week bucket, keyed by the Monday of that week. */
function weekKey(d: string) {
  const x = new Date(d + 'T00:00:00Z');
  const dow = (x.getUTCDay() + 6) % 7; // Mon = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return iso(x);
}

const h1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString();
const pctS = (n: number | null) => (n == null || !isFinite(n) ? '—' : `${Math.round(n)}%`);

function utilTone(p: number | null) {
  if (p == null) return 'bg-gray-100 text-gray-500';
  if (p >= 85) return 'bg-emerald-100 text-emerald-700';
  if (p >= 60) return 'bg-blue-100 text-blue-700';
  if (p >= 35) return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}

function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ================================================================== */
/* Small presentational pieces                                        */
/* ================================================================== */

function Kpi({
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

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(1, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

function SortTh({
  label,
  col,
  sort,
  setSort,
  align = 'left',
}: {
  label: string;
  col: string;
  sort: { col: string; dir: 1 | -1 };
  setSort: (s: { col: string; dir: 1 | -1 }) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.col === col;
  return (
    <th
      onClick={() => setSort({ col, dir: active && sort.dir === -1 ? 1 : -1 })}
      className={`px-3 py-2 font-semibold cursor-pointer select-none whitespace-nowrap hover:text-gray-900 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${active ? 'text-gray-900' : 'text-gray-500'}`}
    >
      {label}
      <span className="ml-1 text-[10px]">{active ? (sort.dir === -1 ? '▼' : '▲') : ''}</span>
    </th>
  );
}

/* ================================================================== */
/* Page                                                               */
/* ================================================================== */

export default function TimesheetsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ---- filters ----
  const [preset, setPreset] = useState('90d');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [region, setRegion] = useState('all');
  const [dept, setDept] = useState('all');
  const [billFilter, setBillFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const [personQ, setPersonQ] = useState('');
  const [projectQ, setProjectQ] = useState('');
  const [effWindow, setEffWindow] = useState(false);
  const [threshold, setThreshold] = useState(60);
  const [tab, setTab] = useState<'overview' | 'people' | 'projects' | 'heatmap' | 'diag' | 'raw'>(
    'overview',
  );
  const [drill, setDrill] = useState<number | null>(null);
  const [sortPeople, setSortPeople] = useState<{ col: string; dir: 1 | -1 }>({
    col: 'util',
    dir: 1,
  });
  const [sortProj, setSortProj] = useState<{ col: string; dir: 1 | -1 }>({ col: 'hours', dir: -1 });

  useEffect(() => {
    let dead = false;
    fetch('/api/timesheets')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j as Payload;
      })
      .then((j) => {
        if (dead) return;
        setData(j);
        setLoading(false);
      })
      .catch((e) => {
        if (dead) return;
        setErr(e.message);
        setLoading(false);
      });
    return () => {
      dead = true;
    };
  }, []);

  /* ---- resolve the active date window ---- */
  const [from, to] = useMemo(() => {
    const max = data?.meta.dateRange.max ?? iso(new Date());
    const min = data?.meta.dateRange.min ?? '2026-01-01';
    switch (preset) {
      case '30d':
        return [addDays(max, -29), max];
      case '90d':
        return [addDays(max, -89), max];
      case 'month':
        return [max.slice(0, 8) + '01', max];
      case 'lastmonth': {
        const first = max.slice(0, 8) + '01';
        const lastMonthEnd = addDays(first, -1);
        return [lastMonthEnd.slice(0, 8) + '01', lastMonthEnd];
      }
      case 'ytd':
        return [max.slice(0, 4) + '-01-01', max];
      case 'all':
        return [min, max];
      case 'custom':
        return [cFrom || min, cTo || max];
      default:
        return [min, max];
    }
  }, [preset, cFrom, cTo, data]);

  /* ---- option lists ---- */
  const regions = useMemo(() => {
    const s = new Set<string>();
    data?.people.forEach((p) => p.region && s.add(p.region));
    return Array.from(s).sort();
  }, [data]);

  const depts = useMemo(() => {
    const s = new Set<string>();
    data?.people.forEach((p) => p.dept && s.add(p.dept));
    return Array.from(s).sort();
  }, [data]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    data?.projects.forEach((p) => s.add(p.category));
    return Array.from(s).sort();
  }, [data]);

  /* ---- does a person pass the person-level filters? ---- */
  const personPass = useMemo(() => {
    if (!data) return [] as boolean[];
    const q = personQ.trim().toLowerCase();
    return data.people.map((p) => {
      if (region !== 'all' && (p.region ?? '') !== region) return false;
      if (dept !== 'all' && (p.dept ?? '') !== dept) return false;
      if (q && !`${p.name} ${p.email} ${p.role ?? ''} ${p.manager ?? ''}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [data, region, dept, personQ]);

  const projectPass = useMemo(() => {
    if (!data) return [] as boolean[];
    const q = projectQ.trim().toLowerCase();
    return data.projects.map((pr) => {
      if (category !== 'all' && pr.category !== category) return false;
      if (q && !pr.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, category, projectQ]);

  /* ---- the filtered fact table ---- */
  const rows = useMemo(() => {
    if (!data) return [] as Entry[];
    return data.entries.filter((e) => {
      if (e[1] < from || e[1] > to) return false;
      if (!personPass[e[0]]) return false;
      if (!projectPass[e[2]]) return false;
      if (billFilter === 'billable' && e[4] !== 1) return false;
      if (billFilter === 'nonbillable' && e[4] !== 0) return false;
      return true;
    });
  }, [data, from, to, personPass, projectPass, billFilter]);

  /* ---- per-person aggregation ---- */
  const perPerson = useMemo(() => {
    if (!data) return [];
    type Agg = {
      idx: number;
      p: Person;
      hours: number;
      billable: number;
      days: Set<string>;
      projects: Set<number>;
      first: string;
      last: string;
      byCat: Record<string, number>;
    };
    const m = new Map<number, Agg>();
    for (const e of rows) {
      let a = m.get(e[0]);
      if (!a) {
        a = {
          idx: e[0],
          p: data.people[e[0]],
          hours: 0,
          billable: 0,
          days: new Set(),
          projects: new Set(),
          first: e[1],
          last: e[1],
          byCat: {},
        };
        m.set(e[0], a);
      }
      a.hours += e[3];
      if (e[4]) a.billable += e[3];
      a.days.add(e[1]);
      a.projects.add(e[2]);
      if (e[1] < a.first) a.first = e[1];
      if (e[1] > a.last) a.last = e[1];
      const cat = data.projects[e[2]].category;
      a.byCat[cat] = (a.byCat[cat] ?? 0) + e[3];
    }

    const rangeCap = businessDays(from, to) * 8;

    return Array.from(m.values()).map((a) => {
      const cap = effWindow ? businessDays(a.first, a.last) * 8 : rangeCap;
      return {
        ...a,
        capacity: cap,
        util: cap > 0 ? (a.hours / cap) * 100 : null,
        billUtil: cap > 0 ? (a.billable / cap) * 100 : null,
        billMix: a.hours > 0 ? (a.billable / a.hours) * 100 : null,
        gap: Math.max(0, cap - a.hours),
      };
    });
  }, [rows, data, from, to, effWindow]);

  /* ---- people who pass filters but logged nothing ---- */
  const nonReporters = useMemo(() => {
    if (!data) return [];
    const logged = new Set(perPerson.map((a) => a.idx));
    return data.people
      .map((p, i) => ({ p, i }))
      .filter(
        ({ p, i }) => personPass[i] && !logged.has(i) && p.active !== false && p.matched,
      );
  }, [data, perPerson, personPass]);

  /* ---- per-project aggregation ---- */
  const perProject = useMemo(() => {
    if (!data) return [];
    const m = new Map<
      number,
      { idx: number; pr: Project; hours: number; billable: number; people: Set<number> }
    >();
    for (const e of rows) {
      let a = m.get(e[2]);
      if (!a) {
        a = { idx: e[2], pr: data.projects[e[2]], hours: 0, billable: 0, people: new Set() };
        m.set(e[2], a);
      }
      a.hours += e[3];
      if (e[4]) a.billable += e[3];
      a.people.add(e[0]);
    }
    return Array.from(m.values());
  }, [rows, data]);

  /* ---- totals ---- */
  const totals = useMemo(() => {
    let hours = 0;
    let billable = 0;
    for (const e of rows) {
      hours += e[3];
      if (e[4]) billable += e[3];
    }
    const cap = perPerson.reduce((s, a) => s + a.capacity, 0);
    return {
      hours,
      billable,
      nonbillable: hours - billable,
      mix: hours > 0 ? (billable / hours) * 100 : 0,
      util: cap > 0 ? (hours / cap) * 100 : 0,
      billUtil: cap > 0 ? (billable / cap) * 100 : 0,
      people: perPerson.length,
      capacity: cap,
      bizDays: businessDays(from, to),
    };
  }, [rows, perPerson, from, to]);

  /* ---- weekly trend ---- */
  const trend = useMemo(() => {
    const m = new Map<string, { b: number; n: number }>();
    for (const e of rows) {
      const k = weekKey(e[1]);
      const a = m.get(k) ?? { b: 0, n: 0 };
      if (e[4]) a.b += e[3];
      else a.n += e[3];
      m.set(k, a);
    }
    return Array.from(m.entries()).sort((x, y) => x[0].localeCompare(y[0]));
  }, [rows]);

  /* ---- category split ---- */
  const byCategory = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, number>();
    for (const e of rows) {
      const c = data.projects[e[2]].category;
      m.set(c, (m.get(c) ?? 0) + e[3]);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows, data]);

  /* ---- months present, for the heatmap ---- */
  const months = useMemo(() => {
    const s = new Set<string>();
    for (const e of rows) s.add(monthKey(e[1]));
    return Array.from(s).sort();
  }, [rows]);

  const heat = useMemo(() => {
    if (!data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const e of rows) {
      const k = `${e[0]}|${monthKey(e[1])}`;
      m.set(k, (m.get(k) ?? 0) + e[3]);
    }
    return m;
  }, [rows, data]);

  const monthCap = useMemo(() => {
    const m = new Map<string, number>();
    for (const mo of months) {
      const first = `${mo}-01`;
      // Day 0 of the *next* month is the last day of this one.
      const daysInMonth = new Date(Date.UTC(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)), 0))
        .getUTCDate();
      const lastDay = addDays(first, daysInMonth - 1);
      const lo = first < from ? from : first;
      const hi = lastDay > to ? to : lastDay;
      m.set(mo, businessDays(lo, hi) * 8);
    }
    return m;
  }, [months, from, to]);

  /* ---- diagnostics ---- */
  const diag = useMemo(() => {
    const under = perPerson
      .filter((a) => a.billUtil != null && a.billUtil < threshold && a.p.active !== false)
      .sort((a, b) => (a.billUtil ?? 0) - (b.billUtil ?? 0));

    const highNonBill = perPerson
      .filter((a) => a.hours >= 20 && a.billMix != null && a.billMix < 100 - threshold)
      .sort((a, b) => (a.billMix ?? 0) - (b.billMix ?? 0));

    const rosterMismatch = perPerson.filter((a) => {
      const st = (a.p.status ?? '').toLowerCase();
      return a.hours > 0 && (st.includes('ex-') || st.includes('bench') || a.p.active === false);
    });

    return { under, highNonBill, rosterMismatch, nonReporters };
  }, [perPerson, threshold, nonReporters]);

  /* ---- sorting ---- */
  const peopleSorted = useMemo(() => {
    const get = (a: (typeof perPerson)[number]) => {
      switch (sortPeople.col) {
        case 'name':
          return a.p.name.toLowerCase();
        case 'dept':
          return (a.p.dept ?? '').toLowerCase();
        case 'region':
          return (a.p.region ?? '').toLowerCase();
        case 'hours':
          return a.hours;
        case 'billable':
          return a.billable;
        case 'mix':
          return a.billMix ?? -1;
        case 'days':
          return a.days.size;
        case 'projects':
          return a.projects.size;
        case 'gap':
          return a.gap;
        case 'last':
          return a.last;
        default:
          return a.billUtil ?? -1;
      }
    };
    return [...perPerson].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (typeof x === 'string' || typeof y === 'string')
        return String(x).localeCompare(String(y)) * -sortPeople.dir;
      return (Number(x) - Number(y)) * -sortPeople.dir;
    });
  }, [perPerson, sortPeople]);

  const projSorted = useMemo(() => {
    const get = (a: (typeof perProject)[number]) => {
      switch (sortProj.col) {
        case 'name':
          return a.pr.name.toLowerCase();
        case 'category':
          return a.pr.category.toLowerCase();
        case 'people':
          return a.people.size;
        case 'billable':
          return a.billable;
        default:
          return a.hours;
      }
    };
    return [...perProject].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (typeof x === 'string' || typeof y === 'string')
        return String(x).localeCompare(String(y)) * -sortProj.dir;
      return (Number(x) - Number(y)) * -sortProj.dir;
    });
  }, [perProject, sortProj]);

  /* ---- drilldown detail ---- */
  const drillData = useMemo(() => {
    if (drill == null || !data) return null;
    const p = data.people[drill];
    const es = rows.filter((e) => e[0] === drill);
    const byProj = new Map<number, { hours: number; billable: number }>();
    const byMonth = new Map<string, number>();
    let hours = 0;
    let billable = 0;
    for (const e of es) {
      hours += e[3];
      if (e[4]) billable += e[3];
      const a = byProj.get(e[2]) ?? { hours: 0, billable: 0 };
      a.hours += e[3];
      if (e[4]) a.billable += e[3];
      byProj.set(e[2], a);
      const mk = monthKey(e[1]);
      byMonth.set(mk, (byMonth.get(mk) ?? 0) + e[3]);
    }
    const agg = perPerson.find((a) => a.idx === drill);
    return {
      p,
      hours,
      billable,
      agg,
      projects: Array.from(byProj.entries()).sort((a, b) => b[1].hours - a[1].hours),
      months: Array.from(byMonth.entries()).sort(),
    };
  }, [drill, rows, data, perPerson]);

  /* ================================================================ */
  /* Render                                                           */
  /* ================================================================ */

  if (loading)
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-24 bg-gray-100 rounded-xl" />
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
        <p className="text-sm text-gray-500 mt-4">Loading timesheet data…</p>
      </div>
    );

  if (err)
    return (
      <div className="p-8">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-5">
          <div className="font-semibold text-rose-800">Couldn&apos;t load timesheet data</div>
          <div className="text-sm text-rose-700 mt-1 font-mono">{err}</div>
        </div>
      </div>
    );

  if (!data) return null;

  const maxWeek = Math.max(1, ...trend.map(([, v]) => v.b + v.n));
  const maxProjHours = Math.max(1, ...perProject.map((p) => p.hours));

  return (
    <div className="p-6 max-w-[1600px]">
      {/* ---------- Header ---------- */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheet Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data.meta.counts.entries.toLocaleString()} entries ·{' '}
            {data.meta.dateRange.min} → {data.meta.dateRange.max} ·{' '}
            {data.meta.counts.people} people
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              downloadCsv(`timesheet-people-${from}_${to}.csv`, [
                [
                  'Name','Email','Dept','Role','Region','Manager','Status','Hours','Billable hrs',
                  'Non-billable hrs','Billable mix %','Capacity hrs','Utilisation %',
                  'Billable utilisation %','Gap hrs','Days logged','Projects','First','Last',
                ],
                ...peopleSorted.map((a) => [
                  a.p.name, a.p.email, a.p.dept, a.p.role, a.p.region, a.p.manager, a.p.status,
                  h1(a.hours), h1(a.billable), h1(a.hours - a.billable),
                  a.billMix == null ? '' : Math.round(a.billMix),
                  h1(a.capacity),
                  a.util == null ? '' : Math.round(a.util),
                  a.billUtil == null ? '' : Math.round(a.billUtil),
                  h1(a.gap), a.days.size, a.projects.size, a.first, a.last,
                ]),
              ])
            }
            className="px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            ⬇ Export people
          </button>
          <button
            onClick={() => location.reload()}
            className="px-3 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {data.meta.internalError && (
        <div className="mb-4 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          {data.meta.internalError}
        </div>
      )}

      {/* ---------- Filters ---------- */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Period
            </label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
            >
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="month">This month</option>
              <option value="lastmonth">Last month</option>
              <option value="ytd">Year to date</option>
              <option value="all">All time</option>
              <option value="custom">Custom…</option>
            </select>
          </div>

          {preset === 'custom' && (
            <>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
                  From
                </label>
                <input
                  type="date"
                  value={cFrom || from}
                  onChange={(e) => setCFrom(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
                  To
                </label>
                <input
                  type="date"
                  value={cTo || to}
                  onChange={(e) => setCTo(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Region
            </label>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
            >
              <option value="all">All regions</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Department
            </label>
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
            >
              <option value="all">All departments</option>
              {depts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Billing
            </label>
            <select
              value={billFilter}
              onChange={(e) => setBillFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
            >
              <option value="all">All hours</option>
              <option value="billable">Billable only</option>
              <option value="nonbillable">Non-billable only</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Work type
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
            >
              <option value="all">All work types</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Person
            </label>
            <input
              value={personQ}
              onChange={(e) => setPersonQ(e.target.value)}
              placeholder="name, email, manager…"
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm w-44"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Project
            </label>
            <input
              value={projectQ}
              onChange={(e) => setProjectQ(e.target.value)}
              placeholder="project contains…"
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm w-44"
            />
          </div>

          <button
            onClick={() => {
              setPreset('90d'); setCFrom(''); setCTo(''); setRegion('all'); setDept('all');
              setBillFilter('all'); setCategory('all'); setPersonQ(''); setProjectQ('');
            }}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600"
          >
            Reset
          </button>
        </div>

        <div className="flex flex-wrap gap-5 items-center mt-3 pt-3 border-t border-gray-100">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={effWindow}
              onChange={(e) => setEffWindow(e.target.checked)}
              className="rounded"
            />
            Capacity from each person&apos;s own first→last logged day
            <span className="text-xs text-gray-400">(fairer for mid-period joiners/leavers)</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            Under-utilisation threshold
            <input
              type="range"
              min={20}
              max={95}
              step={5}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-36"
            />
            <span className="font-semibold tabular-nums w-10">{threshold}%</span>
          </label>

          <div className="text-xs text-gray-500 ml-auto">
            Window <span className="font-semibold text-gray-700">{from} → {to}</span> ·{' '}
            {totals.bizDays} business days · capacity {h1(totals.bizDays * 8)} h/person
          </div>
        </div>
      </div>

      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <Kpi label="Total hours" value={h1(totals.hours)} sub={`${rows.length.toLocaleString()} entries`} />
        <Kpi label="Billable hours" value={h1(totals.billable)} sub={`${pctS(totals.mix)} of logged`} tone="text-emerald-600" />
        <Kpi label="Non-billable" value={h1(totals.nonbillable)} sub={`${pctS(100 - totals.mix)} of logged`} tone="text-amber-600" />
        <Kpi label="Utilisation" value={pctS(totals.util)} sub="logged ÷ capacity"
          tone={totals.util >= 85 ? 'text-emerald-600' : totals.util >= 60 ? 'text-blue-600' : 'text-rose-600'} />
        <Kpi label="Billable util." value={pctS(totals.billUtil)} sub="billable ÷ capacity"
          tone={totals.billUtil >= 70 ? 'text-emerald-600' : 'text-rose-600'} />
        <Kpi label="People reporting" value={String(totals.people)} sub={`${nonReporters.length} logged nothing`}
          tone={nonReporters.length > 0 ? 'text-amber-600' : undefined} />
      </div>

      {/* ---------- Tabs ---------- */}
      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto">
        {([
          ['overview', 'Overview'],
          ['people', `By Person (${perPerson.length})`],
          ['projects', `By Project (${perProject.length})`],
          ['heatmap', 'Utilisation Heatmap'],
          ['diag', `Diagnostics (${diag.under.length + diag.nonReporters.length})`],
          ['raw', `Raw Entries (${rows.length})`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as typeof tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ================= OVERVIEW ================= */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* weekly trend */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-semibold text-gray-900">Hours per week</h2>
              <div className="flex gap-3 text-xs text-gray-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-blue-600 inline-block" /> Billable
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> Non-billable
                </span>
              </div>
            </div>
            {trend.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No entries in this window.</p>
            ) : (
              <div className="flex items-end gap-1 h-52">
                {trend.map(([wk, v]) => {
                  const total = v.b + v.n;
                  const hb = (v.b / maxWeek) * 100;
                  const hn = (v.n / maxWeek) * 100;
                  return (
                    <div key={wk} className="flex-1 min-w-[6px] group relative flex flex-col justify-end h-full">
                      <div className="w-full bg-amber-400 rounded-t-sm" style={{ height: `${hn}%` }} />
                      <div className="w-full bg-blue-600" style={{ height: `${hb}%`, borderRadius: hn === 0 ? '2px 2px 0 0' : 0 }} />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 bg-gray-900 text-white text-[11px] rounded px-2 py-1 whitespace-nowrap">
                        w/c {wk} · {h1(total)} h · {h1(v.b)} billable
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>{trend[0]?.[0]}</span>
              <span>{trend[trend.length - 1]?.[0]}</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* work type split */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Where the hours go</h2>
              <div className="space-y-2">
                {byCategory.map(([cat, hrs]) => (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <button
                        onClick={() => { setCategory(cat); setTab('projects'); }}
                        className="text-gray-700 hover:text-blue-700 hover:underline text-left"
                      >
                        {cat}
                      </button>
                      <span className="text-gray-500 tabular-nums">
                        {h1(hrs)} h · {pctS((hrs / totals.hours) * 100)}
                      </span>
                    </div>
                    <Bar value={hrs} max={totals.hours} color={catColor(cat)} />
                  </div>
                ))}
                {byCategory.length === 0 && (
                  <p className="text-sm text-gray-400 py-4">Nothing matches these filters.</p>
                )}
              </div>
            </div>

            {/* utilisation distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Billable utilisation spread</h2>
              <div className="space-y-2">
                {UTIL_BANDS.map(({ label, test, color }) => {
                  const list = perPerson.filter((a) => a.billUtil != null && test(a.billUtil));
                  const w = perPerson.length ? (list.length / perPerson.length) * 100 : 0;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700">{label}</span>
                        <span className="text-gray-500 tabular-nums">
                          {list.length} {list.length === 1 ? 'person' : 'people'}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 text-sm text-gray-600">
                <div className="flex justify-between py-0.5">
                  <span>Total capacity in window</span>
                  <span className="tabular-nums font-medium">{h1(totals.capacity)} h</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span>Unfilled capacity</span>
                  <span className="tabular-nums font-medium text-rose-600">
                    {h1(Math.max(0, totals.capacity - totals.hours))} h
                  </span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span>Non-billable drag</span>
                  <span className="tabular-nums font-medium text-amber-600">{h1(totals.nonbillable)} h</span>
                </div>
              </div>
            </div>
          </div>

          {/* top / bottom people */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Most billable</h2>
              <TopList
                list={[...perPerson].sort((a, b) => b.billable - a.billable).slice(0, 8)}
                metric={(a) => `${h1(a.billable)} h · ${pctS(a.billUtil)}`}
                max={Math.max(1, ...perPerson.map((a) => a.billable))}
                value={(a) => a.billable}
                color="#2563eb"
                onClick={setDrill}
              />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Lowest billable utilisation</h2>
              <TopList
                list={[...perPerson]
                  .filter((a) => a.p.active !== false)
                  .sort((a, b) => (a.billUtil ?? 0) - (b.billUtil ?? 0))
                  .slice(0, 8)}
                metric={(a) => `${pctS(a.billUtil)} · ${h1(a.hours)} h logged`}
                max={100}
                value={(a) => a.billUtil ?? 0}
                color="#ef4444"
                onClick={setDrill}
              />
            </div>
          </div>
        </div>
      )}

      {/* ================= PEOPLE ================= */}
      {tab === 'people' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <SortTh label="Person" col="name" sort={sortPeople} setSort={setSortPeople} />
                <SortTh label="Dept" col="dept" sort={sortPeople} setSort={setSortPeople} />
                <SortTh label="Region" col="region" sort={sortPeople} setSort={setSortPeople} />
                <SortTh label="Hours" col="hours" sort={sortPeople} setSort={setSortPeople} align="right" />
                <SortTh label="Billable" col="billable" sort={sortPeople} setSort={setSortPeople} align="right" />
                <SortTh label="Mix %" col="mix" sort={sortPeople} setSort={setSortPeople} align="right" />
                <SortTh label="Bill. util." col="util" sort={sortPeople} setSort={setSortPeople} align="right" />
                <SortTh label="Gap h" col="gap" sort={sortPeople} setSort={setSortPeople} align="right" />
                <SortTh label="Days" col="days" sort={sortPeople} setSort={setSortPeople} align="right" />
                <SortTh label="Projects" col="projects" sort={sortPeople} setSort={setSortPeople} align="right" />
                <SortTh label="Last logged" col="last" sort={sortPeople} setSort={setSortPeople} />
              </tr>
            </thead>
            <tbody>
              {peopleSorted.map((a) => (
                <tr key={a.idx} onClick={() => setDrill(a.idx)} className="border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{a.p.name}</div>
                    <div className="text-xs text-gray-500">{a.p.role ?? a.p.email}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{a.p.dept ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{a.p.region ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{h1(a.hours)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{h1(a.billable)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{pctS(a.billMix)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${utilTone(a.billUtil)}`}>
                      {pctS(a.billUtil)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-rose-600">{h1(a.gap)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{a.days.size}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{a.projects.size}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{a.last}</td>
                </tr>
              ))}
              {peopleSorted.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-gray-400">Nobody matches these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ================= PROJECTS ================= */}
      {tab === 'projects' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <SortTh label="Project / task" col="name" sort={sortProj} setSort={setSortProj} />
                <SortTh label="Work type" col="category" sort={sortProj} setSort={setSortProj} />
                <SortTh label="People" col="people" sort={sortProj} setSort={setSortProj} align="right" />
                <SortTh label="Hours" col="hours" sort={sortProj} setSort={setSortProj} align="right" />
                <SortTh label="Billable" col="billable" sort={sortProj} setSort={setSortProj} align="right" />
                <th className="px-3 py-2 text-left font-semibold text-gray-500 w-52">Share</th>
              </tr>
            </thead>
            <tbody>
              {projSorted.map((a) => (
                <tr key={a.idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900 max-w-md truncate" title={a.pr.name}>{a.pr.name}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium text-white" style={{ background: catColor(a.pr.category) }}>
                      {a.pr.category}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">{a.people.size}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{h1(a.hours)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{h1(a.billable)}</td>
                  <td className="px-3 py-2"><Bar value={a.hours} max={maxProjHours} color={catColor(a.pr.category)} /></td>
                </tr>
              ))}
              {projSorted.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400">No projects match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ================= HEATMAP ================= */}
      {tab === 'heatmap' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Utilisation by person and month</h2>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>0%</span>
              {[0.1, 0.3, 0.5, 0.7, 0.9, 1].map((o) => (
                <span key={o} className="w-6 h-4 rounded-sm inline-block" style={{ background: `rgba(37,99,235,${o})` }} />
              ))}
              <span>100%+</span>
            </div>
          </div>
          <table className="text-sm border-separate" style={{ borderSpacing: '2px' }}>
            <thead>
              <tr>
                <th className="text-left px-2 py-1 font-semibold text-gray-500 sticky left-0 bg-white">Person</th>
                {months.map((m) => (
                  <th key={m} className="px-1 py-1 font-semibold text-gray-500 text-xs w-16">
                    {m.slice(5)}/{m.slice(2, 4)}
                  </th>
                ))}
                <th className="px-2 py-1 font-semibold text-gray-500 text-xs">Avg</th>
              </tr>
            </thead>
            <tbody>
              {peopleSorted.map((a) => {
                const cells = months.map((m) => {
                  const hrs = heat.get(`${a.idx}|${m}`) ?? 0;
                  const cap = monthCap.get(m) ?? 0;
                  return cap > 0 ? (hrs / cap) * 100 : null;
                });
                const present = cells.filter((c): c is number => c != null && c > 0);
                const avg = present.length ? present.reduce((s, c) => s + c, 0) / present.length : 0;
                return (
                  <tr key={a.idx}>
                    <td
                      onClick={() => setDrill(a.idx)}
                      className="px-2 py-1 whitespace-nowrap text-gray-800 sticky left-0 bg-white cursor-pointer hover:text-blue-700 max-w-[180px] truncate"
                      title={a.p.name}
                    >
                      {a.p.name}
                    </td>
                    {cells.map((c, i) => (
                      <td
                        key={months[i]}
                        className="text-center text-[11px] tabular-nums rounded-sm"
                        style={{
                          background: c == null || c === 0 ? '#f3f4f6' : `rgba(37,99,235,${Math.min(1, c / 100) * 0.9 + 0.1})`,
                          color: c != null && c > 55 ? 'white' : '#374151',
                        }}
                        title={`${a.p.name} · ${months[i]} · ${pctS(c)}`}
                      >
                        {c == null || c === 0 ? '' : Math.round(c)}
                      </td>
                    ))}
                    <td className="px-2 text-center text-[11px] tabular-nums font-semibold text-gray-700">{pctS(avg)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-3">
            Cell = total logged hours ÷ (business days in that month × 8). Blank means no hours logged that month.
          </p>
        </div>
      )}

      {/* ================= DIAGNOSTICS ================= */}
      {tab === 'diag' && (
        <div className="space-y-4">
          <DiagCard
            title={`Under-utilised — billable utilisation below ${threshold}%`}
            desc="Active people whose billable hours don't fill their capacity. The gap column is the shortfall in hours."
            tone="rose"
            count={diag.under.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-y border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2 font-semibold">Person</th>
                  <th className="px-3 py-2 font-semibold">Dept</th>
                  <th className="px-3 py-2 font-semibold text-right">Bill. util.</th>
                  <th className="px-3 py-2 font-semibold text-right">Billable h</th>
                  <th className="px-3 py-2 font-semibold text-right">Total h</th>
                  <th className="px-3 py-2 font-semibold text-right">Gap h</th>
                  <th className="px-3 py-2 font-semibold">Biggest non-billable bucket</th>
                </tr>
              </thead>
              <tbody>
                {diag.under.map((a) => {
                  const top = Object.entries(a.byCat)
                    .filter(([c]) => c !== 'Delivery / Project')
                    .sort((x, y) => y[1] - x[1])[0];
                  return (
                    <tr key={a.idx} onClick={() => setDrill(a.idx)} className="border-b border-gray-100 hover:bg-rose-50/40 cursor-pointer">
                      <td className="px-3 py-2 font-medium text-gray-900">{a.p.name}</td>
                      <td className="px-3 py-2 text-gray-600">{a.p.dept ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${utilTone(a.billUtil)}`}>{pctS(a.billUtil)}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{h1(a.billable)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{h1(a.hours)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-rose-600 font-medium">{h1(a.gap)}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{top ? `${top[0]} · ${h1(top[1])} h` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DiagCard>

          <DiagCard
            title="No timesheet at all in this window"
            desc="Active employees on the HR roster with zero logged hours. Either genuinely idle, or not submitting."
            tone="amber"
            count={diag.nonReporters.length}
          >
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
              {diag.nonReporters.map(({ p, i }) => (
                <div key={i} className="border border-gray-200 rounded-lg px-3 py-2">
                  <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                  <div className="text-xs text-gray-500">
                    {[p.role, p.dept, p.region].filter(Boolean).join(' · ') || p.email || '—'}
                  </div>
                  {p.manager && <div className="text-xs text-gray-400 mt-0.5">Reports to {p.manager}</div>}
                </div>
              ))}
              {diag.nonReporters.length === 0 && (
                <p className="text-sm text-gray-400 py-4 col-span-full text-center">
                  Everyone matching these filters logged something.
                </p>
              )}
            </div>
          </DiagCard>

          <DiagCard
            title={`Heavy non-billable load — over ${100 - threshold}% of logged time`}
            desc="People who are busy but not on billable work. Worth checking whether the work is genuinely internal or just mis-tagged."
            tone="amber"
            count={diag.highNonBill.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-y border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2 font-semibold">Person</th>
                  <th className="px-3 py-2 font-semibold">Dept</th>
                  <th className="px-3 py-2 font-semibold text-right">Total h</th>
                  <th className="px-3 py-2 font-semibold text-right">Non-billable h</th>
                  <th className="px-3 py-2 font-semibold text-right">Billable mix</th>
                  <th className="px-3 py-2 font-semibold">Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {diag.highNonBill.map((a) => (
                  <tr key={a.idx} onClick={() => setDrill(a.idx)} className="border-b border-gray-100 hover:bg-amber-50/40 cursor-pointer">
                    <td className="px-3 py-2 font-medium text-gray-900">{a.p.name}</td>
                    <td className="px-3 py-2 text-gray-600">{a.p.dept ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h1(a.hours)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">{h1(a.hours - a.billable)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pctS(a.billMix)}</td>
                    <td className="px-3 py-2">
                      <div className="flex h-3 rounded-sm overflow-hidden w-48">
                        {Object.entries(a.byCat)
                          .sort((x, y) => y[1] - x[1])
                          .map(([c, v]) => (
                            <div key={c} title={`${c}: ${h1(v)} h`} style={{ width: `${(v / a.hours) * 100}%`, background: catColor(c) }} />
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DiagCard>

          <DiagCard
            title="Roster / timesheet contradiction"
            desc="People logging hours while the HR roster marks them inactive, ex-employee or on bench. One of the two records is wrong."
            tone="violet"
            count={diag.rosterMismatch.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-y border-gray-200">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2 font-semibold">Person</th>
                  <th className="px-3 py-2 font-semibold">HR status</th>
                  <th className="px-3 py-2 font-semibold">Active flag</th>
                  <th className="px-3 py-2 font-semibold text-right">Hours logged</th>
                  <th className="px-3 py-2 font-semibold">Last logged</th>
                </tr>
              </thead>
              <tbody>
                {diag.rosterMismatch.map((a) => (
                  <tr key={a.idx} onClick={() => setDrill(a.idx)} className="border-b border-gray-100 hover:bg-violet-50/40 cursor-pointer">
                    <td className="px-3 py-2 font-medium text-gray-900">{a.p.name}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-md text-xs bg-violet-100 text-violet-700 font-medium">{a.p.status ?? '—'}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{a.p.active === false ? 'Inactive' : 'Active'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{h1(a.hours)}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{a.last}</td>
                  </tr>
                ))}
                {diag.rosterMismatch.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No contradictions in this window.</td></tr>
                )}
              </tbody>
            </table>
          </DiagCard>
        </div>
      )}

      {/* ================= RAW ================= */}
      {tab === 'raw' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
            <div className="text-sm text-gray-600">
              Showing first 500 of {rows.length.toLocaleString()} entries
            </div>
            <button
              onClick={() =>
                downloadCsv(`timesheet-entries-${from}_${to}.csv`, [
                  ['Date', 'Person', 'Email', 'Dept', 'Region', 'Project', 'Work type', 'Hours', 'Billable', 'Source'],
                  ...rows.map((e) => [
                    e[1],
                    data.people[e[0]].name,
                    data.people[e[0]].email,
                    data.people[e[0]].dept,
                    data.people[e[0]].region,
                    data.projects[e[2]].name,
                    data.projects[e[2]].category,
                    e[3],
                    e[4] ? 'Billable' : 'Non-billable',
                    e[5] ? 'Internal' : 'Zoho',
                  ]),
                ])
              }
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              ⬇ Export all {rows.length.toLocaleString()} rows
            </button>
          </div>
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Person</th>
                  <th className="px-3 py-2 font-semibold">Project / task</th>
                  <th className="px-3 py-2 font-semibold">Work type</th>
                  <th className="px-3 py-2 font-semibold text-right">Hours</th>
                  <th className="px-3 py-2 font-semibold">Billing</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice()
                  .sort((a, b) => b[1].localeCompare(a[1]))
                  .slice(0, 500)
                  .map((e, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{e[1]}</td>
                      <td className="px-3 py-1.5 text-gray-900">{data.people[e[0]].name}</td>
                      <td className="px-3 py-1.5 text-gray-700 max-w-sm truncate" title={data.projects[e[2]].name}>
                        {data.projects[e[2]].name}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] text-white" style={{ background: catColor(data.projects[e[2]].category) }}>
                          {data.projects[e[2]].category}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{e[3]}</td>
                      <td className="px-3 py-1.5">
                        <span className={`text-xs font-medium ${e[4] ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {e[4] ? 'Billable' : 'Non-billable'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= DRILLDOWN ================= */}
      {drillData && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-6 overflow-y-auto" onClick={() => setDrill(null)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full my-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start p-5 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{drillData.p.name}</h2>
                <p className="text-sm text-gray-500">
                  {[drillData.p.role, drillData.p.dept, drillData.p.region, drillData.p.email].filter(Boolean).join(' · ')}
                </p>
                {drillData.p.manager && <p className="text-xs text-gray-400 mt-0.5">Reports to {drillData.p.manager}</p>}
              </div>
              <button onClick={() => setDrill(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-4 gap-3">
                <Kpi label="Hours" value={h1(drillData.hours)} />
                <Kpi label="Billable" value={h1(drillData.billable)} tone="text-emerald-600" />
                <Kpi label="Bill. util." value={pctS(drillData.agg?.billUtil ?? null)} />
                <Kpi label="Gap" value={`${h1(drillData.agg?.gap ?? 0)} h`} tone="text-rose-600" />
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2 text-sm">Monthly hours</h3>
                <div className="flex items-end gap-2 h-28">
                  {drillData.months.map(([m, v]) => {
                    const mx = Math.max(...drillData.months.map(([, x]) => x));
                    return (
                      <div key={m} className="flex-1 flex flex-col items-center gap-1">
                        <div className="text-[10px] text-gray-500 tabular-nums">{h1(v)}</div>
                        <div className="w-full bg-blue-600 rounded-t-sm" style={{ height: `${(v / mx) * 70}px` }} />
                        <div className="text-[10px] text-gray-400">{m.slice(5)}/{m.slice(2, 4)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2 text-sm">
                  Projects &amp; tasks ({drillData.projects.length})
                </h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {drillData.projects.map(([pi, v]) => (
                        <tr key={pi} className="border-b border-gray-100 last:border-0">
                          <td className="px-3 py-1.5">
                            <div className="text-gray-900">{data.projects[pi].name}</div>
                            <div className="text-[11px]" style={{ color: catColor(data.projects[pi].category) }}>
                              {data.projects[pi].category}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{h1(v.hours)} h</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700 whitespace-nowrap">
                            {v.billable > 0 ? `${h1(v.billable)} b` : '—'}
                          </td>
                          <td className="px-3 py-1.5 w-28">
                            <Bar value={v.hours} max={drillData.projects[0][1].hours} color={catColor(data.projects[pi].category)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Source: Zoho People actual hours synced into the delivery dashboard, joined to the HR
        roster. Capacity assumes 8 h × Mon–Fri and does not deduct public holidays or approved
        leave, so utilisation is a floor rather than an exact figure.
      </p>
    </div>
  );
}

/* ================================================================== */
/* Sub-components                                                     */
/* ================================================================== */

function TopList({
  list,
  metric,
  max,
  value,
  color,
  onClick,
}: {
  list: any[];
  metric: (a: any) => string;
  max: number;
  value: (a: any) => number;
  color: string;
  onClick: (i: number) => void;
}) {
  if (list.length === 0)
    return <p className="text-sm text-gray-400 py-4 text-center">Nothing to show.</p>;
  return (
    <div className="space-y-2">
      {list.map((a) => (
        <div key={a.idx} className="cursor-pointer group" onClick={() => onClick(a.idx)}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-700 group-hover:text-blue-700 truncate">{a.p.name}</span>
            <span className="text-gray-500 tabular-nums whitespace-nowrap ml-2">{metric(a)}</span>
          </div>
          <Bar value={value(a)} max={max} color={color} />
        </div>
      ))}
    </div>
  );
}

function DiagCard({
  title,
  desc,
  tone,
  count,
  children,
}: {
  title: string;
  desc: string;
  tone: 'rose' | 'amber' | 'violet';
  count: number;
  children: React.ReactNode;
}) {
  const tones = {
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    violet: 'bg-violet-50 border-violet-200 text-violet-800',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`px-4 py-3 border-b ${tones[tone]}`}>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          <span className="px-2 py-0.5 rounded-full bg-white/70 text-xs font-bold">{count}</span>
        </div>
        <p className="text-xs mt-0.5 opacity-80">{desc}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
