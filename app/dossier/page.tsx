'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Employee } from '@/lib/database.types';
import { formatDate, getDeptColor, cn } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import DocumentsPanel from '@/components/DocumentsPanel';

// ─── Constants ───────────────────────────────────────────────
const DEPTS     = ['Delivery','HR','Finance','Sales','Marketing','Operations','Talent Mgmt','Leadership'];
const WFO_OPTS  = ['WFH','WFO','Hybrid'];
const BGV_OPTS  = ['Verified','Pending','N/A','I-9'];
const STATUS_OPTS = ['Active','Ex-Employee','Contractor','Ex-Contractor'];
const DOC_TYPES = ['Offer Letter','Employment Contract','BGV Report','ID Proof','Visa Document','SOW','NDA','Other'];
const MODAL_TABS = ['Profile','Documents','Targets','Above & Beyond','Certifiations'] as const;
type ModalTab = typeof MODAL_TABS[number];

interface ColDef { key: string; label: string; always?: boolean; def?: boolean; editable?: boolean; type?: string; opts?: string[] }
const COL_DEFS: ColDef[] = [
  { key: 'name',        label: 'Employee',      always: true },
  { key: 'role',        label: 'Role',          def: true,  editable: true },
  { key: 'dept',        label: 'Department',    def: true,  editable: true, type: 'select', opts: DEPTS },
  { key: 'location',    label: 'Location',      def: false, editable: true },
  { key: 'region',      label: 'Region',        def: true,  editable: true, type: 'select', opts: ['India','USA','Canada'] },
  { key: 'manager',     label: 'Manager',       def: true,  editable: true },
  { key: 'wfo',         label: 'Work Mode',     def: false, editable: true, type: 'select', opts: WFO_OPTS },
  { key: 'type',        label: 'Type',          def: true  },
  { key: 'status',      label: 'Status',        def: true,  editable: true, type: 'select', opts: STATUS_OPTS },
  { key: 'joined',      label: 'Join Date',     def: false, editable: true, type: 'date' },
  { key: 'birthday',    label: 'Birthday',      def: false, editable: true, type: 'date' },
  { key: 'bgv',         label: 'BGV',           def: false, editable: true, type: 'select', opts: BGV_OPTS },
  { key: 'visa',        label: 'Visa',          def: false, editable: true },
  { key: 'visa_expiry', label: 'Visa Expiry',   def: false, editable: true, type: 'date' },
  { key: 'sow_expiry',  label: 'SOW Expiry',    def: false, editable: true, type: 'date' },
  { key: 'phone',       label: 'Phone',         def: false, editable: true },
  { key: 'skills',      label: 'Skills',        def: false, editable: true },
  { key: 'salary',      label: 'Salary (₹/mo)', def: false, editable: true, type: 'number' },
  { key: 'tenure',      label: 'Tenure',        def: true  },
];

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
        'Ex-Contractor':  'bg-purple-100 text-purple-700',
  };
  return { label: status, cls: styles[status] ?? 'bg-gray-100 text-gray-600' };
}

// ─── Main Page ────────────────────────────────────────────────
export default function DossierPage() {
  return <Suspense fallback={<div className="p-8 text-gray-400 text-sm">Loading…</div>}><DossierInner /></Suspense>;
}

function DossierInner() {
  const searchParams = useSearchParams();
  const [employees,  setEmployees]  = useState<Employee[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [deptF,      setDeptF]      = useState('All');
  const [regionF,    setRegionF]    = useState(() => searchParams.get('region') ?? 'All');
  const [statusF,    setStatusF]    = useState(() => searchParams.get('status') ?? 'All');
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
  const [colVis,        setColVis]        = useState<Record<string, boolean>>({});
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [rowDrafts,     setRowDrafts]     = useState<Record<string, Record<string, unknown>>>({});
  const [rowSaving,     setRowSaving]     = useState<Record<string, boolean>>({});
  const [showNewEmp,    setShowNewEmp]    = useState(false);
  const [newEmpForm,    setNewEmpForm]    = useState<Record<string, string>>({});
  const [newEmpSaving,  setNewEmpSaving]  = useState(false);
  const [newEmpError,   setNewEmpError]   = useState('');
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

  // ── Employee classification helpers (must be before filtered) ─
  const isContractor = (e: Employee) => (e as never as {type:string}).type === 'Contractor' || e.status === 'Contractor';
  const isEx         = (e: Employee) => !!(e as never as {termination_date:string|null}).termination_date || e.status === 'Ex-Employee' || e.status === 'Ex-Contractor';
  const isActiveFTE  = (e: Employee) => !isEx(e) && !isContractor(e);

  // ── Filters ──────────────────────────────────────────────────
  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    if (q && !e.name.toLowerCase().includes(q) && !e.role?.toLowerCase().includes(q) && !e.location?.toLowerCase().includes(q)) return false;
    if (deptF !== 'All' && e.dept !== deptF) return false;
    if (regionF !== 'All' && e.region !== regionF) return false;
    if (statusF !== 'All') {
      if (statusF === 'Contractor'  && !isContractor(e)) return false;
      if (statusF === 'Ex-Employee' && !isEx(e))         return false;
      if (statusF === 'Active'      && !isActiveFTE(e))  return false;
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

  // ── New employee creation ─────────────────────────────────────
  async function openNewEmpModal() {
    // Auto-generate next SPL-XXX id
    const nums = employees
      .map(e => { const m = e.id.match(/SPL-0*(\d+)/i); return m ? parseInt(m[1]) : 0; })
      .filter(n => n > 0);
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const nextId  = `SPL-${String(nextNum).padStart(3, '0')}`;
    setNewEmpForm({
      id: nextId, name: '', role: '', dept: DEPTS[0], location: '',
      region: 'India', manager: '', wfo: 'WFH', status: 'Active',
      type: 'FTE', joined: new Date().toISOString().slice(0, 10),
      phone: '', visa: '', skills: '', bgv: 'Pending',
    });
    setNewEmpError('');
    setShowNewEmp(true);
  }

  async function createEmployee() {
    setNewEmpError('');
    const missing: string[] = [];
    if (!newEmpForm.name?.trim())     missing.push('Full Name');
    if (!newEmpForm.role?.trim())     missing.push('Role / Title');
    if (!newEmpForm.dept?.trim())     missing.push('Department');
    if (!newEmpForm.location?.trim()) missing.push('Location');
    if (!newEmpForm.manager?.trim())  missing.push('Manager');
    if (missing.length) { setNewEmpError(`Required: ${missing.join(', ')}`); return; }

    // Check ID not already taken
    if (employees.some(e => e.id === newEmpForm.id)) {
      setNewEmpError(`Employee ID ${newEmpForm.id} already exists. Change it.`); return;
    }

    setNewEmpSaving(true);
    const payload = {
      id:       newEmpForm.id,
      name:     newEmpForm.name.trim(),
      role:     newEmpForm.role.trim(),
      dept:     newEmpForm.dept,
      location: newEmpForm.location.trim(),
      region:   newEmpForm.region,
      manager:  newEmpForm.manager.trim(),
      wfo:      newEmpForm.wfo,
      status:   newEmpForm.status,
      type:     newEmpForm.type,
      joined:   newEmpForm.joined || null,
      phone:    newEmpForm.phone || null,
      visa:     newEmpForm.visa || null,
      bgv:      newEmpForm.bgv || null,
      active:   newEmpForm.status !== 'Ex-Employee' && newEmpForm.status !== 'Ex-Contractor',
      skills:   newEmpForm.skills ? newEmpForm.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
    };
    const { data, error } = await supabase.from('employees').insert(payload).select().single();
    if (error) { setNewEmpError(`Save failed: ${error.message}`); setNewEmpSaving(false); return; }
    if (data) {
      setEmployees(es => [...es, data].sort((a, b) => a.name.localeCompare(b.name)));
      setShowNewEmp(false);
      // Open the new employee's profile immediately
      setSelected(data);
      setModalTab('Profile');
    }
    setNewEmpSaving(false);
  }

  const NF = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setNewEmpForm(f => ({ ...f, [key]: e.target.value }));

  // ── Column visibility ─────────────────────────────────────────
  const isColVisible = (key: string) => {
    const col = COL_DEFS.find(c => c.key === key);
    if (!col) return false;
    if (col.always) return true;
    return colVis[key] !== undefined ? colVis[key] : (col.def ?? false);
  };
  const visibleCols = COL_DEFS.filter(c => isColVisible(c.key));

  // ── Inline row editing ────────────────────────────────────────
  function startRowEdit(e: Employee) {
    setRowDrafts(d => ({ ...d, [e.id]: {
      role: e.role ?? '', dept: (e as never as {dept:string}).dept ?? '',
      location: e.location ?? '', region: e.region ?? '',
      manager: e.manager ?? '', wfo: e.wfo ?? '',
      status: e.status ?? 'Active',
      joined: e.joined ?? '', birthday: (e as never as {birthday:string|null}).birthday ?? '',
      bgv: e.bgv ?? '', visa: e.visa ?? '',
      visa_expiry: e.visa_expiry ?? '', sow_expiry: e.sow_expiry ?? '',
      phone: e.phone ?? '',
      skills: (e.skills ?? []).join(', '),
      salary: e.salary != null ? String(e.salary) : '',
    } }));
  }
  function cancelRowEdit(empId: string) {
    setRowDrafts(d => { const n = { ...d }; delete n[empId]; return n; });
  }
  async function saveRow(empId: string) {
    const draft = rowDrafts[empId];
    if (!draft) return;
    setRowSaving(s => ({ ...s, [empId]: true }));
    const payload: Record<string, unknown> = { ...draft };
    // Coerce types
    if (typeof payload.skills === 'string')
      payload.skills = (payload.skills as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (typeof payload.salary === 'string')
      payload.salary = payload.salary ? Number(payload.salary) : null;
    // Nullify empty date strings
    for (const k of ['joined','birthday','visa_expiry','sow_expiry']) {
      if (payload[k] === '') payload[k] = null;
    }
    const { data } = await supabase.from('employees').update(payload).eq('id', empId).select().single();
    if (data) setEmployees(es => es.map(e => e.id === data.id ? data : e));
    setRowDrafts(d => { const n = { ...d }; delete n[empId]; return n; });
    setRowSaving(s => { const n = { ...s }; delete n[empId]; return n; });
  }
  async function saveAllRows() {
    await Promise.all(Object.keys(rowDrafts).map(id => saveRow(id)));
  }

  // ── List cell renderers ────────────────────────────────────────
  function renderListCell(e: Employee, key: string) {
    const isC = isContractor(e);
    const flag = e.region === 'India' ? '🇮🇳' : e.region === 'USA' ? '🇺🇸' : e.region === 'Canada' ? '🇨🇦' : '';
    switch (key) {
      case 'name':
        return (
          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <Avatar name={e.name} photoUrl={e.photo_url} size="sm" />
              {isC && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center border border-white"><span className="text-white text-[8px] font-black">C</span></div>}
            </div>
            <span className="font-medium text-sm whitespace-nowrap">{e.name}</span>
          </div>
        );
      case 'role':        return <span className="text-xs text-gray-600">{e.role ?? '—'}</span>;
      case 'dept':        return e.dept ? <span className="text-xs px-2 py-0.5 rounded-full text-white whitespace-nowrap" style={{ backgroundColor: getDeptColor(e.dept) }}>{e.dept}</span> : <span className="text-gray-400 text-xs">—</span>;
      case 'location':    return <span className="text-xs text-gray-600 whitespace-nowrap">{e.location ?? '—'}</span>;
      case 'region':      return <span className="text-xs text-gray-600 whitespace-nowrap">{flag && <span className="mr-0.5">{flag}</span>}{e.region ?? '—'}</span>;
      case 'manager':     return <span className="text-xs text-gray-600 whitespace-nowrap">{e.manager ?? '—'}</span>;
      case 'wfo':         return e.wfo ? <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{e.wfo}</span> : <span className="text-gray-400 text-xs">—</span>;
      case 'type':        return <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', isC ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700')}>{isC ? 'Contractor' : 'FTE'}</span>;
      case 'status': { const { label: sl, cls: sc } = statusBadge(e as never); return <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', sc)}>{sl}</span>; }
      case 'joined':      return <span className="text-xs text-gray-600 whitespace-nowrap">{formatDate(e.joined)}</span>;
      case 'birthday':    return <span className="text-xs text-gray-600 whitespace-nowrap">{formatDate((e as never as {birthday:string|null}).birthday)}</span>;
      case 'bgv':         return e.bgv ? <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded whitespace-nowrap">{e.bgv}</span> : <span className="text-gray-400 text-xs">—</span>;
      case 'visa':        return <span className="text-xs text-gray-600">{e.visa ?? '—'}</span>;
      case 'visa_expiry': { const exp = e.visa_expiry; const soon = exp && new Date(exp) < new Date(Date.now()+90*86400000); return <span className={cn('text-xs whitespace-nowrap', soon ? 'text-red-600 font-medium' : 'text-gray-600')}>{formatDate(exp)}</span>; }
      case 'sow_expiry':  return <span className="text-xs text-gray-600 whitespace-nowrap">{formatDate(e.sow_expiry)}</span>;
      case 'phone':       return <span className="text-xs text-gray-600">{e.phone ?? '—'}</span>;
      case 'skills':      return e.skills?.length ? (
        <div className="flex flex-wrap gap-1 max-w-[180px]">
          {e.skills.slice(0,3).map(s => <span key={s} className="text-xs px-1.5 bg-blue-50 text-blue-600 rounded">{s}</span>)}
          {e.skills.length > 3 && <span className="text-xs text-gray-400">+{e.skills.length-3}</span>}
        </div>
      ) : <span className="text-gray-400 text-xs">—</span>;
      case 'salary':      return <span className="text-xs text-gray-600 whitespace-nowrap">{e.salary ? `₹${Number(e.salary).toLocaleString('en-IN')}` : '—'}</span>;
      case 'tenure':      return <span className="text-xs font-medium text-blue-600 whitespace-nowrap">{calcTenure(e.joined, (e as never as {termination_date:string|null}).termination_date)}</span>;
      default:            return <span className="text-gray-400 text-xs">—</span>;
    }
  }

  function renderEditCell(empId: string, col: ColDef) {
    if (!col.editable) {
      const emp = employees.find(e => e.id === empId);
      return emp ? renderListCell(emp, col.key) : null;
    }
    const draft = rowDrafts[empId] ?? {};
    const val   = (draft[col.key] ?? '') as string;
    const cls   = 'w-full px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white';
    const set   = (v: unknown) => setRowDrafts(d => ({ ...d, [empId]: { ...d[empId], [col.key]: v } }));
    if (col.type === 'select' && col.opts) {
      return (
        <select value={val} onChange={e => set(e.target.value)} className={cn(cls, 'min-w-[90px]')}>
          <option value="">—</option>
          {col.opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (col.key === 'skills') {
      return <input type="text" value={val} onChange={e => set(e.target.value)} placeholder="comma-separated" className={cn(cls, 'min-w-[140px]')} />;
    }
    return <input type={col.type ?? 'text'} value={val} onChange={e => set(e.target.value || (col.type === 'date' ? '' : null))} className={cn(cls, col.type === 'date' ? 'min-w-[120px]' : 'min-w-[90px]')} />;
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading employees…</div>;

  // ── Counts for chips ───────────────────────────────────────────
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
        <div className="flex items-center gap-2">
          <button onClick={openNewEmpModal}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            ＋ Add Employee
          </button>
          {view === 'list' && (
            <div className="relative">
              <button onClick={() => setColPickerOpen(p => !p)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
                ⚙ Columns <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0 rounded-full font-bold">{visibleCols.length}</span>
              </button>
              {colPickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setColPickerOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 p-3 w-56 max-h-80 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Visible Columns</span>
                      <button onClick={() => setColVis({})} className="text-xs text-blue-600 hover:underline">Reset</button>
                    </div>
                    {COL_DEFS.map(col => (
                      <label key={col.key} className={cn('flex items-center gap-2 py-1 cursor-pointer hover:text-blue-600 text-sm', col.always ? 'opacity-50' : '')}>
                        <input type="checkbox" checked={isColVisible(col.key)} disabled={!!col.always}
                          onChange={e => setColVis(v => ({ ...v, [col.key]: e.target.checked }))}
                          className="rounded" />
                        {col.label}
                        {col.always && <span className="text-xs text-gray-400 ml-auto">always</span>}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button onClick={() => setView('grid')} className={cn('px-3 py-1.5 text-sm rounded-lg border', view==='grid' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600')}>⊞ Grid</button>
          <button onClick={() => setView('list')} className={cn('px-3 py-1.5 text-sm rounded-lg border', view==='list' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600')}>☰ List</button>
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
            const bdayDays = (() => {
              const b = (e as never as {birthday:string|null}).birthday;
              if (!b) return null;
              const bd = new Date(b + 'T00:00:00');
              const tod = new Date(); tod.setHours(0,0,0,0);
              const next = new Date(tod.getFullYear(), bd.getMonth(), bd.getDate());
              if (next < tod) next.setFullYear(tod.getFullYear() + 1);
              return Math.round((next.getTime() - tod.getTime()) / 86400000);
            })();
            const isBdaySoon = bdayDays !== null && bdayDays <= 7;
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
                  {isBdaySoon && (
                    <div className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                      bdayDays === 0 ? 'bg-pink-100 text-pink-700' : 'bg-yellow-50 text-yellow-700')}>
                      {bdayDays === 0 ? '🎂 Birthday today!' : bdayDays === 1 ? '🎈 Birthday tomorrow' : `🎉 Birthday in ${bdayDays}d`}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List */}
      {view === 'list' && (
        <div className="bg-white rounded-xl shadow-sm overflow-auto">
          {/* Unsaved changes bar */}
          {Object.keys(rowDrafts).length > 0 && (
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between sticky top-0 z-10">
              <span className="text-xs text-amber-700 font-medium">
                ✏️ {Object.keys(rowDrafts).length} row{Object.keys(rowDrafts).length > 1 ? 's' : ''} with unsaved changes
              </span>
              <div className="flex gap-2">
                <button onClick={() => setRowDrafts({})} className="px-3 py-1 text-xs text-gray-500 border rounded-lg hover:bg-gray-50">Discard All</button>
                <button onClick={saveAllRows} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">💾 Save All Changes</button>
              </div>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {visibleCols.map(col => (
                  <th key={col.key} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center whitespace-nowrap w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(e => {
                const isEditing = !!rowDrafts[e.id];
                const isSaving  = !!rowSaving[e.id];
                const isC = isContractor(e);
                return (
                  <tr key={e.id} className={cn('transition-colors',
                    isEditing ? 'bg-blue-50/50 ring-1 ring-inset ring-blue-200' :
                    isC       ? 'bg-orange-50/30 hover:bg-orange-50/60' :
                                'hover:bg-blue-50/30')}>
                    {visibleCols.map(col => (
                      <td key={col.key} className={cn('px-4', isEditing ? 'py-1.5' : 'py-2.5')}>
                        {isEditing
                          ? renderEditCell(e.id, col)
                          : <div onClick={() => openProfile(e)} className="cursor-pointer">
                              {renderListCell(e, col.key)}
                            </div>
                        }
                      </td>
                    ))}
                    <td className="px-4 py-2 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => saveRow(e.id)} disabled={isSaving}
                            className="px-2.5 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium" title="Save">
                            {isSaving ? '…' : '✓ Save'}
                          </button>
                          <button onClick={() => cancelRowEdit(e.id)} disabled={isSaving}
                            className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200" title="Cancel">
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => startRowEdit(e)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit row inline">
                            ✏️
                          </button>
                          <button onClick={() => openProfile(e)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="View full profile">
                            👤
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-12">No employees match the current filters.</div>
          )}
        </div>
      )}

      {/* ── NEW EMPLOYEE MODAL ── */}
      {showNewEmp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewEmp(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">➕ Add New Employee</h2>
                <p className="text-xs text-gray-400 mt-0.5">Fields marked <span className="text-red-500">*</span> are required</p>
              </div>
              <button onClick={() => setShowNewEmp(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Body */}
            <div className="overflow-auto flex-1 p-6 space-y-5">
              {newEmpError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠️ {newEmpError}</div>
              )}

              {/* Identity */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Identity</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Employee ID</label>
                    <input value={newEmpForm.id ?? ''} onChange={NF('id')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Full Name <span className="text-red-500">*</span></label>
                    <input value={newEmpForm.name ?? ''} onChange={NF('name')} placeholder="e.g. Priya Sharma"
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Role / Title <span className="text-red-500">*</span></label>
                    <input value={newEmpForm.role ?? ''} onChange={NF('role')} placeholder="e.g. Salesforce Developer"
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Department <span className="text-red-500">*</span></label>
                    <select value={newEmpForm.dept ?? DEPTS[0]} onChange={NF('dept')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
                      {DEPTS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Location & Work</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Location <span className="text-red-500">*</span></label>
                    <input value={newEmpForm.location ?? ''} onChange={NF('location')} placeholder="e.g. Bangalore"
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Region</label>
                    <select value={newEmpForm.region ?? 'India'} onChange={NF('region')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
                      {['India','USA','Canada'].map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Work Mode</label>
                    <select value={newEmpForm.wfo ?? 'WFH'} onChange={NF('wfo')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
                      {WFO_OPTS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Manager <span className="text-red-500">*</span></label>
                    <input value={newEmpForm.manager ?? ''} onChange={NF('manager')} placeholder="e.g. Manjunath Tadahal"
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>
              </div>

              {/* Employment */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Employment</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Type</label>
                    <select value={newEmpForm.type ?? 'FTE'} onChange={NF('type')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
                      {['FTE','Contractor','Contract'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Status</label>
                    <select value={newEmpForm.status ?? 'Active'} onChange={NF('status')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
                      {STATUS_OPTS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Join Date</label>
                    <input type="date" value={newEmpForm.joined ?? ''} onChange={NF('joined')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Date of Birth</label>
                    <input type="date" value={newEmpForm.birthday ?? ''} onChange={NF('birthday')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>
              </div>

              {/* Compliance */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Compliance & Contact</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">BGV Status</label>
                    <select value={newEmpForm.bgv ?? 'Pending'} onChange={NF('bgv')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
                      {BGV_OPTS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Phone</label>
                    <input value={newEmpForm.phone ?? ''} onChange={NF('phone')} placeholder="+91 98765 43210"
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Visa Type</label>
                    <input value={newEmpForm.visa ?? ''} onChange={NF('visa')} placeholder="e.g. H1B, L1, GC"
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Visa Expiry</label>
                    <input type="date" value={newEmpForm.visa_expiry ?? ''} onChange={NF('visa_expiry')}
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Skills <span className="text-gray-400 font-normal">(comma-separated)</span></label>
                <input value={newEmpForm.skills ?? ''} onChange={NF('skills')} placeholder="e.g. Salesforce, Apex, LWC"
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t flex gap-3 shrink-0">
              <button onClick={createEmployee} disabled={newEmpSaving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {newEmpSaving ? '⏳ Creating…' : '✓ Create Employee'}
              </button>
              <button onClick={() => setShowNewEmp(false)}
                className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
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
                    {(selected as never as {birthday:string|null}).birthday && (() => {
                      const bday = new Date((selected as never as {birthday:string}).birthday + 'T00:00:00');
                      const today = new Date(); today.setHours(0,0,0,0);
                      const next = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
                      if (next < today) next.setFullYear(today.getFullYear() + 1);
                      const days = Math.round((next.getTime() - today.getTime()) / 86400000);
                      const label = days === 0 ? '🎂 Today!' : days === 1 ? '🎈 Tomorrow' : days <= 7 ? `🎉 In ${days} days` : bday.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
                      return <Row label="Birthday" value={label} highlight={days <= 7 ? 'blue' : undefined} />;
                    })()}
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
                    <EField label="Date of Birth"  k="birthday"         editForm={editForm} F={F} type="date" />
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
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Employee Type</label>
                      <select value={(editForm as never as {type:string}).type ?? 'FTE'} onChange={F('type')}
                        className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400">
                        <option>FTE</option>
                        <option>Contractor</option>
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

                  {/* ── HR Letters & e-Signature ── */}
                  <div className="border-t border-gray-100 pt-5">
                    <DocumentsPanel employee={{
                      id:               selected.id,
                      name:             selected.name,
                      role:             selected.role ?? '',
                      dept:             selected.dept ?? '',
                      location:         selected.location ?? '',
                      manager:          selected.manager ?? '',
                      joined:           selected.joined ?? undefined,
                      salary:           (selected as never as {salary?: number}).salary,
                      email:            (selected as never as {email?: string}).email,
                      termination_date: (selected as never as {termination_date?: string}).termination_date,
                    }} />
                  </div>
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
