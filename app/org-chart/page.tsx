'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getDeptColor, cn, formatDate } from '@/lib/utils';
import Avatar from '@/components/Avatar';

/* ── Types ─────────────────────────────────────────────────────────── */

interface Employee {
  id: string;
  name: string;
  role?: string | null;
  dept?: string | null;
  manager?: string | null;
  region?: string | null;
  active?: boolean | null;
  location?: string | null;
  type?: string | null;
  status?: string | null;
  photo_url?: string | null;
  joined?: string | null;
  _noId?: boolean;   // the Dossier row has a blank employee id
}

interface Node {
  emp: Employee;
  children: Node[];
  parentId: string | null;
  depth: number;
  direct: number;   // immediate reports
  indirect: number; // everyone below, excluding the immediate reports
  total: number;    // direct + indirect
}

interface Forest {
  root: Node | null;
  orphans: Node[];              // sub-trees whose top manager could not be matched
  byId: Map<string, Node>;
  unmatchedManagers: Map<string, string[]>; // raw manager text -> names reporting to it
}

/* ── Helpers ───────────────────────────────────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[.\-_]/g, ' ').replace(/\s+/g, ' ').trim();
const NON_MANAGER = new Set(['', 'na', 'n a', 'none', 'nil', 'self', 'ceo', '-', '—']);

const REGION_FLAG: Record<string, string> = {
  India: '🇮🇳', USA: '🇺🇸', UK: '🇬🇧', Canada: '🇨🇦',
};

function isContractor(e: Employee) {
  return e.id.startsWith('C-') || e.id.startsWith('CSPL-') ||
    e.status === 'Contractor' || e.type === 'Contractor';
}

function tenure(joined?: string | null) {
  if (!joined) return '';
  const ms = Date.now() - new Date(joined).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const yrs = ms / (1000 * 60 * 60 * 24 * 365.25);
  return yrs < 1 ? `${Math.max(1, Math.floor(yrs * 12))} mo` : `${yrs.toFixed(1)} yrs`;
}

/**
 * Manager is free text in the HR data, so it is resolved the same way the
 * intranet directory does: normalised exact match first, then a *unique*
 * first-name match. Anything still unresolved is surfaced to the user rather
 * than silently dropping the person off the chart (which is what used to
 * happen — three developers reporting to a name not on the active roster were
 * invisible).
 */
function buildForest(employees: Employee[]): Forest {
  const byNorm = new Map<string, Employee[]>();
  const byFirst = new Map<string, Employee[]>();
  for (const e of employees) {
    const n = norm(e.name);
    (byNorm.get(n) ?? byNorm.set(n, []).get(n)!).push(e);
    const f = n.split(' ')[0];
    (byFirst.get(f) ?? byFirst.set(f, []).get(f)!).push(e);
  }

  const unmatchedManagers = new Map<string, string[]>();
  const parentOf = new Map<string, string | null>();

  for (const e of employees) {
    const raw = (e.manager ?? '').trim();
    const key = norm(raw);
    if (NON_MANAGER.has(key)) { parentOf.set(e.id, null); continue; }

    let match = byNorm.get(key)?.[0] ?? null;
    if (!match) {
      // "Anupama Bavihalli" in the manager field vs "Anupama B" on the roster:
      // fall back to the manager's first name, but only when it is unambiguous.
      const cands = (byFirst.get(key.split(' ')[0]) ?? []).filter(c => c.id !== e.id);
      if (cands.length === 1) match = cands[0];
    }
    if (match && match.id === e.id) match = null;

    if (!match) {
      (unmatchedManagers.get(raw) ?? unmatchedManagers.set(raw, []).get(raw)!).push(e.name);
      parentOf.set(e.id, null);
    } else {
      parentOf.set(e.id, match.id);
    }
  }

  // Break any accidental cycles (A reports to B, B reports to A).
  for (const e of employees) {
    const seen = new Set<string>([e.id]);
    let p = parentOf.get(e.id) ?? null;
    while (p) {
      if (seen.has(p)) { parentOf.set(e.id, null); break; }
      seen.add(p);
      p = parentOf.get(p) ?? null;
    }
  }

  const childrenOf = new Map<string, Employee[]>();
  for (const e of employees) {
    const p = parentOf.get(e.id) ?? null;
    if (p == null || p === '') continue;
    (childrenOf.get(p) ?? childrenOf.set(p, []).get(p)!).push(e);
  }

  const byId = new Map<string, Node>();

  function build(emp: Employee, parentId: string | null, depth: number): Node {
    const kids = (childrenOf.get(emp.id) ?? [])
      .slice()
      .sort((a, b) => {
        const ac = (childrenOf.get(a.id) ?? []).length;
        const bc = (childrenOf.get(b.id) ?? []).length;
        if (ac !== bc) return bc - ac;                 // managers first
        const ax = isContractor(a) ? 1 : 0, bx = isContractor(b) ? 1 : 0;
        if (ax !== bx) return ax - bx;                 // FTEs before contractors
        return a.name.localeCompare(b.name);
      })
      .map(k => build(k, emp.id, depth + 1));

    const indirect = kids.reduce((s, k) => s + k.total, 0);
    const node: Node = {
      emp, children: kids, parentId, depth,
      direct: kids.length, indirect, total: kids.length + indirect,
    };
    byId.set(emp.id, node);
    return node;
  }

  const rootEmps = employees.filter(e => (parentOf.get(e.id) ?? null) == null);
  const ceo = rootEmps.find(e => norm(e.name).includes('raghu seetharam')) ?? rootEmps[0] ?? null;

  const root = ceo ? build(ceo, null, 0) : null;
  const orphans = rootEmps
    .filter(e => e.id !== ceo?.id)
    .map(e => build(e, null, 0))
    .sort((a, b) => b.total - a.total);

  return { root, orphans, byId, unmatchedManagers };
}

/* ── Small shared pieces ───────────────────────────────────────────── */

function CountChips({ node, size = 'sm', hideEmpty = false }: { node: Node; size?: 'sm' | 'md'; hideEmpty?: boolean }) {
  const pad = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';
  if (node.direct === 0) {
    if (hideEmpty) return null;
    return (
      <span className={cn('rounded-md bg-gray-50 text-gray-400 font-medium whitespace-nowrap', pad)}>
        no reports
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 shrink-0">
      <span
        className={cn('rounded-md bg-blue-50 text-blue-700 font-semibold whitespace-nowrap', pad)}
        title={`${node.direct} people report directly to ${node.emp.name}`}
      >
        {node.direct} direct
      </span>
      <span
        className={cn(
          'rounded-md font-semibold whitespace-nowrap',
          node.indirect > 0 ? 'bg-violet-50 text-violet-700' : 'bg-gray-50 text-gray-400',
          pad,
        )}
        title={`${node.indirect} more people sit below ${node.emp.name} (${node.total} in total)`}
      >
        {node.indirect} indirect
      </span>
    </span>
  );
}

function DeptChip({ dept }: { dept?: string | null }) {
  const d = dept ?? 'Other';
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap"
      style={{ backgroundColor: getDeptColor(d) }}
    >
      {d}
    </span>
  );
}

/* ── Tree (indented) view ──────────────────────────────────────────── */

interface RowProps {
  node: Node;
  isLast: boolean;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onSelect: (n: Node) => void;
  onFocus: (id: string) => void;
  selectedId?: string | null;
  visible: Set<string> | null; // null = no filter active
  matches: Set<string> | null;
}

function TreeRow({ node, isLast, expanded, toggle, onSelect, onFocus, selectedId, visible, matches }: RowProps) {
  const kids = visible ? node.children.filter(c => visible.has(c.emp.id)) : node.children;
  const open = expanded.has(node.emp.id);
  const hasKids = kids.length > 0;
  const isMatch = !!matches?.has(node.emp.id);
  const color = getDeptColor(node.emp.dept ?? 'Other');

  return (
    <li className="relative pl-6">
      {/* rail + elbow */}
      <span
        className="absolute left-2 top-0 w-px bg-gray-200"
        style={{ height: isLast ? 22 : '100%' }}
        aria-hidden
      />
      <span className="absolute left-2 top-[22px] h-px w-3.5 bg-gray-200" aria-hidden />

      <div
        className={cn(
          'group relative flex items-center gap-2.5 rounded-lg border px-2 py-1.5 my-0.5 bg-white transition-colors',
          selectedId === node.emp.id
            ? 'border-blue-400 ring-2 ring-blue-100'
            : isMatch
              ? 'border-amber-300 bg-amber-50/60'
              : 'border-transparent hover:border-gray-200 hover:bg-gray-50',
        )}
      >
        <button
          onClick={() => hasKids && toggle(node.emp.id)}
          className={cn(
            'w-5 h-5 shrink-0 rounded flex items-center justify-center text-[10px] font-bold transition-colors',
            hasKids ? 'text-gray-500 hover:bg-gray-200 hover:text-gray-800' : 'text-gray-200 cursor-default',
          )}
          aria-label={hasKids ? (open ? 'Collapse' : 'Expand') : undefined}
          title={hasKids ? (open ? 'Collapse' : `Expand ${kids.length}`) : 'No reports'}
        >
          {hasKids ? (open ? '▾' : '▸') : '•'}
        </button>

        <span className="w-1 h-7 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />

        <button onClick={() => onSelect(node)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
          <Avatar name={node.emp.name} photoUrl={node.emp.photo_url} size="sm" />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-900 truncate">{node.emp.name}</span>
              {isContractor(node.emp) && (
                <span className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 shrink-0">
                  Contract
                </span>
              )}
            </span>
            <span className="block text-xs text-gray-500 truncate">
              {node.emp.role ?? '—'}
              {node.emp.location ? <span className="text-gray-300"> · {node.emp.location}</span> : null}
            </span>
          </span>
        </button>

        <span className="hidden lg:flex items-center gap-1.5 shrink-0">
          {node.emp.region && <span title={node.emp.region}>{REGION_FLAG[node.emp.region] ?? ''}</span>}
          <DeptChip dept={node.emp.dept} />
        </span>

        <CountChips node={node} hideEmpty />

        {hasKids && (
          <button
            onClick={() => onFocus(node.emp.id)}
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-medium text-blue-600 hover:underline px-1"
            title={`Show only ${node.emp.name}'s organisation`}
          >
            focus
          </button>
        )}
      </div>

      {open && hasKids && (
        <ul className="relative">
          {kids.map((c, i) => (
            <TreeRow
              key={c.emp.id}
              node={c}
              isLast={i === kids.length - 1}
              expanded={expanded}
              toggle={toggle}
              onSelect={onSelect}
              onFocus={onFocus}
              selectedId={selectedId}
              visible={visible}
              matches={matches}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/* ── Chart (top-down) view ─────────────────────────────────────────── */

const WIDE_AT = 5; // more than this many reports stack vertically instead of spreading

interface ChartProps {
  node: Node;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onSelect: (n: Node) => void;
  selectedId?: string | null;
  visible: Set<string> | null;
  matches: Set<string> | null;
}

function ChartCard({ node, open, hasKids, onToggle, onSelect, selected, isMatch }: {
  node: Node; open: boolean; hasKids: boolean;
  onToggle: () => void; onSelect: () => void; selected: boolean; isMatch: boolean;
}) {
  const color = getDeptColor(node.emp.dept ?? 'Other');
  return (
    <div
      className={cn(
        'w-48 rounded-xl bg-white border shadow-sm text-center overflow-hidden transition-shadow hover:shadow-md',
        selected ? 'border-blue-400 ring-2 ring-blue-100' : isMatch ? 'border-amber-300' : 'border-gray-200',
      )}
    >
      <div className="h-1" style={{ backgroundColor: color }} />
      <button onClick={onSelect} className="w-full px-3 pt-3 pb-2 block">
        <span className="flex justify-center mb-1.5">
          <Avatar name={node.emp.name} photoUrl={node.emp.photo_url} size="md" />
        </span>
        <span className="block text-xs font-semibold text-gray-900 leading-tight truncate">{node.emp.name}</span>
        <span className="block text-[11px] text-gray-500 leading-tight mt-0.5 line-clamp-2 min-h-[26px]">
          {node.emp.role ?? '—'}
        </span>
        <span className="flex justify-center mt-1.5">
          <DeptChip dept={node.emp.dept} />
        </span>
        <span className="flex justify-center mt-1.5">
          <CountChips node={node} />
        </span>
      </button>
      {hasKids && (
        <button
          onClick={onToggle}
          className="w-full border-t border-gray-100 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800"
        >
          {open ? '▴ hide team' : `▾ show ${node.direct}`}
        </button>
      )}
    </div>
  );
}

function ChartNode({ node, expanded, toggle, onSelect, selectedId, visible, matches }: ChartProps) {
  const kids = visible ? node.children.filter(c => visible.has(c.emp.id)) : node.children;
  const open = expanded.has(node.emp.id);
  const hasKids = kids.length > 0;
  const wide = kids.length > WIDE_AT;

  const card = (
    <ChartCard
      node={node}
      open={open}
      hasKids={hasKids}
      onToggle={() => toggle(node.emp.id)}
      onSelect={() => onSelect(node)}
      selected={selectedId === node.emp.id}
      isMatch={!!matches?.has(node.emp.id)}
    />
  );

  if (!open || !hasKids) return <div className="flex flex-col items-center">{card}</div>;

  // Wide fan-out: a spread row of 42 cards is unreadable, and drawing a tree of
  // lines across them would only pretend to a structure they don't have. So the
  // reports go into one labelled container that stays centred under the manager.
  if (wide) {
    return (
      <div className="flex flex-col items-center">
        {card}
        <div className="w-px h-5 bg-gray-300" />
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/70 p-4">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3 text-center">
            {kids.length} reports to {node.emp.name.split(' ')[0]}
          </div>
          <div className="flex flex-wrap justify-center items-start gap-4 max-w-[880px]">
            {kids.map(c => (
              <ChartNode
                key={c.emp.id}
                node={c}
                expanded={expanded}
                toggle={toggle}
                onSelect={onSelect}
                selectedId={selectedId}
                visible={visible}
                matches={matches}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      {card}
      <div className="w-px h-5 bg-gray-300" />
      <div className="flex items-start">
        {kids.map((c, i) => (
          <div key={c.emp.id} className="flex flex-col items-center px-3 relative pt-5">
            {/* horizontal bar: transparent on the outer half of the first / last child */}
            <span className="absolute top-0 left-0 right-0 flex h-px" aria-hidden>
              <span className={cn('flex-1', i === 0 ? '' : 'bg-gray-300')} />
              <span className={cn('flex-1', i === kids.length - 1 ? '' : 'bg-gray-300')} />
            </span>
            <span className="absolute top-0 h-5 w-px bg-gray-300" aria-hidden />
            <ChartNode
              node={c}
              expanded={expanded}
              toggle={toggle}
              onSelect={onSelect}
              selectedId={selectedId}
              visible={visible}
              matches={matches}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Detail slide-over ─────────────────────────────────────────────── */

function DetailPanel({ node, forest, onClose, onJump, onFocus }: {
  node: Node; forest: Forest; onClose: () => void;
  onJump: (id: string) => void; onFocus: (id: string) => void;
}) {
  const e = node.emp;
  const mgr = node.parentId ? forest.byId.get(node.parentId) : null;
  const color = getDeptColor(e.dept ?? 'Other');

  const chain: Node[] = [];
  let p = node.parentId ? forest.byId.get(node.parentId) : null;
  while (p) { chain.unshift(p); p = p.parentId ? forest.byId.get(p.parentId) ?? null : null; }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-white z-50 shadow-2xl overflow-y-auto">
        <div className="h-1.5" style={{ backgroundColor: color }} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={e.name} photoUrl={e.photo_url} size="lg" />
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 leading-tight truncate">{e.name}</h2>
                <p className="text-sm text-gray-500 truncate">{e.role ?? '—'}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <DeptChip dept={e.dept} />
                  {isContractor(e) && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-orange-100 text-orange-700">
                      Contractor
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1" aria-label="Close">×</button>
          </div>

          {/* counts */}
          <div className="grid grid-cols-3 gap-2 mt-5">
            {[
              { label: 'Direct', value: node.direct, cls: 'text-blue-700 bg-blue-50' },
              { label: 'Indirect', value: node.indirect, cls: 'text-violet-700 bg-violet-50' },
              { label: 'Total below', value: node.total, cls: 'text-gray-800 bg-gray-100' },
            ].map(s => (
              <div key={s.label} className={cn('rounded-xl px-3 py-2.5 text-center', s.cls)}>
                <div className="text-xl font-bold leading-none">{s.value}</div>
                <div className="text-[10px] font-medium uppercase tracking-wide mt-1 opacity-70">{s.label}</div>
              </div>
            ))}
          </div>

          {/* facts */}
          <dl className="mt-5 text-sm divide-y divide-gray-100 border-y border-gray-100">
            {([
              ['Status', e.status ?? '—'],
              ['Region', e.region ? `${REGION_FLAG[e.region] ?? ''} ${e.region}` : '—'],
              ['Location', e.location ?? '—'],
              ['Joined', e.joined ? `${formatDate(e.joined)}${tenure(e.joined) ? ` · ${tenure(e.joined)}` : ''}` : '—'],
              ['Employee ID', e._noId ? '— missing in Dossier' : e.id],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-2">
                <dt className="text-gray-400">{k}</dt>
                <dd className="text-gray-800 font-medium text-right truncate">{v}</dd>
              </div>
            ))}
          </dl>

          {/* reporting line */}
          {chain.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Reporting line</h3>
              <div className="flex flex-wrap items-center gap-1 text-xs">
                {chain.map((c, i) => (
                  <span key={c.emp.id} className="flex items-center gap-1">
                    <button onClick={() => onJump(c.emp.id)} className="text-blue-600 hover:underline font-medium">
                      {c.emp.name}
                    </button>
                    <span className="text-gray-300">›</span>
                    {i === chain.length - 1 && <span className="text-gray-700 font-semibold">{e.name}</span>}
                  </span>
                ))}
              </div>
              {mgr && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  Reports to {mgr.emp.name} · {mgr.emp.role ?? '—'}
                </p>
              )}
            </div>
          )}

          {/* direct reports */}
          {node.direct > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Direct reports ({node.direct})
              </h3>
              <ul className="space-y-0.5 max-h-72 overflow-y-auto -mx-1">
                {node.children.map(c => (
                  <li key={c.emp.id}>
                    <button
                      onClick={() => onJump(c.emp.id)}
                      className="w-full flex items-center gap-2 px-1 py-1.5 rounded-lg hover:bg-gray-50 text-left"
                    >
                      <Avatar name={c.emp.name} photoUrl={c.emp.photo_url} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-800 truncate">{c.emp.name}</span>
                        <span className="block text-xs text-gray-400 truncate">{c.emp.role ?? '—'}</span>
                      </span>
                      {c.total > 0 && (
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 shrink-0">
                          +{c.total}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {node.direct > 0 && (
              <button
                onClick={() => { onFocus(e.id); onClose(); }}
                className="w-full py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Show only this organisation
              </button>
            )}
            {e._noId ? (
              <Link
                href={`/dossier?search=${encodeURIComponent(e.name)}`}
                className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium text-center hover:bg-blue-700"
              >
                Find in Dossier →
              </Link>
            ) : (
              <Link
                href={`/dossier?emp=${encodeURIComponent(e.id)}`}
                className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium text-center hover:bg-blue-700"
              >
                Open full profile in Dossier →
              </Link>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────────────── */

type View = 'tree' | 'chart';

export default function OrgChartPage() {
  const [all, setAll]         = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState<View>('tree');
  const [search, setSearch]   = useState('');
  const [deptF, setDeptF]     = useState('All');
  const [showContractors, setShowContractors] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [focusId, setFocusId]   = useState<string | null>(null);
  const [zoom, setZoom]         = useState(1);

  useEffect(() => {
    supabase
      .from('employees')
      .select('id,name,role,dept,manager,region,active,location,type,status,photo_url,joined')
      .eq('active', true)
      .in('status', ['Active', 'Contractor'])
      .then(({ data }) => {
        setAll((data ?? []) as Employee[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem('orgchart:view');
      if (v === 'tree' || v === 'chart') setView(v);
    } catch { /* storage unavailable — keep the default */ }
  }, []);

  const setViewPersist = useCallback((v: View) => {
    setView(v);
    try { window.localStorage.setItem('orgchart:view', v); } catch { /* ignore */ }
  }, []);

  // A couple of Dossier rows have a blank employee id (Ankit Kedia, today).
  // A falsy id silently detached everyone reporting to them, so give those rows
  // a synthetic key and flag it so the Dossier link is hidden rather than broken.
  const people = useMemo(() => {
    const src = showContractors ? all : all.filter(e => !isContractor(e));
    return src.map((e, i) =>
      e.id && e.id.trim()
        ? e
        : { ...e, id: `no-id-${i}-${norm(e.name).replace(/\s+/g, '-')}`, _noId: true },
    );
  }, [all, showContractors]);

  const forest = useMemo(() => buildForest(people), [people]);

  const depts = useMemo(() => {
    const s = new Set<string>();
    for (const e of people) s.add(e.dept ?? 'Other');
    return Array.from(s).sort();
  }, [people]);

  // Open the top two levels once the tree is first available.
  useEffect(() => {
    if (!forest.root) return;
    const next = new Set<string>([forest.root.emp.id]);
    for (const c of forest.root.children) if (c.direct > 0) next.add(c.emp.id);
    setExpanded(next);
  }, [forest.root]);

  /* Filtering: a node stays visible if it matches, or if a descendant does. */
  const { visible, matches } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtering = q.length > 0 || deptF !== 'All';
    if (!filtering) return { visible: null as Set<string> | null, matches: null as Set<string> | null };

    const m = new Set<string>();
    for (const e of people) {
      const hitQ = !q ||
        e.name.toLowerCase().includes(q) ||
        (e.role ?? '').toLowerCase().includes(q) ||
        (e.location ?? '').toLowerCase().includes(q) ||
        (e.dept ?? '').toLowerCase().includes(q);
      const hitD = deptF === 'All' || (e.dept ?? 'Other') === deptF;
      if (hitQ && hitD) m.add(e.id);
    }

    const v = new Set<string>();
    const mark = (id: string) => {
      let cur: Node | undefined = forest.byId.get(id);
      while (cur) { v.add(cur.emp.id); cur = cur.parentId ? forest.byId.get(cur.parentId) : undefined; }
    };
    m.forEach(id => mark(id));
    // keep the whole subtree under a match too, so you can see their team
    const addSub = (n: Node) => { v.add(n.emp.id); n.children.forEach(addSub); };
    m.forEach(id => { const n = forest.byId.get(id); if (n) addSub(n); });

    return { visible: v, matches: m };
  }, [search, deptF, people, forest]);

  // When a filter is on, open every ancestor so the hits are actually on screen.
  useEffect(() => {
    if (!visible) return;
    setExpanded(new Set(visible));
  }, [visible]);

  const displayRoot = useMemo(() => {
    if (focusId) return forest.byId.get(focusId) ?? forest.root;
    return forest.root;
  }, [focusId, forest]);

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const expandAll = useCallback(() => {
    const ids = new Set<string>();
    forest.byId.forEach((n, id) => { if (n.direct > 0) ids.add(id); });
    setExpanded(ids);
  }, [forest]);

  const collapseAll = useCallback(() => {
    setExpanded(displayRoot ? new Set([displayRoot.emp.id]) : new Set());
  }, [displayRoot]);

  const jump = useCallback((id: string) => {
    setSelected(id);
    setExpanded(prev => {
      const n = new Set(prev);
      let cur: Node | undefined = forest.byId.get(id);
      while (cur) { n.add(cur.emp.id); cur = cur.parentId ? forest.byId.get(cur.parentId) : undefined; }
      return n;
    });
  }, [forest]);

  const focusOn = useCallback((id: string) => {
    setFocusId(id);
    setExpanded(prev => new Set(prev).add(id));
    setSelected(null);
  }, []);

  /* Summary stats */
  const stats = useMemo(() => {
    const nodes = Array.from(forest.byId.values());
    const managers = nodes.filter(n => n.direct > 0);
    let depth = 0;
    for (const n of nodes) depth = Math.max(depth, n.depth + 1);
    const span = managers.length ? (managers.reduce((s, n) => s + n.direct, 0) / managers.length) : 0;
    return {
      people: people.length,
      managers: managers.length,
      ics: people.length - managers.length,
      depth,
      span: span.toFixed(1),
    };
  }, [forest, people]);

  const breadcrumb = useMemo(() => {
    if (!focusId) return [];
    const out: Node[] = [];
    let cur: Node | undefined = forest.byId.get(focusId);
    while (cur) { out.unshift(cur); cur = cur.parentId ? forest.byId.get(cur.parentId) : undefined; }
    return out;
  }, [focusId, forest]);

  const selectedNode = selected ? forest.byId.get(selected) ?? null : null;
  const filtering = !!visible;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Org Chart</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Built live from the manager field in the HR Dossier. Every card shows how many people
            report <span className="font-medium text-blue-700">directly</span> and how many sit{' '}
            <span className="font-medium text-violet-700">indirectly</span> below.
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5 shrink-0">
          {(['tree', 'chart'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setViewPersist(v)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                view === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              {v === 'tree' ? '☰ Tree' : '⊞ Chart'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'People on the chart', value: stats.people, tone: 'text-gray-900' },
          { label: 'Managers', value: stats.managers, tone: 'text-blue-700' },
          { label: 'Individual contributors', value: stats.ics, tone: 'text-violet-700' },
          { label: 'Levels deep', value: stats.depth, tone: 'text-gray-900' },
          { label: 'Avg. span of control', value: stats.span, tone: 'text-gray-900' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className={cn('text-2xl font-bold leading-none', s.tone)}>{s.value}</div>
            <div className="text-[11px] text-gray-400 mt-1.5 leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Find a person, role or location…"
          className="flex-1 min-w-56 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
        />
        <select
          value={deptF}
          onChange={e => setDeptF(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:outline-none"
        >
          {['All', ...depts].map(d => <option key={d} value={d}>{d === 'All' ? 'All departments' : d}</option>)}
        </select>
        <label className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showContractors}
            onChange={e => setShowContractors(e.target.checked)}
            className="rounded"
          />
          Contractors
        </label>
        <button onClick={expandAll} className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
          Expand all
        </button>
        <button onClick={collapseAll} className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50">
          Collapse
        </button>
        {view === 'chart' && (
          <div className="flex items-center rounded-lg border border-gray-200 bg-white">
            <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2)))} className="px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50">−</button>
            <span className="px-1 text-xs text-gray-400 tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(1.4, +(z + 0.1).toFixed(2)))} className="px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50">＋</button>
          </div>
        )}
        {(search || deptF !== 'All' || focusId) && (
          <button
            onClick={() => { setSearch(''); setDeptF('All'); setFocusId(null); }}
            className="px-3 py-2 text-sm text-blue-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Focus breadcrumb */}
      {focusId && breadcrumb.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
          <span className="text-blue-500 font-medium mr-1">Showing only:</span>
          <button onClick={() => setFocusId(null)} className="text-blue-600 hover:underline font-medium">Whole company</button>
          {breadcrumb.map((n, i) => (
            <span key={n.emp.id} className="flex items-center gap-1">
              <span className="text-blue-300">›</span>
              {i === breadcrumb.length - 1
                ? <span className="font-semibold text-blue-800">{n.emp.name}</span>
                : <button onClick={() => setFocusId(n.emp.id)} className="text-blue-600 hover:underline font-medium">{n.emp.name}</button>}
            </span>
          ))}
        </div>
      )}

      {filtering && (
        <p className="text-xs text-gray-500 mb-3">
          {matches?.size ?? 0} {matches?.size === 1 ? 'person matches' : 'people match'} — shown in context with their reporting line.
        </p>
      )}

      {/* The chart */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">Loading org chart…</div>
      ) : !displayRoot ? (
        <div className="text-gray-400 text-sm">No data found.</div>
      ) : view === 'tree' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-3 overflow-x-auto max-w-5xl">
          <ul className="min-w-max">
            {/* root rendered without a rail */}
            <li>
              <div
                className={cn(
                  'group flex items-center gap-2.5 rounded-lg border px-2 py-2 bg-white',
                  selected === displayRoot.emp.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-100',
                )}
              >
                <button
                  onClick={() => toggle(displayRoot.emp.id)}
                  className="w-5 h-5 shrink-0 rounded flex items-center justify-center text-[10px] font-bold text-gray-500 hover:bg-gray-200"
                >
                  {expanded.has(displayRoot.emp.id) ? '▾' : '▸'}
                </button>
                <span className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: getDeptColor(displayRoot.emp.dept ?? 'Other') }} />
                <button onClick={() => setSelected(displayRoot.emp.id)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                  <Avatar name={displayRoot.emp.name} photoUrl={displayRoot.emp.photo_url} size="md" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-gray-900 truncate">{displayRoot.emp.name}</span>
                    <span className="block text-xs text-gray-500 truncate">{displayRoot.emp.role ?? '—'}</span>
                  </span>
                </button>
                <DeptChip dept={displayRoot.emp.dept} />
                <CountChips node={displayRoot} size="md" />
              </div>
              {expanded.has(displayRoot.emp.id) && (
                <ul>
                  {(visible ? displayRoot.children.filter(c => visible.has(c.emp.id)) : displayRoot.children).map((c, i, arr) => (
                    <TreeRow
                      key={c.emp.id}
                      node={c}
                      isLast={i === arr.length - 1}
                      expanded={expanded}
                      toggle={toggle}
                      onSelect={n => setSelected(n.emp.id)}
                      onFocus={focusOn}
                      selectedId={selected}
                      visible={visible}
                      matches={matches}
                    />
                  ))}
                </ul>
              )}
            </li>
          </ul>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 overflow-auto">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }} className="inline-block">
            <ChartNode
              node={displayRoot}
              expanded={expanded}
              toggle={toggle}
              onSelect={n => setSelected(n.emp.id)}
              selectedId={selected}
              visible={visible}
              matches={matches}
            />
          </div>
        </div>
      )}

      {/* Not connected to the main tree */}
      {forest.orphans.length > 0 && !focusId && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            Not connected to the main tree ({forest.orphans.reduce((s, o) => s + o.total + 1, 0)} people)
          </h2>
          <p className="text-xs text-amber-700 mt-1 mb-3">
            Their <em>manager</em> in the Dossier doesn&apos;t match anyone on the active roster, so they can&apos;t be
            placed. Fix the manager field in the Dossier and they&apos;ll slot in automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            {forest.orphans.map(o => (
              <button
                key={o.emp.id}
                onClick={() => setSelected(o.emp.id)}
                className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 hover:border-amber-400 text-left"
              >
                <Avatar name={o.emp.name} photoUrl={o.emp.photo_url} size="sm" />
                <span>
                  <span className="block text-xs font-semibold text-gray-900">{o.emp.name}</span>
                  <span className="block text-[11px] text-gray-400">
                    manager: “{o.emp.manager ?? '—'}”{o.total > 0 ? ` · ${o.total} below` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Business units */}
      <h2 className="text-lg font-semibold text-gray-800 mt-8 mb-3">Business Units</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {depts
          .map(d => ({ dept: d, emps: people.filter(e => (e.dept ?? 'Other') === d) }))
          .sort((a, b) => b.emps.length - a.emps.length)
          .map(({ dept, emps }) => {
            const mgrs = emps.filter(e => (forest.byId.get(e.id)?.direct ?? 0) > 0).length;
            return (
              <button
                key={dept}
                onClick={() => setDeptF(dept)}
                className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-blue-300 transition-colors border-t-4"
                style={{ borderTopColor: getDeptColor(dept) }}
              >
                <div className="font-semibold text-sm text-gray-800 mb-1">{dept}</div>
                <div className="text-2xl font-bold" style={{ color: getDeptColor(dept) }}>{emps.length}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {emps.length === 1 ? 'person' : 'people'}{mgrs > 0 ? ` · ${mgrs} managing` : ''}
                </div>
              </button>
            );
          })}
      </div>

      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          forest={forest}
          onClose={() => setSelected(null)}
          onJump={jump}
          onFocus={focusOn}
        />
      )}
    </div>
  );
}
