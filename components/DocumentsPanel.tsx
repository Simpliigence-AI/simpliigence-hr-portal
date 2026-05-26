'use client';

import { useEffect, useState, useCallback } from 'react';

interface Employee {
  id:               string;
  name:             string;
  role:             string;
  dept:             string;
  location:         string;
  manager?:         string;
  joined?:          string;
  salary?:          number | string;
  email?:           string;
  phone?:           string;
  termination_date?: string;
}

interface Doc {
  id:              string;
  type:            'offer' | 'experience' | 'increment';
  title:           string;
  status:          'draft' | 'sent' | 'signed' | 'declined' | 'expired';
  signer_email:    string;
  signer_name:     string;
  created_at:      string;
  sent_at?:        string;
  signed_at?:      string;
  zoho_request_id?: string;
}

const TYPE_LABELS: Record<string, string> = {
  offer:      '📄 Offer Letter',
  experience: '📋 Experience / Relieving Letter',
  increment:  '📈 Increment / Promotion Letter',
};

const STATUS_STYLE: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-100 text-blue-700',
  signed:   'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  expired:  'bg-orange-100 text-orange-700',
};

function fmt(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayStr() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function toInputDate(d?: string) {
  if (!d) return new Date().toISOString().slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

function fmtInputDate(d?: string) {
  if (!d) return todayStr();
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ─── Field helpers ───────────────────────────────────────────────────────────

function Input({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function DocumentsPanel({ employee }: { employee: Employee }) {
  const [docs,    setDocs]    = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  // Which letter type is selected
  const [docType, setDocType] = useState<'offer' | 'experience' | 'increment'>('offer');

  // Signer info
  const [signerEmail, setSignerEmail] = useState(employee.email ?? '');
  const [signerName,  setSignerName]  = useState(employee.name);

  // ── Offer fields ──
  const [offerFields, setOfferFields] = useState({
    salary:      employee.salary ? `Rs. ${Number(employee.salary).toLocaleString('en-IN')} per month` : '',
    joiningDate: fmtInputDate(employee.joined),
    managerName: employee.manager ?? '',
    letterDate:  todayStr(),
  });

  // ── Experience fields ──
  const [expFields, setExpFields] = useState({
    relievingDate: fmtInputDate(employee.termination_date),
    letterDate:    todayStr(),
  });

  // ── Increment fields ──
  const [incFields, setIncFields] = useState({
    currentSalary:  employee.salary ? `Rs. ${Number(employee.salary).toLocaleString('en-IN')} per month` : '',
    newSalary:      '',
    newRole:        '',
    effectiveDate:  fmtInputDate(new Date().toISOString().slice(0, 10)),
    letterDate:     todayStr(),
  });

  // Load docs
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/documents?employeeId=${employee.id}`);
      const j = await r.json();
      setDocs(j.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, [employee.id]);

  useEffect(() => { load(); }, [load]);

  // Sync status from Zoho
  async function syncStatus(docId: string) {
    await fetch('/api/documents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: docId }),
    });
    load();
  }

  // Send document
  async function send() {
    setError(''); setSuccess('');
    if (!signerEmail) { setError('Signer email is required.'); return; }

    let details: Record<string, string> = {};
    if (docType === 'offer') {
      details = {
        employeeName: employee.name,
        role:         employee.role,
        department:   employee.dept,
        location:     employee.location,
        ...offerFields,
      };
    } else if (docType === 'experience') {
      details = {
        employeeName:  employee.name,
        role:          employee.role,
        department:    employee.dept,
        joiningDate:   fmtInputDate(employee.joined),
        ...expFields,
      };
    } else {
      details = {
        employeeName:  employee.name,
        currentRole:   employee.role,
        department:    employee.dept,
        ...incFields,
      };
    }

    setSending(true);
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee.id,
          type:       docType,
          details,
          signerEmail,
          signerName,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'Failed to send.'); return; }
      setSuccess(`✅ Sent! ${signerEmail} will receive a Zoho Sign email shortly.`);
      setModal(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">HR Documents</h3>
        <button
          onClick={() => { setModal(true); setError(''); setSuccess(''); }}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <span>＋</span> Generate Letter
        </button>
      </div>

      {/* Success toast */}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3">
          {success}
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
      ) : docs.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <div className="text-4xl mb-2">📄</div>
          <p className="text-sm">No documents yet. Generate a letter to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => (
            <div key={doc.id} className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">{doc.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLE[doc.status]}`}>
                      {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div>Sent to: {doc.signer_email}</div>
                    <div>Created: {fmt(doc.created_at)}
                      {doc.signed_at && <span className="ml-2 text-green-600">· Signed: {fmt(doc.signed_at)}</span>}
                    </div>
                  </div>
                </div>
                {doc.status === 'sent' && (
                  <button
                    onClick={() => syncStatus(doc.id)}
                    className="text-xs text-blue-600 hover:underline shrink-0"
                    title="Refresh status from Zoho Sign"
                  >
                    ↻ Sync
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Generate Letter Modal ──────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="font-semibold text-gray-800">Generate HR Letter</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* Letter type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Letter Type</label>
                <div className="grid grid-cols-1 gap-2">
                  {(['offer', 'experience', 'increment'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setDocType(t)}
                      className={`text-left px-4 py-3 rounded-xl border-2 text-sm transition-colors ${
                        docType === t
                          ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Pre-filled info (read-only) */}
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
                <div><span className="font-medium">Employee:</span> {employee.name}</div>
                <div><span className="font-medium">Role:</span> {employee.role} · {employee.dept}</div>
                <div><span className="font-medium">Location:</span> {employee.location}</div>
              </div>

              {/* Type-specific fields */}
              {docType === 'offer' && (
                <div className="space-y-3">
                  <Input label="Gross Monthly CTC" value={offerFields.salary}
                    onChange={v => setOfferFields(f => ({ ...f, salary: v }))}
                    placeholder="e.g. Rs. 80,000 per month" />
                  <Input label="Date of Joining" value={offerFields.joiningDate}
                    onChange={v => setOfferFields(f => ({ ...f, joiningDate: v }))} />
                  <Input label="Reporting Manager" value={offerFields.managerName}
                    onChange={v => setOfferFields(f => ({ ...f, managerName: v }))} />
                  <Input label="Letter Date" value={offerFields.letterDate}
                    onChange={v => setOfferFields(f => ({ ...f, letterDate: v }))} />
                </div>
              )}

              {docType === 'experience' && (
                <div className="space-y-3">
                  <div className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    Joining date auto-filled from profile ({fmtInputDate(employee.joined)})
                  </div>
                  <Input label="Last Working Day" value={expFields.relievingDate}
                    onChange={v => setExpFields(f => ({ ...f, relievingDate: v }))} />
                  <Input label="Letter Date" value={expFields.letterDate}
                    onChange={v => setExpFields(f => ({ ...f, letterDate: v }))} />
                </div>
              )}

              {docType === 'increment' && (
                <div className="space-y-3">
                  <Input label="Current Monthly CTC" value={incFields.currentSalary}
                    onChange={v => setIncFields(f => ({ ...f, currentSalary: v }))}
                    placeholder="e.g. Rs. 80,000 per month" />
                  <Input label="Revised Monthly CTC" value={incFields.newSalary}
                    onChange={v => setIncFields(f => ({ ...f, newSalary: v }))}
                    placeholder="e.g. Rs. 95,000 per month" />
                  <Input label="New Designation (leave blank if no promotion)" value={incFields.newRole}
                    onChange={v => setIncFields(f => ({ ...f, newRole: v }))}
                    placeholder={employee.role} />
                  <Input label="Effective Date" value={incFields.effectiveDate}
                    onChange={v => setIncFields(f => ({ ...f, effectiveDate: v }))} />
                  <Input label="Letter Date" value={incFields.letterDate}
                    onChange={v => setIncFields(f => ({ ...f, letterDate: v }))} />
                </div>
              )}

              <hr className="border-gray-100" />

              {/* Signer */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">E-Signature Recipient</p>
                <Input label="Signer Name" value={signerName}
                  onChange={setSignerName} />
                <Input label="Signer Email" value={signerEmail}
                  onChange={setSignerEmail} placeholder="employee@example.com" />
                <p className="text-xs text-gray-400">
                  Zoho Sign will email this person a link to sign the document.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-xl py-2.5 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={send}
                  disabled={sending}
                  className="flex-1 bg-blue-600 text-white text-sm rounded-xl py-2.5 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
                >
                  {sending ? 'Sending…' : '✉️ Generate & Send for Signature'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
