'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate, cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────
interface HrAction {
  id: string;
  title: string;
  description: string | null;
  owner: string;
  priority: string;
  status: string;
  due_date: string | null;
  tags: string[] | null;
  source: string;
  source_ref: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ActionActivity {
  id: string;
  action_id: string;
  note: string;
  added_by: string | null;
  created_at: string;
}

interface ActionAttachment {
  id: string;
  action_id: string;
  name: string;
  url: string | null;
  sharepoint_url: string | null;
  uploaded_by: string | null;
  created_at: string;
}

const OWNERS   = ['Sudha Raghu', 'Akanksha Srivastava', 'Manjunath Tadahal', 'Rupesh M', 'Santhosh Pande', 'Raghu Seetharam', 'Other'];
const PRIORITIES = ['High', 'Medium', 'Low'];
const STATUSES   = ['Open', 'In Progress', 'Done', 'Cancelled'];

const PRIORITY_STYLE: Record<string, string> = {
  High:   'bg-red-100 text-red-700 border-red-200',
  Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Low:    'bg-gray-100 text-gray-600 border-gray-200',
};

const STATUS_STYLE: Record<string, string> = {
  'Open':        'bg-blue-100 text-blue-700',
  'In Progress': 'bg-purple-100 text-purple-700',
  'Done':        'bg-green-100 text-green-700',
  'Cancelled':   'bg-gray-100 text-gray-500',
};

const SOURCE_ICON: Record<string, string> = {
  manual: '✏️',
  email:  '📧',
};

function emptyForm() {
  return { title: '', description: '', owner: 'Sudha Raghu', priority: 'Medium', status: 'Open', due_date: '', tags: '' };
}

function isOverdue(due: string | null, status: string) {
  if (!due || status === 'Done' || status === 'Cancelled') return false;
  return new Date(due) < new Date();
}

// ─── Main Page ────────────────────────────────────────────────
export default function ActionsPage() {
  const [actions,     setActions]     = useState<HrAction[]>([]);
  const [selected,    setSelected]    = useState<HrAction | null>(null);
  const [activity,    setActivity]    = useState<ActionActivity[]>([]);
  const [attachments, setAttachments] = useState<ActionAttachment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editing,     setEditing]     = useState(false);
  const [form,        setForm]        = useState(emptyForm());
  const [saving,      setSaving]      = useState(false);
  const [newNote,     setNewNote]     = useState('');
  const [noteBy,      setNoteBy]      = useState('');
  const [uploading,   setUploading]   = useState(false);
  const [filterOwner, setFilterOwner] = useState('All');
  const [filterStatus,setFilterStatus]= useState('All');
  const [filterPri,   setFilterPri]   = useState('All');
  const [search,      setSearch]      = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadActions(); }, []);

  async function loadActions() {
    setLoading(true);
    const { data } = await supabase.from('hr_actions').select('*').order('created_at', { ascending: false });
    setActions((data ?? []) as HrAction[]);
    setLoading(false);
  }

  async function openAction(a: HrAction) {
    setSelected(a);
    setEditing(false);
    const [{ data: acts }, { data: atts }] = await Promise.all([
      supabase.from('action_activity').select('*').eq('action_id', a.id).order('created_at'),
      supabase.from('action_attachments').select('*').eq('action_id', a.id).order('created_at'),
    ]);
    setActivity((acts ?? []) as ActionActivity[]);
    setAttachments((atts ?? []) as ActionAttachment[]);
  }

  async function saveAction() {
    setSaving(true);
    const payload = {
      title: form.title, description: form.description || null, owner: form.owner,
      priority: form.priority, status: form.status, due_date: form.due_date || null,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    };
    if (editing && selected) {
      const { data } = await supabase.from('hr_actions').update(payload).eq('id', selected.id).select().single();
      if (data) {
        setActions(as => as.map(a => a.id === data.id ? data as HrAction : a));
        setSelected(data as HrAction);
        setEditing(false);
      }
    } else {
      const { data } = await supabase.from('hr_actions').insert(payload).select().single();
      if (data) { setActions(as => [data as HrAction, ...as]); setShowForm(false); await openAction(data as HrAction); }
    }
    setSaving(false);
  }

  async function updateStatus(a: HrAction, status: string) {
    const { data } = await supabase.from('hr_actions').update({ status }).eq('id', a.id).select().single();
    if (data) {
      setActions(as => as.map(x => x.id === data.id ? data as HrAction : x));
      if (selected?.id === data.id) setSelected(data as HrAction);
    }
  }

  async function addNote() {
    if (!selected || !newNote.trim()) return;
    const { data } = await supabase.from('action_activity').insert({ action_id: selected.id, note: newNote, added_by: noteBy || 'HR' }).select().single();
    if (data) { setActivity(a => [...a, data as ActionActivity]); setNewNote(''); }
  }

  async function uploadFile(file: File) {
    if (!selected) return;
    setUploading(true);
    const path = `${selected.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('action-attachments').upload(path, file);
    if (!error) {
      const { data } = await supabase.from('action_attachments').insert({ action_id: selected.id, name: file.name, url: path }).select().single();
      if (data) setAttachments(a => [...a, data as ActionAttachment]);
    }
    setUploading(false);
  }

  async function openAttachment(att: ActionAttachment) {
    const stored = att.url ?? att.sharepoint_url;
    if (!stored) return;
    let storagePath = stored;
    if (stored.startsWith('http')) {
      const m = stored.match(/action-attachments\/(.+)/);
      storagePath = m ? m[1] : '';
    }
    if (!storagePath) { window.open(stored, '_blank'); return; }
    const { data, error } = await supabase.storage.from('action-attachments').createSignedUrl(storagePath, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    else alert('Could not open attachment: ' + (error?.message ?? 'unknown error'));
  }

  async function deleteAction(id: string) {
    await supabase.from('hr_actions').delete().eq('id', id);
    setActions(as => as.filter(a => a.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  const filtered = actions.filter(a => {
    if (filterOwner !== 'All' && a.owner !== filterOwner) return false;
    if (filterStatus !== 'All' && a.status !== filterStatus) return false;
    if (filterPri !== 'All' && a.priority !== filterPri) return false;
    if (search && !a.title.toLowerCase().includes(search.toLowerCase()) && !(a.description ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = { Open: 0, 'In Progress': 0, Done: 0, Cancelled: 0 };
  actions.forEach(a => { if (a.status in counts) (counts as Record<string,number>)[a.status]++; });

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Left: list ── */}
      <div className="w-[420px] border-r flex flex-col bg-gray-50 shrink-0">

        {/* Header */}
        <div className="p-4 border-b bg-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Action Tracker</h1>
              <div className="flex gap-3 text-xs text-gray-500 mt-0.5">
                <span className="text-blue-600 font-semibold">{counts['Open']} Open</span>·
                <span className="text-purple-600 font-semibold">{counts['In Progress']} In Progress</span>·
                <span className="text-green-600 font-semibold">{counts['Done']} Done</span>
              </div>
            </div>
            <button onClick={() => { setForm(emptyForm()); setShowForm(true); }}
              className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">
              + New Task
            </button>
          </div>

          {/* Filters */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search tasks…"
            className="w-full px-3 py-1.5 text-sm border rounded-lg mb-2 focus:ring-2 focus:ring-blue-400" />
          <div className="flex gap-2">
            {[
              { v: filterOwner,  set: setFilterOwner,  opts: ['All', ...OWNERS] },
              { v: filterStatus, set: setFilterStatus, opts: ['All', ...STATUSES] },
              { v: filterPri,    set: setFilterPri,    opts: ['All', ...PRIORITIES] },
            ].map((f, i) => (
              <select key={i} value={f.v} onChange={e => f.set(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-blue-400">
                {f.opts.map(o => <option key={o}>{o}</option>)}
              </select>
            ))}
          </div>
        </div>

        {/* Task list */}
        <div className="overflow-auto flex-1">
          {loading && <div className="p-6 text-sm text-gray-400 text-center">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-6 text-sm text-gray-400 text-center">No tasks found.</div>
          )}
          {filtered.map(a => (
            <div key={a.id} onClick={() => openAction(a)}
              className={cn('px-4 py-3 border-b cursor-pointer hover:bg-white transition-colors',
                selected?.id === a.id ? 'bg-white border-l-2 border-l-blue-600' : 'bg-gray-50')}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 flex-1">{a.title}</span>
                <div className="flex gap-1 shrink-0">
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full border font-medium', PRIORITY_STYLE[a.priority])}>{a.priority}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[a.status])}>{a.status}</span>
                <span className="text-xs text-gray-500">👤 {a.owner}</span>
                {a.due_date && (
                  <span className={cn('text-xs', isOverdue(a.due_date, a.status) ? 'text-red-500 font-semibold' : 'text-gray-400')}>
                    📅 {formatDate(a.due_date)}{isOverdue(a.due_date, a.status) ? ' ⚠️' : ''}
                  </span>
                )}
                {a.source !== 'manual' && <span className="text-xs">{SOURCE_ICON[a.source]} auto</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: detail panel ── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center"><div className="text-5xl mb-3">✅</div><p className="text-sm">Select a task to view details</p></div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="p-6 max-w-2xl">

            {/* Header */}
            {!editing ? (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 pr-4">
                    <h2 className="text-xl font-bold text-gray-900 mb-1">{selected.title}</h2>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[selected.status])}>{selected.status}</span>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', PRIORITY_STYLE[selected.priority])}>{selected.priority} Priority</span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{SOURCE_ICON[selected.source]} {selected.source}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => { setForm({ title: selected.title, description: selected.description ?? '', owner: selected.owner, priority: selected.priority, status: selected.status, due_date: selected.due_date ?? '', tags: (selected.tags ?? []).join(', ') }); setEditing(true); }}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">✏️ Edit</button>
                    <button onClick={() => deleteAction(selected.id)}
                      className="px-3 py-1.5 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50">🗑</button>
                  </div>
                </div>

                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">Owner</div>
                    <div className="text-sm font-medium">👤 {selected.owner}</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="text-xs text-gray-400 mb-1">Due Date</div>
                    <div className={cn('text-sm font-medium', isOverdue(selected.due_date, selected.status) ? 'text-red-500' : '')}>
                      {selected.due_date ? `📅 ${formatDate(selected.due_date)}${isOverdue(selected.due_date, selected.status) ? ' ⚠️ Overdue' : ''}` : '—'}
                    </div>
                  </div>
                </div>

                {selected.description && (
                  <div className="bg-gray-50 rounded-xl p-4 mb-5">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Description</div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selected.description}</p>
                  </div>
                )}

                {selected.source_ref && (
                  <div className="bg-blue-50 rounded-xl p-3 mb-5 text-xs text-blue-700">📧 Auto-created from: {selected.source_ref}</div>
                )}

                {/* Quick status update */}
                <div className="mb-5">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Update Status</div>
                  <div className="flex gap-2 flex-wrap">
                    {STATUSES.map(s => (
                      <button key={s} onClick={() => updateStatus(selected, s)}
                        className={cn('px-3 py-1.5 text-xs rounded-lg border font-medium transition-all',
                          selected.status === s ? STATUS_STYLE[s] + ' ring-2 ring-offset-1 ring-blue-300' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400')}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* Edit form */
              <div className="mb-5">
                <h3 className="text-lg font-bold mb-4">Edit Task</h3>
                <ActionForm form={form} setForm={setForm} saving={saving} onSave={saveAction} onCancel={() => setEditing(false)} />
              </div>
            )}

            {/* Attachments */}
            {!editing && (
              <>
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Attachments ({attachments.length})</div>
                    <button onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {uploading ? '⏳' : '⬆ Upload'}
                    </button>
                  </div>
                  <input ref={fileRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
                  {attachments.length === 0
                    ? <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3 text-center">No attachments yet</div>
                    : attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 mb-1.5 text-sm">
                        <span>📎</span>
                        <span className="flex-1 truncate">{att.name}</span>
                        <button onClick={() => openAttachment(att)}
                          className="text-xs text-blue-600 hover:underline shrink-0">Open ↗</button>
                      </div>
                    ))
                  }
                </div>

                {/* Activity log */}
                <div>
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Activity Log</div>
                  {activity.length === 0
                    ? <div className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3 text-center mb-3">No activity yet</div>
                    : <div className="space-y-2 mb-3">
                        {activity.map(act => (
                          <div key={act.id} className="bg-gray-50 rounded-xl px-4 py-3">
                            <p className="text-sm text-gray-700 leading-relaxed">{act.note}</p>
                            <div className="text-xs text-gray-400 mt-1">{act.added_by ?? 'HR'} · {new Date(act.created_at).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                  }
                  <div className="space-y-2">
                    <textarea rows={2} value={newNote} onChange={e => setNewNote(e.target.value)}
                      placeholder="Add a note or update…"
                      className="w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-blue-400 resize-none" />
                    <div className="flex gap-2">
                      <input value={noteBy} onChange={e => setNoteBy(e.target.value)} placeholder="Your name"
                        className="flex-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
                      <button onClick={addNote} disabled={!newNote.trim()}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        Add Note
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── New task modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">New Task</h2>
            <ActionForm form={form} setForm={setForm} saving={saving} onSave={saveAction} onCancel={() => setShowForm(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reusable form component ──────────────────────────────────
function ActionForm({
  form, setForm, saving, onSave, onCancel
}: {
  form: ReturnType<typeof emptyForm>;
  setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyForm>>>;
  saving: boolean; onSave: () => void; onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Task Title *</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" placeholder="e.g. Send offer letter to Arjun" />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Description</label>
        <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 resize-none" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Owner</label>
          <select value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
            {OWNERS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Priority</label>
          <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 bg-white">
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Due Date</label>
          <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 mb-1 block">Tags (comma-separated)</label>
        <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
          placeholder="e.g. onboarding, visa, payroll"
          className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400" />
      </div>
      <div className="flex gap-3 pt-1">
        <button onClick={onSave} disabled={saving || !form.title.trim()}
          className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : '✓ Save Task'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}
