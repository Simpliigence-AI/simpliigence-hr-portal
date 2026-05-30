'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getDeptColor } from '@/lib/utils';

interface Employee {
  id: string; name: string; role?: string|null; dept?: string|null;
  manager?: string|null; region?: string|null; active?: boolean|null;
  location?: string|null; type?: string|null;
}

interface TreeNode {
  emp: Employee;
  children: TreeNode[];
  contractorGroup?: { count: number; names: string[] }; // collapsed contractor block
}

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
  const color = getDeptColor(node.emp.dept ?? 'Other');
  const initials = node.emp.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('');
  const hasChildren = node.children.length > 0 || !!node.contractorGroup;

  return (
    <div className="flex flex-col items-center">
      <div
        className={`bg-white border rounded-xl p-3 shadow-sm text-center min-w-36 max-w-44 ${hasChildren ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
        style={{ borderTopWidth: 4, borderTopColor: color }}
        onClick={() => hasChildren && setOpen(o => !o)}
        title={hasChildren ? (open ? 'Collapse' : 'Expand') : undefined}
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
          <div className="text-xs text-gray-400 mt-1">{open ? '▲' : '▼'} {node.children.length + (node.contractorGroup ? 1 : 0)} direct</div>
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

/* ── Page ─────────────────────────────────────────────────────────── */
export default function OrgChartPage() {
  const [tree, setTree]       = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [deptGroups, setDeptGroups] = useState<Record<string, Employee[]>>({});

  useEffect(() => {
    supabase
      .from('employees')
      .select('id,name,role,dept,manager,region,active,location,type,status')
      .eq('active', true)
        .in('status', ['Active', 'Contractor'])
      .then(({ data }) => {
        const employees = (data ?? []) as Employee[];
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Org Chart</h1>
      <p className="text-sm text-gray-500 mb-2">
        Simpliigence reporting structure · Click any node to expand / collapse
      </p>
      <p className="text-xs text-gray-400 mb-8 bg-blue-50 rounded-lg px-3 py-2 inline-block">
        💡 Tree is built live from the manager field in the HR dossier. Contractors are collapsed under Manjunath.
      </p>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 text-sm animate-pulse">Loading org chart…</div>
      ) : tree ? (
        <div className="overflow-auto pb-8">
          <div className="inline-flex min-w-full justify-center">
            <OrgBox node={tree} />
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
    </div>
  );
}
