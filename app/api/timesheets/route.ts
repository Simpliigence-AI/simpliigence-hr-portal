import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

// Delivery dashboard Supabase ("Project Planner"), where the delivery cockpit
// writes the time entries people entered in its my-time screen. That is the
// single source of truth for hours.
//
// Reading it needs DELIVERY_SUPABASE_SERVICE_KEY. time_entries carries RLS
// policies for `authenticated` only (own rows / reports / admin), so the anon
// key returns an empty list rather than an error — silently zero hours. The
// HR portal's own signed-in session is no help either: it is a JWT for a
// different Supabase project.
const DELIVERY_URL =
  process.env.DELIVERY_SUPABASE_URL ?? 'https://mhmxlubithnidopmkwgt.supabase.co';
const DELIVERY_SERVICE = process.env.DELIVERY_SUPABASE_SERVICE_KEY ?? '';

const HR_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const HR_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const PAGE = 1000;

/* ------------------------------------------------------------------ */
/* Fetch helper — paginates a PostgREST table until exhausted          */
/* ------------------------------------------------------------------ */

async function fetchAll(
  base: string,
  key: string,
  path: string,
  /** Bearer token to authorise as, when it differs from the project apikey —
   *  e.g. a signed-in user's access token, so the query runs as
   *  `authenticated` rather than `anon`. */
  bearer: string = key,
): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; offset < 60000; offset += PAGE) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${base}/rest/v1/${path}${sep}limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${bearer}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      if (offset === 0) throw new Error(`${path} → ${res.status} ${await res.text()}`);
      break;
    }
    const batch = (await res.json()) as any[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Project-name normalisation + work categorisation                    */
/* ------------------------------------------------------------------ */

/** Collapse casing/whitespace variants: "Client call" === "Client Call". */
function normProject(raw: string | null | undefined): string {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return 'Unspecified';
  return s
    .split(' ')
    .map((w) =>
      w.length > 2 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(' ');
}

/* The delivery cockpit offers a fixed set of "Internal — …" project labels
   alongside free-typed client names. Those fixed labels are unambiguous, so
   they are matched FIRST — before the billable shortcut in categorise() —
   because a meaningful number of them are logged with billable ticked by
   mistake (Leave / PTO, Holiday and Internal — Training all appear with
   billable=true). Honouring the flag over an explicit "Leave / PTO" label
   would file leave under Delivery / Project and hide the error.
   Note: this only fixes the work-type breakdown. The billable/non-billable
   totals still reflect the flag as entered — that is the cockpit's data to
   correct, not this route's. */
const EXPLICIT_RULES: [string, RegExp][] = [
  ['Leave / Holiday',    /^(leave\s*\/\s*pto|holiday|internal\s*—\s*leave)$/i],
  ['Bench / Idle',       /^internal\s*—\s*bench$/i],
  ['Learning / Upskill', /^(internal\s*—\s*training|learning|kpi)$/i],
  // Explicitly internal work, whatever the billable flag says — it is not
  // client delivery. Diagnostics surfaces it so the label can be improved.
  ['Other / Uncategorised', /^internal\s*—\s*other$/i],
];

/* Rules are ordered — first match wins. Originally tuned against the Zoho task
   labels and still useful for free-typed cockpit project names; see the note on
   "KPI", which at Simpliigence denotes an upskilling assignment rather than a
   metric. Some hours stay uncategorised because the labels themselves say
   nothing ("Internal — Other"), which the Diagnostics view surfaces rather
   than hides. */
const CATEGORY_RULES: [string, RegExp][] = [
  ['Leave / Holiday',       /\b(leave|holiday|pto|vacation|sick|comp\s?off|week\s?off|team outing)\b/i],
  ['Bench / Idle',          /\b(bench|idle|no\s?work|shadow|buffer|unallocated)\b/i],
  ['Recruitment / TA',      /(recruit|nurture to hire|hiring|interview|sourcing|screening|candidate|talent acquisition)/i],
  ['Learning / Upskill',    /(learn|upskill|training|certificat|knowledge improvement|\bstudy\b|trailhead|\bkpi\b|practi[sc]|course|badge|self\s?train)/i],
  ['HR / People Ops',       /(^hr\b|\bhr$|hr activities|human resource|onboard|induction|employee engagement|appraisal|payroll)/i],
  ['Finance / Admin',       /(financ|book\s?keeping|\bmis\b|invoic|billing|\bap\b|\bar\b|account|audit|complian|statutory|executive assistance|budget|cash flow|banking|procurement|travel desk|legal|contracts?\b|vendor manage|timesheet|\bsow\b|monthly report|consolidated)/i],
  ['Sales / Marketing',     /(sales|marketing|business development|presales|pre[- ]sales|proposal|\brfp\b|\brfi\b|campaign|lead gen|\bgtm\b|\bseo\b|google ads|branding|website|content|publish|social media)/i],
  ['Internal Tooling / IT', /(github|\bit\b related|it and system|system setup|slack|zoho|automation|ai tools|\bbots?\b|internal salesforce|platform)/i],
  ['Internal Meetings',     /(internal (meeting|call|discussion)|stand\s?up|standup|\bdsu\b|scrum|town\s?hall|all\s?hands|retro|sprint planning|sync\s?up|daily call|team coordinat|executive meeting|\bmeetings?\b|requirement discussion)/i],
  ['Delivery / Project',    /(develop|configur|test|\bqa\b|implement|migration|data\s?load|integration|deploy|release|bug|defect|support|uat|analys|architect|design|documentation|discovery|client|backend|frontend|project activit|maintenance|process improvement|clean\s?up|review)/i],
];

function categorise(project: string, billable: boolean): string {
  const p = project.trim();
  for (const [label, re] of EXPLICIT_RULES) {
    if (re.test(p)) return label;
  }
  if (billable) return 'Delivery / Project';
  for (const [label, re] of CATEGORY_RULES) {
    if (re.test(project)) return label;
  }
  return 'Other / Uncategorised';
}

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    /* ---- 1+2. Timesheets: delivery cockpit time_entries --------------
       Only submitted (or approved) entries count; drafts are still being
       edited by the person and are excluded from every total. */
    let internal: any[] = [];
    let timesheetError: string | null = null;
    if (DELIVERY_SERVICE) {
      try {
        internal = await fetchAll(
          DELIVERY_URL,
          DELIVERY_SERVICE,
          'time_entries?select=employee_email,work_date,project_name,hours,billable,status'
            + '&status=in.(submitted,approved)&order=work_date.asc',
        );
      } catch (e: any) {
        timesheetError = e?.message ?? 'time_entries fetch failed';
      }
    } else {
      timesheetError =
        'DELIVERY_SUPABASE_SERVICE_KEY not set — no timesheet hours available. '
        + 'Set it in Vercel to the delivery dashboard project\u2019s service-role key.';
    }

    /* ---- 3. HR portal employee master ------------------------------
       Read as the signed-in user, not as `anon`. Migration
       20260829141323 scoped the anon grant on public.employees to a
       dozen non-sensitive columns, and region/country/type/status/emp_id
       are not among them — as `anon` this select returns 42501 and the
       roster silently came back empty, unmatching every timesheet row. */
    let employees: any[] = [];
    let employeeError: string | null = null;
    try {
      const cookieStore = await cookies();
      const hr = createServerClient(HR_URL, HR_ANON, {
        cookies: { getAll: () => cookieStore.getAll() },
      });
      const { data: { session } } = await hr.auth.getSession();

      employees = await fetchAll(
        HR_URL,
        HR_ANON,
        'employees?select=name,ms_email,role,dept,region,country,location,manager,type,status,active,emp_id',
        session?.access_token ?? HR_ANON,
      );
    } catch (e: any) {
      employees = [];
      employeeError = e?.message ?? 'employees fetch failed';
    }

    /* ---- 4. Build the person dimension ------------------------------
       Only 82 of ~205 employee rows carry ms_email, and the Zoho
       timesheet names drift from the HR spellings ("Archana Simal" vs
       "Archana Misal", "Pawan Thote" vs "Pawan Angad Thote"). So we
       match in four widening passes: exact email → exact normalised
       name → email local-part against any name token → edit distance.  */

    const clean = (s: unknown) =>
      String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

    const empByEmail = new Map<string, any>();
    const empByName = new Map<string, any>();
    const empByToken = new Map<string, any>();

    for (const e of employees) {
      if (e.ms_email) empByEmail.set(String(e.ms_email).toLowerCase(), e);
      const n = clean(e.name);
      if (!n) continue;
      if (!empByName.has(n)) empByName.set(n, e);
      for (const tok of n.split(' ')) {
        // Skip very short tokens and don't let a common token clobber a
        // better candidate that was registered first.
        if (tok.length >= 4 && !empByToken.has(tok)) empByToken.set(tok, e);
      }
    }

    /** Bounded Levenshtein — returns >max as soon as it can prove it. */
    const editDistance = (a: string, b: string, max: number): number => {
      if (Math.abs(a.length - b.length) > max) return max + 1;
      let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
      for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
          if (cur[j] < rowMin) rowMin = cur[j];
        }
        if (rowMin > max) return max + 1;
        prev = cur;
      }
      return prev[b.length];
    };

    const empNames = Array.from(empByName.keys());

    const matchEmployee = (email: string, name: string): any | undefined => {
      // 1. exact email
      if (email) {
        const hit = empByEmail.get(email);
        if (hit) return hit;
      }
      const n = clean(name);
      // 2. exact normalised name
      if (n) {
        const hit = empByName.get(n);
        if (hit) return hit;
      }
      // 3. email local-part against a name token (mohaseen@ → Syed Mohaseen Elahi)
      const local = email.split('@')[0]?.replace(/[^a-z]/g, '') ?? '';
      if (local.length >= 4) {
        const hit = empByToken.get(local);
        if (hit) return hit;
      }
      // 4. near-miss on the full name (Chaithanya Reddy → Chaitanya Reddy)
      if (n.length >= 6) {
        let best: any;
        let bestD = 3;
        for (const cand of empNames) {
          const d = editDistance(n, cand, 2);
          if (d < bestD) {
            bestD = d;
            best = empByName.get(cand);
            if (d === 1) break;
          }
        }
        if (best) return best;
      }
      return undefined;
    };

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

    const peopleIdx = new Map<string, number>();
    const people: Person[] = [];
    /** Employee rows already resolved to by a timesheet person. */
    const claimed = new Set<any>();

    const personIndex = (email: string, fallbackName: string): number => {
      const key = (email || clean(fallbackName) || 'unknown').toLowerCase();
      const hit = peopleIdx.get(key);
      if (hit !== undefined) return hit;

      const emp = matchEmployee(email.toLowerCase(), fallbackName);
      if (emp) claimed.add(emp);

      const p: Person = {
        email: email || '',
        name: emp?.name ?? fallbackName ?? email,
        dept: emp?.dept ?? null,
        role: emp?.role ?? null,
        region: emp?.region ?? emp?.country ?? null,
        location: emp?.location ?? null,
        manager: emp?.manager ?? null,
        type: emp?.type ?? null,
        status: emp?.status ?? null,
        active: emp?.active ?? null,
        matched: Boolean(emp),
      };
      const i = people.length;
      people.push(p);
      peopleIdx.set(key, i);
      return i;
    };

    /* ---- 5. Build the project dimension + entry fact table ---- */
    const projIdx = new Map<string, number>();
    const projects: { name: string; category: string }[] = [];

    const projectIndex = (name: string, billable: boolean): number => {
      const hit = projIdx.get(name);
      if (hit !== undefined) return hit;
      const i = projects.length;
      projects.push({ name, category: categorise(name, billable) });
      projIdx.set(name, i);
      return i;
    };

    // entry = [personIdx, workDate, projectIdx, hours, billable(0|1), source(1=cockpit)]
    // The source slot is retained so the payload shape stays stable for the
    // page; every entry now comes from the cockpit.
    type Entry = [number, string, number, number, 0 | 1, 0 | 1];
    const entries: Entry[] = [];

    for (const r of internal) {
      const hours = Number(r.hours) || 0;
      if (!hours) continue;
      if (r.status && !['approved', 'submitted'].includes(String(r.status))) continue;
      const billable = Boolean(r.billable);
      const proj = normProject(r.project_name);
      entries.push([
        personIndex(String(r.employee_email ?? '').toLowerCase(), ''),
        String(r.work_date),
        projectIndex(proj, billable),
        hours,
        billable ? 1 : 0,
        1,
      ]);
    }

    /* ---- 6. Roster people with NO timesheet at all -------------------
       Diagnostics needs to flag non-reporters, so append every active
       employee who never showed up in the timesheet data. `claimed`
       tracks which employee rows a timesheet person already resolved
       to, so fuzzy matches aren't duplicated here.                    */
    for (const e of employees) {
      if (e.active === false) continue;
      if (claimed.has(e)) continue;
      const email = String(e.ms_email ?? '').toLowerCase();
      const nameKey = clean(e.name);
      const key = email || nameKey;
      if (!key || peopleIdx.has(key)) continue;

      peopleIdx.set(key, people.length);
      people.push({
        email,
        name: e.name ?? email,
        dept: e.dept ?? null,
        role: e.role ?? null,
        region: e.region ?? e.country ?? null,
        location: e.location ?? null,
        manager: e.manager ?? null,
        type: e.type ?? null,
        status: e.status ?? null,
        active: e.active ?? null,
        matched: true,
      });
    }

    const dates = entries.map((e) => e[1]).sort();

    return NextResponse.json(
      {
        people,
        projects,
        entries,
        meta: {
          generatedAt: new Date().toISOString(),
          counts: {
            entries: entries.length,
            people: people.length,
            projects: projects.length,
            timesheetRows: internal.length,
            employeesMatched: people.filter((p) => p.matched).length,
          },
          dateRange: { min: dates[0] ?? null, max: dates[dates.length - 1] ?? null },
          timesheetError,
          employeeError,
        },
      },
      { headers: { 'Cache-Control': 'private, max-age=120' } },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to load timesheet data' },
      { status: 500 },
    );
  }
}
