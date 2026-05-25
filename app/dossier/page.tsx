'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { Employee } from '@/lib/database.types';
import { formatDate, getDeptColor, cn } from '@/lib/utils';
import Avatar from '@/components/Avatar';

// ─── Constants ───────────────────────────────────────────────
const DEPTS     = ['Delivery','HR','Finance','Sales','Marketing','Operations','Talent Mgmt','Leadership'];
const WFO_OPTS  = ['WFH','WFO','Hybrid'];
const BGV_OPTS  = ['Verified','Pending','N/A','I-9'];
const STATUS_OPTS = ['Active','Ex-Employee','Contractor'];
const DOC_TYPES = ['Offer Letter','Employment Contract','BGV Report','ID Proof','Visa Document','SOW','NDA','Other'];
const MODAL_TABS = ['Profile','Documents','Targets','Above & Beyond','Certifications'] as const;
type ModalTab = typeof MODAL_TABS[number];

interface EmployeeDoc {
  id: string; employee_id: string; name: string; doc_type: string | null;
  url: string | null; sharepoint_url: string | null; uploaded_by: string | null; created_at: string;
}

// ─── Tenure calculation ───────────────────────────────────────
function calcTenure(joined: string | null, terminated: string | null): string {
  if (!joined) return '—';
  const start = new Date(joined);
  const end   = terminated ? new Date(terminated) : new Date();
  const ms    = end.getTime() - start.getTime();
  if (ms < 0) return '—';
  const totalMonths = Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44));
  const years  = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} mo`;
  if (months === 0) return `${years} yr${years > 1 ? 's' : ''}`;
  return `${years} yr${years > 1 ? 's' : ''} ${months} mo`;
}

function statusBadge(emp: { status?: string; type?: string | null; termination_date?: string | null }) {
  const status = emp.termination_date ? 'Ex-Employee' : (emp.status ?? (emp.type === 'Contractor' ? 'Contractor' : 'Active'));
  const styles: Record<string, string> = {
    'Active':       'bg-green-100 text-green-700',
    'Ex-Employee':  'bg-red-100 text-red-700',
    'Contractor':   'bg-orange-100 text-orange-700',
  };
  return { label: status, cls: styles[status] ?? 'bg-gray-100 text-gray-600' };
}

// ─── Main Page ────────────────────────────────────────────────
export default function DossierPage() {
  const [employees,  setEmployees]  = useState<Employee[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [deptF,      setDeptF]      = useState('All');
  const [regionF,    setRegionF]    = useState('All');
  const [statusF,    setStatusF]    = useState('All');
  const [selected,   setSelected]   = useState<Employee | null>(null);
  const [modalTab,   setModalTab]   = useState<ModalTab>('Profile');
  const [editing,    setEditing]    = useState(false);
  const [editForm,   setEditForm]   = useState<Partial<Employee & { termination_date: string; status: string; sharepoint_url: string }>>({});
  const [saving,     setSaving]     = useState(false);
  const [editError,  setEditError]  = useState('');
  const [revealed,   setRevealed]   = useState<Record<string, boolean>>({});
  const [view,       setView]       = useState<'grid' | 'list'>('grid');
  const [docs,       setDocs]       = useState<EmployeeDoc[]>([]);
  const [docsLoading,setDocsLoading]= useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [abEntries,  setAbEntries]  = useState<{id:string;category:string;description:string;client_project:string|null;recorded_by:string|null;recorded_date:string;points:number|null}[]>([]);
  const [abLoading,  setAbLoading]  = useState(false);
  const [empCerts,   setEmpCerts]   = useState<{id:string;cert_name:string;issuer:string|null;issued_date:string|null;expiry_date:string|null}[]>([]);
  const [certsLoading,setCertsLoading] = useState(false);
  const [empTargets,  setEmpTargets]  = useState<string>('');
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsSaving,  setTargetsSaving]  = useState(false);
  const [targetsDraft,   setTargetsDraft]   = useState<string>('');
  const [targetsUpdatedBy, setTargetsUpdatedBy] = useState<string>('');
  const [targetsUpdatedAt, setTargetsUpdatedAt] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [newDocForm, setNewDocForm] = useState({ name: '', doc_type: 'Other', sharepoint_url: '' });
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('employees').select('*').order('name')
      .then(({ data }) => { setEmployees(data ?? []); setLoading(false); });
  }, []);

  // Load docs / A&B / certs / targets when opening tabs
  useEffect(() => {
    if (!selected) return;
    if (modalTab === 'Documents')       loadDocs(selected.id);
    if (modalTab === 'Above & Beyond')  loadAbEntries(selected.id);
    if (modalTab === 'Certifications')  loadEmpCerts(selected.id);
    if (modalTab === 'Targets')         loadTargets(selected.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, modalTab]);

  async function loadAbEntries(empId: string) {
    setAbLoading(true);
    const { data } = await supabase.from('above_beyond').select('id,category,description,client_project,recorded_by,recorded_date,points').eq('employee_id', empId).order('recorded_date', { ascending: false });
    setAbEntries(data ?? []);
    setAbLoading(false);
  }

  async function loadEmpCerts(empId: string) {
    setCertsLoading(true);
    const { data } = await supabase.from('certifications').select('id,cert_name,issuer,issued_date,expiry_date').eq('employee_id', empId).order('issued_date', { ascending: false });
    setEmpCerts(data ?? []);
    setCertsLoading(false);
  }

  async function loadTargets(empId: string) {
    setTargetsLoading(true);
    const { data } = await supabase.from('employee_targets').select('default_targets,updated_by,updated_at').eq('employee_id', empId).maybeSingle();
    const t = data?.default_targets ?? '';
    setEmpTargets(t);
    setTargetsDraft(t);
    setTargetsUpdatedBy(data?.updated_by ?? '');
    setTargetsUpdatedAt(data?.updated_at ?? null);
    setTargetsLoading(false);
  }

  async function saveTargets() {
    if (!selected) return;
    setTargetsSaving(true);
    await supabase.from('employee_targets').upsert({
      employee_id:     selected.id,
      default_targets: targetsDraft,
      updated_by:      targetsUpdatedBy || null,
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'employee_id' });
    setEmpTargets(targetsDraft);
    setTargetsUpdatedAt(new Date().toISOString());
    setTargetsSaving(false);
  }

  async function loadDocs(empId: string) {
    setDocsLoading(true);
    const { data } = await supabase.from('employee_documents').select('*').eq('employee_id', empId).order('created_at', { ascending: false });
    setDocs(data ?? []);
    setDocsLoading(false);
  }

  // ── Filters ──────────────────────────────────────────────────
  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    if (q && !e.name.toLowerCase().includes(q) && !e.role?.toLowerCase().includes(q) && !e.location?.toLowerCase().includes(q)) return false;
    if (deptF !== 'All' && e.dept !== deptF) return false;
    if (regionF !== 'All' && e.region !== regionF) return false;
    if (statusF !== 'All') {
      const { label } = statusBadge(e as never);
      if (label !== statusF) return false;
    }
    return true;
  });

  // ── Photo upload ──────────────────────────────────────────────
  async function uploadPhoto(file: File) {
    if (!selected) return;
    setPhotoUploading(true);
    const ext  = file.name.split('.').pop();
    const path = `${selected.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from('employee-photos').upload(path, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('employee-photos').getPublicUrl(path);
      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;
      const { data } = await supabase.from('employees').update({ photo_url: urlWithCacheBust }).eq('id', selected.id).select().single();
      if (data) {
        setEmployees(es => es.map(e => e.id === data.id ? data : e));
        setSelected(data);
      }
    }
    setPhotoUploading(false);
  }

  // ── Document upload ───────────────────────────────────────────
  async function uploadDoc(file: File) {
    if (!selected) return;
    setUploading(true);
    const path = `${selected.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('employee-documents').upload(path, file);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('employee-documents').getPublicUrl(path);
      const row = { employee_id: selected.id, name: file.name, doc_type: newDocForm.doc_type, url: publicUrl, sharepoint_url: null };
      const { data } = await supabase.from('employee_documents').insert(row).select().single();
      if (data) setDocs(d => [data, ...d]);
    }
    setUploading(false);
  }

  async function addSharePointLink() {
    if (!selected || !newDocForm.sharepoint_url || !newDocForm.name) return;
    const row = { employee_id: selected.id, name: newDocForm.name, doc_type: newDocForm.doc_type, url: null, sharepoint_url: newDocForm.sharepoint_url };
    const { data } = await supabase.from('employee_documents').insert(row).select().single();
    if (data) { setDocs(d => [data, ...d]); setNewDocForm({ name: '', doc_type: 'Other', sharepoint_url: '' }); }
  }

  async function deleteDoc(docId: string, url: string | null) {
    await supabase.from('employee_documents').delete().eq('id', docId);
    if (url) {
      const path = url.split('/employee-documents/')[1];
      if (path) await supabase.storage.from('employee-documents').remove([path]);
    }
    setDocs(d => d.filter(x => x.id !== docId));
  }

  // ── Edit helpers ──────────────────────────────────────────────
  function openProfile(emp: Employee) { setSelected(emp); setEditing(false); setModalTab('Profile'); }
  function startEdit()  { setEditForm({ ...selected } as never); setEditing(true); }
  function cancelEdit() { setEditing(false); setEditForm({}); setEditError(''); }

  async function saveEdit() {
    if (!selected) return;
    setEditError('');
    // Required field validation
    const missing: string[] = [];
    if (!editForm.role?.toString().trim())     missing.push('Role / Title');
    if (!(editForm as never as {dept:string}).dept?.toString().trim()) missing.push('Department');
    if (!editForm.location?.toString().trim()) missing.push('Location');
    if (!editForm.manager?.toString().trim())  missing.push('Manager');
    if (missing.length > 0) {
      setEditError(`Required fields missing: ${missing.join(', ')}`);
      return;
    }
    setSaving(true);
    const { data } = await supabase.from('employees').update(editForm).eq('id', selected.id).select().single();
    if (data) { setEmployees(es => es.map(e => e.id === data.id ? data : e)); setSelected(data); setEditing(false); }
    setSaving(false);
  }

  const toggle = (k: string) => setRevealed(r => ({ ...r, [k]: !r[k] }));
  const F = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEditForm(f => ({ ...f, [key]: e.target.value || null }));

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading employees…</div>;

  // ── Counts for chips ───────────────────────────────────────────
  const isContractor = (e: Employee) => (e as never as {type:string}).type === 'Contractor' || e.status === 'Contractor';
  const isEx         = (e: Employee) => !!(e as never as {termination_date:string|null}).termination_date || e.status === 'Ex-Employee';
  const isActiveFTE  = (e: Employee) => !isEx(e) && !isContractor(e);

  const counts = {
    all:         employees.length,
    activeFTE:   employees.filter(isActiveFTE).length,
    contractor:  employees.filter(isContractor).length,
    exEmployee:  employees.filter(isEx).length,
    india:       employees.filter(e => e.region === 'India').length,
    usa:         employees.filter(e => e.region === 'USA').length,
    canada:      employees.filter(e => e.region === 'Canada').length,
  };

  const STATUS_CHIPS = [
    { label: 'All',          value: 'All',          color: 'bg-gray-800 text-white',           inactive: 'bg-white text-gray-600 border-gray-200', count: counts.all },
    { label: 'Active FTEs',  value: 'Active',        color: 'bg-green-600 text-white',          inactive: 'bg-white text-green-700 border-green-200', count: counts.activeFTE },
    { label: 'Contractors',  value: 'Contractor',    color: 'bg-orange-500 text-white',         inactive: 'bg-white text-orange-600 border-orange-200', count: counts.contractor },
    { label: 'Ex-Employees', value: 'Ex-Employee',   color: 'bg-red-500 text-white',            inactive: 'bg-white text-red-600 border-red-200', count: counts.exEmployee },
  ];

  const REGION_CHIPS = [
    { label: 'All Regions', value: 'All',    flag: '🌍', count: counts.all },
    { label: 'India',       value: 'India',  flag: '🇮🇳', count: counts.india },
    { label: 'USA',         value: 'USA',    flag: '🇺🇸', count: counts.usa },
    ...(counts.canada > 0 ? [{ label: 'Canada', value: 'Canada', flag: '🇨🇦', count: counts.canada }] : []),
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Dossier</h1>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} of {employees.length} employees shown</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('grid')} className={cn('px-3 py-1.5 text-sm rounded-lg border', view==='grid' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600')}>Grid</button>
          <button onClick={() => setView('list')} className={cn('px-3 py-1.5 text-sm rounded-lg border', view==='list' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600')}>List</button>
        </div>
      </div>

      {/* Quick filters */}
      <div className="space-y-3 mb-5">
        {/* Status chips */}
        <div className="flex flex-wrap gap-2">
          {STATUS_CHIPS.map(chip => (
            <button key={chip.value} onClick={() => setStatusF(chip.value)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                statusF === chip.value ? chip.color + ' border-transparent shadow-sm' : chip.inactive)}>
              {chip.label}
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-bold',
                statusF === chip.value ? 'bg-white/25' : 'bg-gray-100 text-gray-500')}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>
        {/* Region chips */}
        <div className="flex flex-wrap gap-2">
          {REGION_CHIPS.map(chip => (
            <button key={chip.value} onClick={() => setRegionF(chip.value)}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                regionF === chip.value
                  ? 'bg-blue-600 text-white border-transparent shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300')}>
              <span>{chip.flag}</span>
              {chip.label}
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-bold',
                regionF === chip.value ? 'bg-white/25' : 'bg-gray-100 text-gray-500')}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>
        {/* Search + dept */}
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search name, role, location…"
            className="flex-1 min-w-48 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
          <select value={deptF} onChange={e => setDeptF(e.target.value)}
            className="px-3 py-2 text-sm border rounded-lg bg-white focus:ring-2 focus:ring-blue-400">
            {['All', ...DEPTS].map(o => <option key={o}>{o === 'All' ? 'All Departments' : o}</option>)}
          </select>
          {(search || deptF !== 'All' || statusF !== 'All' || regionF !== 'All') && (
            <button onClick={() => { setSearch(''); setDeptF('All'); setStatusF('All'); setRegionF('All'); }}
              className="px-3 py-2 text-sm text-blue-600 hover:underline">Clear all</button>
          )}
        </div>
      </div>

      {/* Grid */}
      {view === 'grid' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(e => {
            const { label, cls } = statusBadge(e as never);
            const isC = isContractor(e);
            const isE = isEx(e);
            const regionFlag = e.region === 'India' ? '🇮🇳' : e.region === 'USA' ? '🇺🇸' : e.region === 'Canada' ? '🇨🇦' : '';
            return (
              <div key={e.id} onClick={() => openProfile(e)}
                className={cn('bg-white rounded-xl shadow-sm border p-4 cursor-pointer hover:shadow-md transition-all',
                  isE  ? 'opacity-55 border-red-200 bg-red-50/30' :
                  isC  ? 'border-orange-300 bg-orange-50/30 hover:border-orange-400' :
                         'border-gray-100 hover:border-blue-200')}>
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="relative">
                    <Avatar name={e.name} photoUrl={e.photo_url} size="lg" />
                    {isE && <div className="absolute inset-0 rounded-full bg-red-500/20 flex items-center justify-center"><span className="text-xs text-red-600 font-bold">EX</span></div>}
                    {isC && !isE && <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center border-2 border-white"><span className="text-white text-[9px] font-black">C</span></div>}
                  </div>
                  <div>
                    <div className="font-semibold text-sm leading-tight">{e.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{e.role}</div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-center">
                    <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: getDeptColor(e.dept ?? '') }}>{e.dept}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', cls)}>{label}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    {regionFlag && <span>{regionFlag}</span>}
                    <span>{e.location}</span>
                  </div>
                  <div className="text-xs font-medium text-blue-600">{calcTenure(e.joined, (e as never as {termination_date:string|null}).termination_date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List */}
      {view === 'list' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Employee','Role','Department','Region','Manager','Type','Status','Tenure'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(e => {
                const { label, cls } = statusBadge(e as never);
                const isC = isContractor(e);
                const regionFlag = e.region === 'India' ? '🇮🇳' : e.region === 'USA' ? '🇺🇸' : e.region === 'Canada' ? '🇨🇦' : '';
                return (
                  <tr key={e.id} onClick={() => openProfile(e)}
                    className={cn('cursor-pointer transition-colors',
                      isC ? 'bg-orange-50/40 hover:bg-orange-50' : 'hover:bg-blue-50')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="relative shrink-0">
                          <Avatar name={e.name} photoUrl={e.photo_url} size="sm" />
                          {isC && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center border border-white"><span className="text-white text-[8px] font-black">C</span></div>}
                        </div>
                        <span className="font-medium">{e.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{e.role}</td>
                    <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: getDeptColor(e.dept ?? '') }}>{e.dept}</span></td>
                    <td className="px-4 py-3 text-sm">
                      <span>{regionFlag} </span>
                      <span className="text-gray-600 text-xs">{e.location}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{e.manager ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                        isC ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700')}>
                        {isC ? 'Contractor' : 'FTE'}
                      </span>
                    </td>
                    <td className="px-4 py-3"><span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', cls)}>{label}</span></td>
                    <td className="px-4 py-3 text-blue-600 font-medium text-xs">{calcTenure(e.joined, (e as never as {termination_date:string|null}).termination_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PROFILE MODAL ── */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setSelected(null); setEditing(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div className="p-5 border-b flex items-start gap-4 shrink-0">
              {/* Avatar with photo upload */}
              <div className="relative group cursor-pointer" onClick={() => !editing && photoRef.current?.click()}>
                <Avatar name={selected.name} photoUrl={selected.photo_url} size="lg" />
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {photoUploading ? <span className="text-white text-xs">⏳</span> : <span className="text-white text-xs">📷</span>}
                </div>
                <input ref={photoRef} type="file" accept="image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold">{selected.name}</h2>
                <p className="text-gray-500 text-sm">{selected.role} · {selected.dept}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(() => { const { label, cls } = statusBadge(selected as never); return <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', cls)}>{label}</span>; })()}
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{selected.type}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{selected.wfo}</span>
                  {selected.bgv && <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">BGV: {selected.bgv}</span>}
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">
                    ⏱ {calcTenure(selected.joined, (selected as never as {termination_date:string|null}).termination_date)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Hover avatar to change photo</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!editing && modalTab === 'Profile' && (
                  <button onClick={startEdit} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">✏️ Edit</button>
                )}
                <button onClick={() => { setSelected(null); setEditing(false); }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
            </div>

            {/* Tab bar */}
            {!editing && (
              <div className="flex border-b shrink-0">
                {MODAL_TABS.map(t => (
                  <button key={t} onClick={() => setModalTab(t)}
                    className={cn('px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                      modalTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                    {t === 'Profile'        ? '👤 Profile'
                   : t === 'Documents'      ? '📎 Documents'
                   : t === 'Targets'        ? '🎯 Targets'
                   : t === 'Above & Beyond' ? '⭐ Above & Beyond'
                   : t === 'Certifications' ? '🏅 Certifications'
                   : t}
                  </button>
                ))}
              </div>
            )}

            {/* Scrollable body */}
            <div className="overflow-auto flex-1">

              {/* ── PROFILE TAB (view) ── */}
              {!editing && modalTab === 'Profile' && (
                <div className="p-6 grid sm:grid-cols-2 gap-6">
                  <Section title="Employment">
                    <Row label="Employee ID" value={selected.id} />
                    <Row label="Location"    value={selected.location} />
                    <Row label="Region"      value={selected.region} />
                    <Row label="Manager"     value={selected.manager} />
                    <Row label="Join Date"   value={formatDate(selected.joined)} />
                    <Row label="Tenure"      value={calcTenure(selected.joined, (selected as never as {termination_date:string|null}).termination_date)} highlight="blue" />
                    {(selected as never as {termination_date:string|null}).termination_date &&
                      <Row label="Last Working Day" value={formatDate((selected as never as {termination_date:string|null}).termination_date)} highlight="red" />}
                  </Section>

                  <Section title="Visa & Compliance">
                    <Row label="Visa"        value={selected.visa} />
                    <Row label="Visa Expiry" value={formatDate(selected.visa_expiry)}
                      highlight={selected.visa_expiry && new Date(selected.visa_expiry) < new Date(Date.now()+90*86400000) ? 'red' : undefined} />
                    <Row label="BGV"         value={selected.bgv} />
                    <Row label="SOW"         value={selected.sow} />
                    <Row label="SOW Expiry"  value={formatDate(selected.sow_expiry)} />
                    {(selected as never as {sharepoint_url:string|null}).sharepoint_url && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">SharePoint</span>
                        <a href={(selected as never as {sharepoint_url:string}).sharepoint_url} target="_blank" rel="noreferrer"
                          className="text-blue-600 hover:underline text-xs">Open folder ↗</a>
                      </div>
                    )}
                  </Section>

                  <Section title="Contact (click to reveal)">
                    <SensRow label="Phone"     value={selected.phone}     k={`${selected.id}-phone`}     revealed={revealed} toggle={toggle} />
                    <SensRow label="Emergency" value={selected.emergency} k={`${selected.id}-emergency`} revealed={revealed} toggle={toggle} />
                  </Section>

                  <Section title="Compensation (click to reveal)">
                    <SensRow label="Salary (₹/mo)"  value={selected.salary ? Number(selected.salary).toLocaleString('en-IN') : null} k={`${selected.id}-salary`}    revealed={revealed} toggle={toggle} />
                    <SensRow label="Hike"            value={selected.hike ? `${selected.hike}%` : null}                              k={`${selected.id}-hike`}      revealed={revealed} toggle={toggle} />
                    <SensRow label="Last Appraisal"  value={selected.appraisal}                                                      k={`${selected.id}-appraisal`} revealed={revealed} toggle={toggle} />
                  </Section>

                  {selected.skills?.length > 0 && (
                    <Section title="Skills">
                      <div className="flex flex-wrap gap-1.5">
                        {selected.skills.map(s => <span key={s} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">{s}</span>)}
                      </div>
                    </Section>
                  )}

                  {selected.check_in && (
                    <Section title="Manager Notes" className="sm:col-span-2">
                      <p className="text-sm text-gray-700 leading-relaxed">{selected.check_in}</p>
                    </Section>
                  )}
                </div>
              )}

              {/* ── EDIT MODE ── */}
              {editing && (
                <div className="p-6 space-y-4">
                  <p className="text-xs bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-gray-600">
                    ✏️ Editing <strong>{selected.name}</strong> — saves directly to database. Fields marked <span className="text-red-500 font-bold">*</span> are required.
                  </p>
                  {editError && (
                    <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {editError}</div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <EField label="Full Name"      k="name"             editForm={editForm} F={F} />
                    <EField label="Role / Title"   k="role"             editForm={editForm} F={F} required />
                    <EField label="Location"       k="location"         editForm={editForm} F={F} required />
                    <EField label="Manager"        k="manager"          editForm={editForm} F={F} required />
                    <EField label="Join Date"      k="joined"           editForm={editForm} F={F} type="date" />
                    <EField label="Last Working Day (termination)" k="termination_date" editForm={editForm} F={F} type="date" />
                    <EField label="Phone"          k="phone"            editForm={editForm} F={F} />
                    <EField label="Emergency"      k="emergency"        editForm={editForm} F={F} />
                    <EField label="Salary (₹/mo)"  k="salary"           editForm={editForm} F={F} type="number" />
                    <EField label="Hike %"         k="hike"             editForm={editForm} F={F} type="number" />
                    <EField label="Appraisal"      k="appraisal"        editForm={editForm} F={F} />
                    <EField label="Visa Type"      k="visa"             editForm={editForm} F={F} />
                    <EField label="Visa Expiry"    k="visa_expiry"      editForm={editForm} F={F} type="date" />
                    <EField label="SOW"            k="sow"              editForm={editForm} F={F} />
                    <EField label="SOW Expiry"     k="sow_expiry"       editForm={editForm} F={F} type="date" />
                    <EField label="SharePoint Folder URL" k="sharepoint_url" editForm={editForm} F={F} />

                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Department <span className="text-red-500">*</span></label>
                      <select value={(editForm as never as {dept:string}).dept ?? ''} onChange={F('dept')}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400">
                        {DEPTS.map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Work Mode</label>
                      <select value={(editForm as never as {wfo:string}).wfo ?? ''} onChange={F('wfo')}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400">
                        {WFO_OPTS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">BGV Status</label>
                      <select value={(editForm as never as {bgv:string}).bgv ?? ''} onChange={F('bgv')}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400">
                        {BGV_OPTS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Employment Status</label>
                      <select value={(editForm as never as {status:string}).status ?? 'Active'} onChange={F('status')}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400">
                        {STATUS_OPTS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Skills (comma-separated)</label>
                    <input value={(editForm.skills ?? []).join(', ')}
                      onChange={e => setEditForm(f => ({ ...f, skills: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) }))}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Manager Check-in Notes</label>
                    <textarea rows={3} value={(editForm as never as {check_in:string}).check_in ?? ''} onChange={F('check_in')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 resize-none" />
                  </div>

                  <div className="flex gap-3 pt-1">
                    <button onClick={saveEdit} disabled={saving}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 font-medium">
                      {saving ? 'Saving…' : '✓ Save Changes'}
                    </button>
                    <button onClick={cancelEdit} className="px-5 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}

              {/* ── DOCUMENTS TAB ── */}
              {!editing && modalTab === 'Documents' && (
                <div className="p-6 space-y-5">
                  {/* Upload file */}
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center hover:border-blue-300 transition-colors">
                    <div className="text-3xl mb-2">📄</div>
                    <p className="text-sm text-gray-500 mb-3">Upload a document directly to Supabase Storage</p>
                    <div className="flex justify-center gap-3 flex-wrap mb-3">
                      <select value={newDocForm.doc_type} onChange={e => setNewDocForm(f => ({ ...f, doc_type: e.target.value }))}
                        className="px-3 py-1.5 text-sm border rounded-lg bg-white">
                        {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <button onClick={() => docRef.current?.click()} disabled={uploading}
                        className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {uploading ? 'Uploading…' : '⬆ Upload File'}
                      </button>
                    </div>
                    <input ref={docRef} type="file" className="hidden"
                      onChange={e => e.target.files?.[0] && uploadDoc(e.target.files[0])} />
                  </div>

                  {/* SharePoint link */}
                  <div className="bg-blue-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-blue-700 mb-2">🔗 Link a SharePoint Document / Folder</p>
                    <div className="space-y-2">
                      <input placeholder="Document name" value={newDocForm.name}
                        onChange={e => setNewDocForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                      <input placeholder="SharePoint URL (https://simpliigence.sharepoint.com/…)" value={newDocForm.sharepoint_url}
                        onChange={e => setNewDocForm(f => ({ ...f, sharepoint_url: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                      <div className="flex gap-2">
                        <select value={newDocForm.doc_type} onChange={e => setNewDocForm(f => ({ ...f, doc_type: e.target.value }))}
                          className="px-3 py-2 text-sm border rounded-lg bg-white">
                          {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                        <button onClick={addSharePointLink} disabled={!newDocForm.name || !newDocForm.sharepoint_url}
                          className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          Add Link
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Document list */}
                  {docsLoading ? (
                    <div className="text-center text-gray-400 text-sm py-4">Loading documents…</div>
                  ) : docs.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-4">No documents yet. Upload a file or link a SharePoint folder above.</div>
                  ) : (
                    <div className="space-y-2">
                      {docs.map(doc => (
                        <div key={doc.id} className="flex items-center gap-3 bg-white border rounded-xl p-3">
                          <span className="text-xl">
                            {doc.sharepoint_url ? '🔗' : '📄'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{doc.name}</div>
                            <div className="text-xs text-gray-400">{doc.doc_type} · {new Date(doc.created_at).toLocaleDateString()}</div>
                          </div>
                          {(doc.url || doc.sharepoint_url) && (
                            <a href={doc.url ?? doc.sharepoint_url ?? '#'} target="_blank" rel="noreferrer"
                              className="text-xs text-blue-600 hover:underline shrink-0">Open ↗</a>
                          )}
                          <button onClick={() => deleteDoc(doc.id, doc.url)}
                            className="text-gray-300 hover:text-red-400 text-sm transition-colors">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TARGETS TAB ── */}
              {!editing && modalTab === 'Targets' && (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">🎯 Default Monthly Targets</h3>
                    <p className="text-xs text-gray-400">These targets auto-populate when a new performance review is created for this employee. Managers can override them at review time.</p>
                  </div>

                  {targetsLoading ? (
                    <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
                  ) : (
                    <div className="space-y-4">
                      <textarea
                        value={targetsDraft}
                        onChange={e => setTargetsDraft(e.target.value)}
                        rows={8}
                        placeholder={`Enter default monthly targets for ${selected?.name?.split(' ')[0]}…\n\nExamples:\n• Complete sprint deliverables on time with < 5% rework\n• Maintain daily Salesforce activity updates\n• Support at least one client call per week\n• Upskill in [relevant tech] — 2 hrs/week`}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
                      />

                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Updated by</label>
                        <input
                          value={targetsUpdatedBy}
                          onChange={e => setTargetsUpdatedBy(e.target.value)}
                          placeholder="Manager name…"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        {targetsUpdatedAt ? (
                          <p className="text-xs text-gray-400">
                            Last saved {new Date(targetsUpdatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {empTargets !== targetsDraft && <span className="text-amber-500 ml-2">· Unsaved changes</span>}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400">No targets set yet</p>
                        )}
                        <button
                          onClick={saveTargets}
                          disabled={targetsSaving || targetsDraft === empTargets}
                          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
                        >
                          {targetsSaving ? 'Saving…' : '✓ Save Targets'}
                        </button>
                      </div>

                      {targetsDraft !== empTargets && (
                        <button onClick={() => setTargetsDraft(empTargets)} className="text-xs text-gray-400 hover:text-gray-600">
                          ↺ Discard changes
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── ABOVE & BEYOND TAB ── */}
              {!editing && modalTab === 'Above & Beyond' && (
                <div className="p-6">
                  {abLoading ? (
                    <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
                  ) : abEntries.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <div className="text-3xl mb-2">⭐</div>
                      <div className="text-sm">No Above & Beyond entries yet.</div>
                      <a href="/above-beyond" className="text-xs text-blue-600 hover:underline mt-1 block">Add one →</a>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {abEntries.map(e => (
                        <div key={e.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                          <div className="flex items-start gap-2 flex-wrap mb-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              e.category === 'Overtime' ? 'bg-blue-100 text-blue-700' :
                              e.category === 'Extra Project' ? 'bg-green-100 text-green-700' :
                              e.category === 'Mentoring' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-600'}`}>{e.category}</span>
                            {e.points && <span className="text-xs text-amber-600 font-medium">{'★'.repeat(e.points)} {e.points}/5</span>}
                          </div>
                          <p className="text-sm text-gray-800">{e.description}</p>
                          <div className="flex gap-3 mt-1.5 text-xs text-gray-400">
                            {e.client_project && <span>📁 {e.client_project}</span>}
                            {e.recorded_by && <span>👤 {e.recorded_by}</span>}
                            <span>📅 {new Date(e.recorded_date).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── CERTIFICATIONS TAB ── */}
              {!editing && modalTab === 'Certifications' && (
                <div className="p-6">
                  {certsLoading ? (
                    <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
                  ) : empCerts.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <div className="text-3xl mb-2">🏅</div>
                      <div className="text-sm">No certifications recorded yet.</div>
                      <a href="/certifications" className="text-xs text-blue-600 hover:underline mt-1 block">Add one →</a>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {empCerts.map(c => {
                        const days = c.expiry_date ? Math.ceil((new Date(c.expiry_date).getTime() - Date.now()) / 86400000) : null;
                        return (
                          <div key={c.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-center gap-4">
                            <div className="text-2xl">🏅</div>
                            <div className="flex-1">
                              <div className="font-medium text-gray-900 text-sm">{c.cert_name}</div>
                              {c.issuer && <div className="text-xs text-gray-500">{c.issuer}</div>}
                              <div className="flex gap-3 mt-1 text-xs text-gray-400">
                                {c.issued_date && <span>Issued {new Date(c.issued_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>}
                                {c.expiry_date && (
                                  <span className={days !== null && days < 0 ? 'text-red-500 font-medium' : days !== null && days <= 90 ? 'text-amber-600 font-medium' : ''}>
                                    {days !== null && days < 0 ? '🚨 Expired' : days !== null && days <= 30 ? `⚠️ Expires in ${days}d` : `Expires ${new Date(c.expiry_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────
function Section({ title, children, className='' }: { title:string; children:React.ReactNode; className?:string }) {
  return (
    <div className={className}>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, highlight }: { label:string; value?:string|null; highlight?:'red'|'blue' }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={cn('font-medium text-right max-w-xs truncate',
        highlight==='red' ? 'text-red-600' : highlight==='blue' ? 'text-blue-600' : 'text-gray-800')}>{value ?? '—'}</span>
    </div>
  );
}

function SensRow({ label, value, k, revealed, toggle }: { label:string; value?:string|null; k:string; revealed:Record<string,boolean>; toggle:(k:string)=>void }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span onClick={() => toggle(k)} className={cn('font-medium cursor-pointer select-none transition-all', !revealed[k] && 'blur-sm')}>{value ?? '—'}</span>
    </div>
  );
}

function EField({ label, k, editForm, F, type='text', required=false }: { label:string; k:string; editForm:Record<string,unknown>; F:(k:string)=>React.ChangeEventHandler<HTMLInputElement>; type?:string; required?:boolean }) {
  const isEmpty = required && !(editForm[k] as string)?.toString().trim();
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 mb-1 block">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input type={type} value={(editForm[k] as string) ?? ''}
        onChange={F(k)}
        className={cn('w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400', isEmpty ? 'border-red-300 bg-red-50' : '')} />
    </div>
  );
}
