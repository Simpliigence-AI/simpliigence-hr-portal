'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type CertRow = {
  id: string
  employee_id: string
  cert_name: string
  issuer: string | null
  status: string | null
  issued_date: string | null
  expiry_date: string | null
  emp_name: string
  dept: string | null
  region: string | null
}

type GroupBy = 'type' | 'employee' | 'issuer' | 'status'

const GROUP_LABELS: Record<GroupBy, string> = {
  type: 'Certification Type',
  employee: 'Employee',
  issuer: 'Issuer',
  status: 'Status',
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Active':              { bg: 'bg-green-50 border-green-200',  text: 'text-green-700',  dot: 'bg-green-500'  },
  'Retired':             { bg: 'bg-gray-100 border-gray-200',   text: 'text-gray-500',   dot: 'bg-gray-400'   },
  'Maintenance Due':     { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
}

function colColor(label: string, idx: number) {
  const palette = [
    'bg-blue-50 border-blue-200',
    'bg-purple-50 border-purple-200',
    'bg-teal-50 border-teal-200',
    'bg-amber-50 border-amber-200',
    'bg-pink-50 border-pink-200',
    'bg-indigo-50 border-indigo-200',
    'bg-orange-50 border-orange-200',
    'bg-emerald-50 border-emerald-200',
  ]
  return palette[idx % palette.length]
}

function dotColor(idx: number) {
  const palette = ['bg-blue-500','bg-purple-500','bg-teal-500','bg-amber-500','bg-pink-500','bg-indigo-500','bg-orange-500','bg-emerald-500']
  return palette[idx % palette.length]
}

export default function CertificationsPage() {
  const [certs, setCerts] = useState<CertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState<GroupBy>('type')
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase
      .from('certifications')
      .select('id,employee_id,cert_name,issuer,status,issued_date,expiry_date,employees(name,dept,region)')
      .order('cert_name')
      .then(({ data }) => {
        const rows = (data ?? []).map((r: any) => ({
          ...r,
          emp_name: r.employees?.name ?? 'Unknown',
          dept:     r.employees?.dept ?? null,
          region:   r.employees?.region ?? null,
        }))
        setCerts(rows)
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return certs
    const q = search.toLowerCase()
    return certs.filter(c =>
      c.cert_name.toLowerCase().includes(q) ||
      c.emp_name.toLowerCase().includes(q) ||
      (c.issuer ?? '').toLowerCase().includes(q)
    )
  }, [certs, search])

  const groups = useMemo(() => {
    const map = new Map<string, CertRow[]>()
    filtered.forEach(c => {
      let key = ''
      if (groupBy === 'type')     key = c.cert_name
      if (groupBy === 'employee') key = c.emp_name
      if (groupBy === 'issuer')   key = c.issuer || 'Other'
      if (groupBy === 'status')   key = c.status || 'Active'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    })
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filtered, groupBy])

  // Summary stats
  const totalCerts     = certs.length
  const uniqueTypes    = new Set(certs.map(c => c.cert_name)).size
  const certifiedEmps  = new Set(certs.map(c => c.employee_id)).size
  const salesforceCerts = certs.filter(c => (c.issuer || '').toLowerCase().includes('salesforce')).length

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">

      {/* Header + controls */}
      <div className="bg-white border-b px-6 py-4 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Certifications</h1>
            <p className="text-sm text-gray-400 mt-0.5">Track and explore team certifications</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Total Certifications', value: totalCerts,     color: 'text-blue-600'   },
            { label: 'Unique Cert Types',    value: uniqueTypes,    color: 'text-purple-600' },
            { label: 'Certified Employees',  value: certifiedEmps,  color: 'text-teal-600'   },
            { label: 'Salesforce Certs',     value: salesforceCerts,color: 'text-orange-600' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Group by + search */}
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['type','employee','issuer','status'] as GroupBy[]).map(g => (
              <button key={g} onClick={() => setGroupBy(g)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${groupBy === g ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {GROUP_LABELS[g]}
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search certifications or employees…"
            className="flex-1 max-w-sm px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-gray-50" />
          <span className="text-xs text-gray-400 ml-auto">{groups.length} groups · {filtered.length} certs</span>
        </div>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-4 p-5 h-full" style={{ minWidth: 'max-content' }}>
            {groups.map(([label, items], idx) => {
              const statusC = STATUS_COLORS[label]
              const hdrClass = groupBy === 'status' && statusC ? statusC.bg : colColor(label, idx)
              const dotClass = groupBy === 'status' && statusC ? statusC.dot : dotColor(idx)
              return (
                <div key={label} className="flex flex-col w-[260px] shrink-0">
                  {/* Column header */}
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-3 ${hdrClass}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                    <span className="text-xs font-bold text-gray-700 truncate flex-1" title={label}>{label}</span>
                    <span className="text-xs font-bold text-gray-400 shrink-0 bg-white bg-opacity-60 px-2 py-0.5 rounded-full">{items.length}</span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-2 overflow-y-auto flex-1 pb-2">
                    {items.map(c => (
                      <div key={c.id} className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 hover:shadow-md transition-shadow cursor-default">
                        {groupBy === 'employee' ? (
                          <>
                            <div className="text-xs font-semibold text-gray-900 leading-snug mb-1">{c.cert_name}</div>
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <span className="text-xs text-gray-400">{c.issuer || '—'}</span>
                              {c.status && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${c.status === 'Active' ? 'bg-green-100 text-green-700' : c.status === 'Retired' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-xs font-semibold text-gray-900 leading-snug mb-1">{c.emp_name}</div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-400 truncate">{groupBy === 'type' ? (c.dept || c.region || '—') : c.cert_name}</span>
                              {c.status && <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${c.status === 'Active' ? 'bg-green-100 text-green-700' : c.status === 'Retired' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {groups.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">No certifications found</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
