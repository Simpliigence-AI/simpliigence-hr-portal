'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Employee = {
  id: string; name: string; role: string | null; dept: string | null
  manager: string | null; region: string | null; type: string | null; joined?: string | null
}

type ReviewRow = {
  id: string; employee_id: string; review_month: string
  manager_name: string | null; targets: string | null; achievements: string | null
  composite_score: number | null; mood: string | null; created_at: string; review_template?: string | null
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const YEARS = [2024, 2025, 2026]

function monthKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}-01`
}
function fmtMonth(s: string) {
  const d = new Date(s + (s.length === 10 ? 'T00:00:00' : ''))
  return MONTHS[d.getMonth()] + ' ' + d.getFullYear()
}

export default function ReportsPage() {
  const now = new Date()
  const [tab, setTab] = useState<'status' | 'targets'>('status')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // Review status report state
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [monthReviews, setMonthReviews] = useState<ReviewRow[]>([])
  const [loadingMonth, setLoadingMonth] = useState(false)

  // Targets vs achieved report state
  const [taYear, setTaYear] = useState(now.getFullYear())
  const [taSearch, setTaSearch] = useState('')
  const [yearReviews, setYearReviews] = useState<ReviewRow[]>([])
  const [loadingYear, setLoadingYear] = useState(false)

  useEffect(() => {
        supabase.from('employees').select('id,name,role,dept,manager,region,type,joined')
            .eq('status', 'Active').order('name')
      .then(({ data }) => { setEmployees((data ?? []) as Employee[]); setLoading(false) })
  }, [])

  useEffect(() => {
    setLoadingMonth(true)
    supabase.from('monthly_reviews')
      .select('id,employee_id,review_month,manager_name,targets,achievements,composite_score,mood,created_at,review_template')
      .eq('review_month', monthKey(selYear, selMonth))
      .order('created_at', { ascending: false })
      .then(({ data }) => { setMonthReviews((data ?? []) as ReviewRow[]); setLoadingMonth(false) })
  }, [selMonth, selYear])

  useEffect(() => {
    setLoadingYear(true)
    supabase.from('monthly_reviews')
      .select('id,employee_id,review_month,manager_name,targets,achievements,composite_score,mood,created_at')
      .gte('review_month', `${taYear}-01-01`).lte('review_month', `${taYear}-12-31`)
      .order('review_month', { ascending: true })
      .then(({ data }) => { setYearReviews((data ?? []) as ReviewRow[]); setLoadingYear(false) })
  }, [taYear])

  const empById = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees])

  const reviewedIds = useMemo(() => new Set(monthReviews.map(r => r.employee_id)), [monthReviews])
  const detailedIds = useMemo(() => new Set(monthReviews.filter(r => r.review_template === 'detailed').map(r => r.employee_id)), [monthReviews])
  const standardIds = useMemo(() => new Set(monthReviews.filter(r => r.review_template !== 'detailed').map(r => r.employee_id)), [monthReviews])
  const cutoff = new Date(selYear, selMonth - 1, 1)
    cutoff.setMonth(cutoff.getMonth() - 1)
        const eligible = employees.filter(e => !e.joined || new Date(e.joined) <= cutoff)
    const completed = eligible.filter(e => reviewedIds.has(e.id))
    const outstanding = eligible.filter(e => !reviewedIds.has(e.id))
    const pct = eligible.length ? Math.round((completed.length / eligible.length) * 100) : 0

  const taGroups = useMemo(() => {
    const g: Record<string, ReviewRow[]> = {}
    for (const r of yearReviews) {
      if (!empById[r.employee_id]) continue
      ;(g[r.employee_id] = g[r.employee_id] ?? []).push(r)
    }
    return Object.entries(g)
      .map(([id, list]) => ({ emp: empById[id], list }))
      .filter(x => x.emp.name.toLowerCase().includes(taSearch.toLowerCase()))
      .sort((a, b) => a.emp.name.localeCompare(b.emp.name))
  }, [yearReviews, empById, taSearch])

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-400">Performance review reporting</p>
      </div>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('status')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'status' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
          Review Status by Month
        </button>
        <button onClick={() => setTab('targets')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'targets' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
          Targets vs Achieved
        </button>
      </div>

      {tab === 'status' && (
        <div>
          <div className="flex items-end gap-3 mb-5">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Month</label>
              <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))} className="px-3 py-2 text-sm border rounded-lg bg-white">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Year</label>
              <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} className="px-3 py-2 text-sm border rounded-lg bg-white">
                {YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3 mb-6">
            <div className="bg-white rounded-xl border p-4">
              <div className="text-2xl font-bold text-gray-900">{employees.length}</div>
              <div className="text-xs text-gray-400 mt-1">Active employees</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-2xl font-bold text-green-600">{detailedIds.size}</div>
              <div className="text-xs text-gray-400 mt-1">Detailed reviews</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-2xl font-bold text-blue-600">{standardIds.size}</div>
              <div className="text-xs text-gray-400 mt-1">Standard reviews</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className={`text-2xl font-bold ${outstanding.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{outstanding.length}</div>
              <div className="text-xs text-gray-400 mt-1">Outstanding</div>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <div className="text-2xl font-bold text-blue-600">{pct}%</div>
              <div className="text-xs text-gray-400 mt-1">Completion</div>
            </div>
          </div>

          {(loading || loadingMonth) ? <div className="text-sm text-gray-400">Loading…</div> : (
            <div className="grid grid-cols-2 gap-5">
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 bg-green-50 border-b flex items-center justify-between">
                  <span className="text-sm font-bold text-green-800">✓ Completed — {MONTHS[selMonth - 1]} {selYear}</span>
                  <span className="text-xs font-semibold text-green-700">{completed.length}</span>
                </div>
                <div className="max-h-[480px] overflow-y-auto divide-y">
                  {completed.length === 0 && <div className="px-4 py-6 text-sm text-gray-300 text-center">No reviews completed yet</div>}
                  {completed.map(e => {
                    const revs = monthReviews.filter(r => r.employee_id === e.id)
                    return (
                      <div key={e.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{e.name}</div>
                          <div className="text-xs text-gray-400 truncate">
                            {e.role ?? '—'}{revs[0]?.manager_name ? ' · by ' + revs[0].manager_name : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {revs.length > 1 && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{revs.length} reviews</span>}
                          {revs[0]?.composite_score != null && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${revs[0].composite_score >= 75 ? 'bg-green-100 text-green-700' : revs[0].composite_score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                              {revs[0].composite_score}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 bg-red-50 border-b flex items-center justify-between">
                  <span className="text-sm font-bold text-red-800">⚠ Outstanding — {MONTHS[selMonth - 1]} {selYear}</span>
                  <span className="text-xs font-semibold text-red-700">{outstanding.length}</span>
                </div>
                <div className="max-h-[480px] overflow-y-auto divide-y">
                  {outstanding.length === 0 && <div className="px-4 py-6 text-sm text-gray-300 text-center">All reviews done 🎉</div>}
                  {outstanding.map(e => (
                    <div key={e.id} className="px-4 py-2.5">
                      <div className="text-sm font-medium text-gray-900 truncate">{e.name}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {[e.role, e.dept, e.manager ? 'Mgr: ' + e.manager : null].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'targets' && (
        <div>
          <div className="flex items-end gap-3 mb-5">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Year</label>
              <select value={taYear} onChange={e => setTaYear(Number(e.target.value))} className="px-3 py-2 text-sm border rounded-lg bg-white">
                {YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex-1 max-w-xs">
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Employee</label>
              <input value={taSearch} onChange={e => setTaSearch(e.target.value)} placeholder="Search employees…" className="w-full px-3 py-2 text-sm border rounded-lg" />
            </div>
          </div>

          {(loading || loadingYear) ? <div className="text-sm text-gray-400">Loading…</div> :
            taGroups.length === 0 ? (
              <div className="text-center py-12 text-gray-300 text-sm">No reviews found for {taYear}</div>
            ) : (
              <div className="space-y-5">
                {taGroups.map(({ emp, list }) => (
                  <div key={emp.id} className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                      <div>
                        <span className="text-sm font-bold text-gray-900">{emp.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{emp.role ?? ''}</span>
                      </div>
                      <span className="text-xs text-gray-400">{list.length} review{list.length !== 1 ? 's' : ''} in {taYear}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 uppercase border-b">
                          <th className="px-4 py-2 font-semibold w-32">Month</th>
                          <th className="px-4 py-2 font-semibold w-[38%]">Targets</th>
                          <th className="px-4 py-2 font-semibold w-[38%]">Achieved</th>
                          <th className="px-4 py-2 font-semibold">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map(r => (
                          <tr key={r.id} className="border-b last:border-b-0 align-top">
                            <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">{fmtMonth(r.review_month)}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-pre-wrap">{r.targets || <span className="text-gray-300">No targets recorded</span>}</td>
                            <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-pre-wrap">{r.achievements || <span className="text-gray-300">No achievements recorded</span>}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {r.composite_score != null ? (
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.composite_score >= 75 ? 'bg-green-100 text-green-700' : r.composite_score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                  {r.composite_score}
                                </span>
                              ) : <span className="text-xs text-gray-300">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  )
}
