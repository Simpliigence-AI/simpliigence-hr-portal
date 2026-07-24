'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type CertRow = {
id: string; employee_id: string; cert_name: string
issuer: string | null; status: string | null
issued_date: string | null; expiry_date: string | null
emp_name: string; dept: string | null; region: string | null
}
type Emp = { id: string; name: string }
type GroupBy = 'type' | 'employee' | 'issuer' | 'status'

const GROUP_LABELS: Record<GroupBy, string> = {
type: 'Cert Type', employee: 'Employee', issuer: 'Issuer', status: 'Status',
}

const PALETTE = [
'bg-blue-50 border-blue-200','bg-purple-50 border-purple-200',
'bg-teal-50 border-teal-200','bg-amber-50 border-amber-200',
'bg-pink-50 border-pink-200','bg-indigo-50 border-indigo-200',
'bg-orange-50 border-orange-200','bg-emerald-50 border-emerald-200',
]
const DOTS = ['bg-blue-500','bg-purple-500','bg-teal-500','bg-amber-500','bg-pink-500','bg-indigo-500','bg-orange-500','bg-emerald-500']

const STATUS_OPTS = ['Active','To Be Done','Maintenance Due','Retired']

function statusBadge(s: string | null) {
if (!s) return null
const cls =
s === 'Active' ? 'bg-green-100 text-green-700' :
s === 'To Be Done' ? 'bg-blue-100 text-blue-700' :
s === 'Retired' ? 'bg-gray-100 text-gray-500' :
'bg-amber-100 text-amber-700'
return <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${cls}`}>{s}</span>
}

export default function CertificationsPage() {
const [certs, setCerts] = useState<CertRow[]>([])
const [emps, setEmps] = useState<Emp[]>([])
const [loading, setLoading] = useState(true)
const [groupBy, setGroupBy] = useState<GroupBy>('type')
const [search, setSearch] = useState('')
const [showAdd, setShowAdd] = useState(false)
const [editing, setEditing] = useState<CertRow | null>(null)
const [saving, setSaving] = useState(false)
const [addErr, setAddErr] = useState('')
const [form, setForm] = useState({ employee_id: '', cert_name: '', issuer: 'Salesforce', status: 'Active', issued_date: '', expiry_date: '' })

const EMPTY_FORM = { employee_id: '', cert_name: '', issuer: 'Salesforce', status: 'Active', issued_date: '', expiry_date: '' }

function startAdd() {
	setEditing(null)
	setForm(EMPTY_FORM)
	setAddErr('')
	setShowAdd(true)
}

function startEdit(c: CertRow) {
	setEditing(c)
	setForm({
		employee_id: c.employee_id,
		cert_name: c.cert_name,
		issuer: c.issuer ?? '',
		status: c.status ?? 'Active',
		issued_date: c.issued_date ?? '',
		expiry_date: c.expiry_date ?? '',
	})
	setAddErr('')
	setShowAdd(true)
}

function closeForm() {
	setShowAdd(false)
	setEditing(null)
	setForm(EMPTY_FORM)
	setAddErr('')
}

function loadCerts() {
return supabase
.from('certifications')
.select('id,employee_id,cert_name,issuer,status,issued_date,expiry_date,employees(name,dept,region)')
.order('cert_name')
.then(({ data }) => {
const rows = (data ?? []).map((r: any) => ({
...r, emp_name: r.employees?.name ?? 'Unknown',
dept: r.employees?.dept ?? null, region: r.employees?.region ?? null,
}))
setCerts(rows)
setLoading(false)
})
}

useEffect(() => {
loadCerts()
supabase.from('employees').select('id,name').eq('active', true).order('name')
.then(({ data }) => setEmps((data ?? []) as Emp[]))
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
const key = groupBy === 'type' ? c.cert_name : groupBy === 'employee' ? c.emp_name : groupBy === 'issuer' ? (c.issuer || 'Other') : (c.status || 'Active')
if (!map.has(key)) map.set(key, [])
map.get(key)!.push(c)
})
return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
}, [filtered, groupBy])

async function saveCert() {
setAddErr('')
if (!form.employee_id) { setAddErr('Select an employee'); return }
if (!form.cert_name.trim()) { setAddErr('Enter certification name'); return }
setSaving(true)
const payload = {
employee_id: form.employee_id,
cert_name: form.cert_name.trim(),
issuer: form.issuer.trim() || null,
status: form.status || 'Active',
issued_date: form.issued_date || null,
expiry_date: form.expiry_date || null,
}
const { error } = editing
? await supabase.from('certifications').update(payload).eq('id', editing.id)
: await supabase.from('certifications').insert(payload)
setSaving(false)
if (error) { setAddErr(error.message); return }
closeForm()
setLoading(true)
loadCerts()
}

const totalCerts = certs.length
const uniqueTypes = new Set(certs.map(c => c.cert_name)).size
const certifiedEmps = new Set(certs.map(c => c.employee_id)).size
const sfCerts = certs.filter(c => (c.issuer || '').toLowerCase().includes('salesforce')).length

return (
<div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">

{/* Header */}
<div className="bg-white border-b px-6 py-4 shrink-0">
<div className="flex items-center justify-between mb-4">
<div>
<h1 className="text-xl font-bold text-gray-900">Certifications</h1>
<p className="text-sm text-gray-400 mt-0.5">Track and explore team certifications</p>
</div>
<button onClick={startAdd}
className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-semibold">
+ Add Certification
</button>
</div>

{/* Summary cards */}
<div className="grid grid-cols-4 gap-3 mb-4">
{[
{ label: 'Total Certifications', value: totalCerts, color: 'text-blue-600' },
{ label: 'Unique Cert Types', value: uniqueTypes, color: 'text-purple-600' },
{ label: 'Certified Employees', value: certifiedEmps, color: 'text-teal-600' },
{ label: 'Salesforce Certs', value: sfCerts, color: 'text-orange-600' },
].map(s => (
<div key={s.label} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
<div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
<div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
</div>
))}
</div>

{/* Controls */}
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
placeholder="ð Searchâ¦"
className="flex-1 max-w-sm px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-gray-50" />
<span className="text-xs text-gray-400 ml-auto">{groups.length} groups Â· {filtered.length} certs</span>
</div>
</div>

{/* Kanban */}
{loading ? (
<div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loadingâ¦</div>
) : (
<div className="flex-1 overflow-x-auto overflow-y-hidden">
<div className="flex gap-4 p-5 h-full" style={{ minWidth: 'max-content' }}>
{groups.map(([label, items], idx) => (
<div key={label} className="flex flex-col w-[260px] shrink-0">
<div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-3 ${PALETTE[idx % PALETTE.length]}`}>
<div className={`w-2 h-2 rounded-full shrink-0 ${DOTS[idx % DOTS.length]}`} />
<span className="text-xs font-bold text-gray-700 truncate flex-1" title={label}>{label}</span>
<span className="text-xs font-bold text-gray-400 shrink-0 bg-white bg-opacity-60 px-2 py-0.5 rounded-full">{items.length}</span>
</div>
<div className="flex flex-col gap-2 overflow-y-auto flex-1 pb-2">
{items.map(c => (
<div key={c.id} className="group bg-white rounded-xl border border-gray-200 px-3 py-2.5 hover:shadow-md transition-shadow">
<div className="flex items-start justify-between gap-1 mb-1">
<div className="text-xs font-semibold text-gray-900 leading-snug">
{groupBy === 'employee' ? c.cert_name : c.emp_name}
</div>
<button onClick={() => startEdit(c)} title="Edit certification"
className="text-xs text-blue-500 hover:underline opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
Edit
</button>
</div>
<div className="flex items-center justify-between gap-1">
<span className="text-xs text-gray-400 truncate">
{groupBy === 'type' ? (c.dept || c.region || 'â') : groupBy === 'employee' ? (c.issuer || 'â') : c.cert_name}
</span>
{statusBadge(c.status)}
</div>
</div>
))}
</div>
</div>
))}
{groups.length === 0 && (
<div className="flex-1 flex items-center justify-center text-gray-300 text-sm">No certifications found</div>
)}
</div>
</div>
)}

{/* Add Certification Modal */}
{showAdd && (
<div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50" onClick={e => e.target === e.currentTarget && closeForm()}>
<div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
<div className="flex items-center justify-between mb-5">
<h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Certification' : 'Add Certification'}</h2>
<button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl">â</button>
</div>

<div className="space-y-4">
<div>
<label className="text-xs font-semibold text-gray-500 mb-1 block">Employee <span className="text-red-500">*</span></label>
<select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
<option value="">Select employeeâ¦</option>
{emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
</select>
</div>
<div>
<label className="text-xs font-semibold text-gray-500 mb-1 block">Certification Name <span className="text-red-500">*</span></label>
<input value={form.cert_name} onChange={e => setForm(f => ({ ...f, cert_name: e.target.value }))}
placeholder="e.g. Salesforce Certified Platform Administrator"
className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
</div>
<div className="grid grid-cols-2 gap-3">
<div>
<label className="text-xs font-semibold text-gray-500 mb-1 block">Issuer</label>
<input value={form.issuer} onChange={e => setForm(f => ({ ...f, issuer: e.target.value }))}
placeholder="e.g. Salesforce"
className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
</div>
<div>
<label className="text-xs font-semibold text-gray-500 mb-1 block">Status</label>
<select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
{STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
</select>
</div>
</div>
<div className="grid grid-cols-2 gap-3">
<div>
<label className="text-xs font-semibold text-gray-500 mb-1 block">Issued Date</label>
<input type="date" value={form.issued_date} onChange={e => setForm(f => ({ ...f, issued_date: e.target.value }))}
className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
</div>
<div>
<label className="text-xs font-semibold text-gray-500 mb-1 block">Expiry Date</label>
<input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
</div>
</div>
</div>

{addErr && <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{addErr}</div>}

<div className="flex gap-3 mt-5">
<button onClick={closeForm}
className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
<button onClick={saveCert} disabled={saving}
className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
{saving ? 'Savingâ¦' : editing ? 'Save changes' : 'Add Certification'}
</button>
</div>
</div>
</div>
)}
</div>
)
}
