'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getDeptColor } from '@/lib/utils';

interface Employee {
  id: string; name: string; role?: string|null; dept?: string|null;
  manager?: string|null; region?: string|null; active?: boolean|null;
  location?: string|null; type?: string|null; status?: string|null;
  joined?: string|null; wfo?: string|null; phone?: string|null;
}

interface TreeNode {
  emp: Employee;
  children: TreeNode[];
  contractorGroup?: { count: number; names: string[] }; // collapsed contractor block
}

/** Lets any node in the recursive tree open the detail card. */
const OrgCtx = createContext<{ onSelect: (e: Employee) => void }>({ onSelect: () => {} });

function isContractor(emp: Employee) {
  return emp.id.startsWith('C-') || emp.id.startsWith('CSPL-');
}

function buildTree(employees: Employee[]): TreeNode | null {
  const byName = new Map<string, Employee>();
  for (const e of employees) byName.set(e.name.toLowerCase().trim(), e);

  // children map: manager name -> children
  const childrenOf = new Map<string, Employee[]>();
  for (const e of employees) {
    const mgr = (e.manager ?? '').trim();
    if (!mgr) continue;
    const list = childrenOf.get(mgr.toLowerCase()) ?? [];
    list.push(e);
    childrenOf.set(mgr.toLowerCase(), list);
  }

  // Root: Raghu Seetharam (no manager or manager not found)
  const root = employees.find(e => e.name.toLowerCase().includes('raghu seetharam'))
    ?? employees.find(e => !e.manager || !byName.has((e.manager ?? '').toLowerCase().trim()));
  if (!root) return null;

  const visited = new Set<string>();

  function build(emp: Employee): TreeNode {
    visited.add(emp.id);
    const directChildren = childrenOf.get(emp.name.toLowerCase().trim()) ?? [];
    const ftChildren = directChildren.filter(c => !isContractor(c) && !visited.has(c.id));
    const contractors = directChildren.filter(c => isContractor(c) && !visited.has(c.id));

    const node: TreeNode = {
      emp,
      children: ftChildren.map(build),
    };

    if (contractors.length > 0) {
      node.contractorGroup = {
        count: contractors.length,
        names: contractors.slice(0, 12).map(c => c.name),
      };
    }
    return node;
  }

  return build(root);
}

/* ── OrgBox component ─────────────────────────────────────────────── */
function OrgBox({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(false);
  const { onSelect } = useContext(OrgCtx);
  const color = getDeptColor(node.emp.dept ?? 'Other');
  const initials = node.emp.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('');
  const hasChildren = node.children.length > 0 || !!node.contractorGroup;

  return (
    <div className="flex flex-col items-center">
      <div
        className="bg-white border rounded-xl p-3 shadow-sm text-center min-w-36 max-w-44 cursor-pointer hover:shadow-md transition-shadow"
        style={{ borderTopWidth: 4, borderTopColor: color }}
        onClick={() => onSelect(node.emp)}
        title="View details"
      >
        <div
          className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: color }}
        >
          {initials}
        </div>
        <div className="font-semibold text-xs text-gray-900 leading-tight">{node.emp.name}</div>
        <div className="text-xs text-gray-400 mt-0.5 leading-tight">{node.emp.role}</div>
        <span
          className="inline-block text-xs px-1.5 py-0.5 rounded-full text-white mt-1.5 font-medium"
          style={{ backgroundColor: color, fontSize: 10 }}
        >
          {node.emp.dept ?? 'Other'}
        </span>
        {hasChildren && (
          <button
            onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
            className="text-xs text-gray-400 mt-1 hover:text-gray-700 hover:underline"
            title={open ? 'Collapse' : 'Expand'}
          >
            {open ? '▲' : '▼'} {node.children.length + (node.contractorGroup ? 1 : 0)} direct
          </button>
        )}
      </div>

      {open && hasChildren && (
        <div className="flex flex-col items-center">
          <div className="w-px h-6 bg-gray-200" />
          <div className="flex gap-4 items-start flex-wrap justify-center">
            {node.children.map(child => (
              <div key={child.emp.id} className="flex flex-col items-center">
                <div className="w-px h-6 bg-gray-200" />
                <OrgBox node={child} depth={depth + 1} />
              </div>
            ))}
            {node.contractorGroup && (
              <ContractorGroupBox
                count={node.contractorGroup.count}
                names={node.contractorGroup.names}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContractorGroupBox({ count, names }: { count: number; names: string[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col items-center">
      <div className="w-px h-6 bg-gray-200" />
      <div
        className="bg-orange-50 border-2 border-orange-200 rounded-xl p-3 shadow-sm text-center min-w-36 max-w-52 cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => setExpanded(o => !o)}
      >
        <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center bg-orange-400 text-white text-sm font-bold">
          {count}
        </div>
        <div className="font-semibold text-xs text-gray-900 leading-tight">India Contractors</div>
        <div className="text-xs text-gray-400 mt-0.5">{count} active billable</div>
        <span className="inline-block text-xs px-1.5 py-0.5 rounded-full text-white mt-1.5 font-medium bg-orange-400" style={{ fontSize: 10 }}>
          Contractors
        </span>
        <div className="text-xs text-gray-400 mt-1">{expanded ? '▲ hide' : '▼ show names'}</div>
      </div>
      {expanded && (
        <div className="mt-2 bg-white rounded-xl border border-orange-200 shadow p-3 max-w-64 text-xs text-gray-600 leading-relaxed">
          {names.join(', ')}{count > names.length ? ` + ${count - names.length} more…` : ''}
        </div>
      )}
    </div>
  );
}


/* ── Employee detail card ─────────────────────────────────────────── */
function tenureFrom(joined?: string | null) {
  if (!joined) return null;
  const start = new Date(joined);
  if (Number.isNaN(start.getTime())) return null;
  const months = Math.max(0, Math.round((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} mo`;
  return m === 0 ? `${y} yr` : `${y} yr ${m} mo`;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

function EmployeeDetail({
  emp, manager, reports, onClose, onJump,
}: {
  emp: Employee;
  manager: Employee | null;
  reports: Employee[];
  onClose: () => void;
  onJump: (e: Employee) => void;
}) {
  const color = getDeptColor(emp.dept ?? 'Other');
  const initials = emp.name.split(' ').slice(0, 2).map(w => w[0]).join('');
  const tenure = tenureFrom(emp.joined);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="p-5 border-b border-gray-100 flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shrink-0"
            style={{ backgroundColor: color }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-900 leading-tight">{emp.name}</div>
            <div className="text-sm text-gray-500 mt-0.5">{emp.role ?? '—'}</div>
            <span
              className="inline-block text-white text-[10px] px-2 py-0.5 rounded-full mt-1.5 font-medium"
              style={{ backgroundColor: color }}
            >
              {emp.dept ?? 'Other'}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 text-lg leading-none shrink-0">✕</button>
        </div>

        {/* facts */}
        <div className="px-5 py-2">
          <DetailRow label="Status" value={emp.status} />
          <DetailRow label="Type" value={emp.type} />
          <DetailRow label="Location" value={[emp.location, emp.region].filter(Boolean).join(' · ') || null} />
          <DetailRow label="Joined" value={emp.joined ? `${new Date(emp.joined).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${tenure ? ` · ${tenure}` : ''}` : null} />
          <DetailRow label="Work mode" value={emp.wfo} />
          <DetailRow label="Phone" value={emp.phone} />
        </div>

        {/* reports to */}
        {manager && (
          <div className="px-5 pt-3 pb-1">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Reports to</div>
            <button
              onClick={() => onJump(manager)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-left"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: getDeptColor(manager.dept ?? 'Other') }}
              >
                {manager.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-800 truncate">{manager.name}</div>
                <div className="text-[11px] text-gray-400 truncate">{manager.role ?? '—'}</div>
              </div>
              <span className="text-gray-300 text-xs shrink-0">›</span>
            </button>
          </div>
        )}

        {/* direct reports */}
        {reports.length > 0 && (
          <div className="px-5 pt-3 pb-1">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Direct reports · {reports.length}
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {reports.map(r => (
                <button
                  key={r.id}
                  onClick={() => onJump(r)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-left"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ backgroundColor: getDeptColor(r.dept ?? 'Other') }}
                  >
                    {r.name.split(' ').slice(0, 2).map(w => w[0]).join('')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-gray-800 truncate">{r.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{r.role ?? '—'}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* footer */}
        <div className="p-5 pt-4">
          <a
            href={`/dossier?emp=${encodeURIComponent(emp.id)}`}
            className="block w-full text-center px-4 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            Open full profile in Dossier
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */
export default function OrgChartPage() {
  const [tree, setTree]       = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [deptGroups, setDeptGroups] = useState<Record<string, Employee[]>>({});
  const [all, setAll] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<Employee | null>(null);

  useEffect(() => {
    supabase
      .from('employees')
      .select('id,name,role,dept,manager,region,active,location,type,status,joined,wfo,phone')
      .eq('active', true)
        .in('status', ['Active', 'Contractor'])
      .then(({ data }) => {
        const employees = (data ?? []) as Employee[];
        setAll(employees);
        setTree(buildTree(employees));

        const groups: Record<string, Employee[]> = {};
        for (const e of employees) {
          const d = e.dept ?? 'Other';
          groups[d] = groups[d] ?? [];
          groups[d].push(e);
        }
        setDeptGroups(groups);
        setLoading(false);
      });
  }, []);

  const deptEntries = Object.entries(deptGroups).sort((a, b) => b[1].length - a[1].length);

  const managerOf = (e: Employee) =>
    all.find(x => x.name.trim().toLowerCase() === (e.manager ?? '').trim().toLowerCase()) ?? null;
  const reportsOf = (e: Employee) =>
    all.filter(x => (x.manager ?? '').trim().toLowerCase() === e.name.trim().toLowerCase())
       .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Org Chart</h1>
      <p className="text-sm text-gray-500 mb-2">
        Simpliigence reporting structure · Click a card for details, or the “direct” link to expand
      </p>
      <p className="text-xs text-gray-400 mb-8 bg-blue-50 rounded-lg px-3 py-2 inline-block">
        💡 Tree is built live from the manager field in the HR dossier. Contractors are collapsed under Manjunath.
      </p>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm animate-pulse">Loading org chart…</div>
      ) : tree ? (
        <div className="overflow-auto pb-8">
          <div className="inline-flex min-w-full justify-center">
            <OrgCtx.Provider value={{ onSelect: setSelected }}>
              <OrgBox node={tree} />
            </OrgCtx.Provider>
          </div>
        </div>
      ) : (
        <div className="text-gray-400 text-sm">No data found.</div>
      )}

      <hr className="my-8" />

      {/* Business units grid */}
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Business Units</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {deptEntries.map(([dept, emps]) => (
          <div key={dept} className="bg-white rounded-xl shadow-sm p-4 border-t-4" style={{ borderTopColor: getDeptColor(dept) }}>
            <div className="font-semibold text-sm text-gray-800 mb-1">{dept}</div>
            <div className="text-2xl font-bold" style={{ color: getDeptColor(dept) }}>{emps.length}</div>
            <div className="text-xs text-gray-400 mt-1">employees</div>
          </div>
        ))}
      </div>

      {selected && (
        <EmployeeDetail
          emp={selected}
          manager={managerOf(selected)}
          reports={reportsOf(selected)}
          onClose={() => setSelected(null)}
          onJump={e => setSelected(e)}
        />
      )}
    </div>
  );
}
