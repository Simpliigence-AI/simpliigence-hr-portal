'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { defaultCTCRows, inrFmt, inrWords } from '@/lib/letter-templates';
import type { CTCRow } from '@/lib/letter-templates';

/* ─── Types ────────────────────────────────────────────────────────────── */

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
}

const TYPE_LABELS: Record<string, string> = {
  offer:      '📄 Employment Contract (Offer Letter)',
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

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function fmt(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayStr() {
  const d = new Date();
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
  return `${day}${suffix} ${d.toLocaleString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return todayStr();
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
  return `${day}${suffix} ${d.toLocaleString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
}

function toISODate(formatted: string): string {
  try { return new Date(formatted).toISOString().slice(0, 10); } catch { return new Date().toISOString().slice(0, 10); }
}

function Inp({ label, value, onChange, placeholder, type = 'text', mono = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 3, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <textarea
        rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
      />
    </div>
  );
}

/* ─── Offer Letter Multi-Step Modal ─────────────────────────────────────── */

function OfferLetterModal({
  employee,
  onClose,
  onSent,
}: {
  employee: Employee;
  onClose: () => void;
  onSent: () => void;
}) {
  const [step, setStep] = useState(1);

  // Step 1 — Basic info
  const [empName,    setEmpName]    = useState(employee.name);
  const [empAddr,    setEmpAddr]    = useState('');
  const [desig,      setDesig]      = useState(employee.role);
  const [contractDt, setContractDt] = useState(todayStr());
  const [joiningDt,  setJoiningDt]  = useState(fmtDate(employee.joined));
  const [place,      setPlace]      = useState(employee.location);

  // Step 2 — CTC
  const [fixedCtc,    setFixedCtc]    = useState(employee.salary ? String(Math.round(Number(employee.salary) * 12)) : '');
  const [variableCtc, setVariableCtc] = useState('0');
  const [rows, setRows] = useState<CTCRow[]>([]);

  // Step 3 — Preview (full-document contentEditable — edits flow to PDF via state callbacks)
  const editorRef = useRef<HTMLDivElement>(null);
  const [previewKey, setPreviewKey] = useState(0); // bump to force preview re-render

  // Step 4 — Signer
  const [signerEmail, setSignerEmail] = useState(employee.email ?? '');
  const [signerName,  setSignerName]  = useState(employee.name);

  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');

  // When step 2 is first loaded, build the CTC rows
  useEffect(() => {
    if (step === 2) {
      const fixed = parseInt(fixedCtc.replace(/,/g, ''), 10) || 0;
      const variable = parseInt(variableCtc.replace(/,/g, ''), 10) || 0;
      if (rows.length === 0 && fixed > 0) setRows(defaultCTCRows(fixed, variable));
    }
  }, [step, fixedCtc, variableCtc, rows.length]);

  // When step 3 loads (or previewKey bumps), write the full HTML into the ref.
  // We use innerHTML directly to avoid cursor-jump on every keystroke.
  useEffect(() => {
    if (step === 3 && editorRef.current) {
      editorRef.current.innerHTML = buildPreviewHtml();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, previewKey]);

  function updateRow(id: string, annual: number) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, annual } : r));
  }

  const fixed    = parseInt(fixedCtc.replace(/,/g, ''), 10) || 0;
  const variable = parseInt(variableCtc.replace(/,/g, ''), 10) || 0;

  const rowsTotal = rows
    .filter(r => !r.isSpacer && r.id !== 'fixed_total' && r.id !== 'variable')
    .reduce((s, r) => s + r.annual, 0);
  const ctcMatchWarning = fixed > 0 && Math.abs(rowsTotal - fixed) > 10;

  function buildPreviewHtml(): string {
    const p = (text: string) => `<p style="margin:0 0 10px 0">${text}</p>`;
    const h = (text: string) => `<p style="margin:14px 0 4px 0;font-weight:bold">${text}</p>`;
    const indent = (text: string) => `<p style="margin:0 0 8px 0;padding-left:24px">${text}</p>`;

    const ctcRows = rows.filter(r => !r.isSpacer && r.id !== 'fixed_total').map(r => `
      <tr ${r.bold ? 'style="font-weight:bold"' : ''}>
        <td style="border:1px solid #ccc;padding:4px 6px">${r.label}</td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right">${r.id === 'variable' ? '—' : inrFmt(Math.round(r.annual/12))}</td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right">${inrFmt(r.annual)}</td>
        <td style="border:1px solid #ccc;padding:4px 6px;font-size:8pt">${r.remarks}</td>
      </tr>`).join('');

    return `
<div style="font-family:'Times New Roman',serif;font-size:11pt;line-height:1.6;color:#111;max-width:700px;margin:0 auto;padding:24px">

  <!-- LETTERHEAD -->
  <div style="text-align:center;margin-bottom:4px">
    <div style="font-size:16pt;font-weight:bold">SIMPLIIGENCE PRIVATE LIMITED</div>
    <div style="font-size:8.5pt">Technology Consulting &nbsp;|&nbsp; Salesforce &nbsp;|&nbsp; AI/ML &nbsp;|&nbsp; GCC Advisory</div>
    <div style="font-size:8.5pt">No. 179/1, 10th-A Main Road, Indiranagar 2nd Stage, Bangalore, India - 560038</div>
  </div>
  <hr style="border:0;border-top:1.5px solid #111;margin:8px 0 20px 0"/>

  <h2 style="text-align:center;font-size:14pt;margin:0 0 18px 0">EMPLOYMENT CONTRACT</h2>

  ${p(`This Employment Contract is made at Bangalore, Karnataka and effective this <strong>${contractDt}</strong>.`)}

  ${p(`BETWEEN: <strong>${empName}</strong> (the "Employee"), an Indian Resident residing at: ${empAddr || '<em>[address not entered]</em>'}`)}
  ${indent('The Party to the First part')}

  ${p(`AND: <strong>Simpliigence Private Limited</strong> (the "Company"), a Private Limited Company having its registered office at: No. 179/1, 10th-A Main Road, Indiranagar 2nd Stage, Bangalore, India - 560038.`)}
  ${indent('The Party to the Second part')}

  ${p('(Collectively referred to as "Parties")')}

  ${p(`This Contract is entered by the Parties after the issue of appointment letter or execution of the employment contract dated <strong>${joiningDt}</strong>.`)}

  ${p(`WHEREAS the Company desires to employ the Party to the First Part and the said Party desires to be employed/appointed by the Company in employment for the post of a <strong>${desig}</strong>.`)}

  <hr style="margin:14px 0"/>
  <p style="font-weight:bold;font-size:12pt;margin:0 0 6px 0">Employee Service Conditions:</p>
  ${p('Following are the terms and conditions associated with your employment:')}
  ${p(`"Company" or "Simpliigence" for all purposes shall mean Simpliigence Private Limited`)}
  ${p(`"You" or "Candidate" for all purposes shall mean <strong>${empName}</strong>`)}

  ${h('Remuneration:')}
  ${p(`Your annual Gross salary/CTC will be Rs ${inrFmt(fixed)}/- (Rupees ${inrWords(fixed)}).${variable > 0 ? ` In addition, you will be eligible for a variable component of Rs ${inrFmt(variable)}/- (Rupees ${inrWords(variable)}) subject to Company policies and performance.` : ''} Any additional allowances, incentives and other benefits of your employment will be as per Company policies as applicable from time to time and based on performance, as may be mutually decided by the Company and the Candidate.`)}
  ${p('Your CTC includes and will continue to include all statutory liability and taxes applicable to you as an employee from time to time.')}
  ${p('A breakup of your tentative CTC is detailed under Appendix – A to this contract which is subject to change.')}
  ${p('This is a position of continuous responsibility and does not entail payment of extra time or overtime.')}

  ${h('Period of Probation:')}
  ${p("Your tenure with the Company will commence with a probationary period lasting up to Six months. Throughout this time, it is imperative that you substantiate your suitability for the assigned position to the Company's contentment. The Company holds the discretionary authority to either terminate or extend your probation period, contingent upon your performance and occupational adeptness in the designated role.")}
  ${p("During the probationary phase, the Company retains the prerogative to adjust your compensation or withhold salary should your performance fail to meet expectations. Post the probationary term, a comprehensive evaluation will be conducted based on your execution of assigned tasks, fulfilment of roles, and adherence to responsibilities. The Company will then make a determination regarding the continuation or cessation of your employment. It is emphasized that the Company reserves the right to modify the agreed-upon payment terms in response to unsatisfactory performance.")}

  ${h('Place of Employment:')}
  ${p(`The Candidate's initial place of posting/employment will be in <strong>${place}</strong> and the Candidate shall have to travel to different cities during the tenure of his/her employment. You may be required to travel on Company work, and you will be reimbursed expenses as per Company policies.`)}
  ${p("Your travel/conveyance allowance/reimbursement is strictly between yourself and the Company. It has been determined to be claimed based on actual expenses as preapproved by your manager.")}

  ${h('Training and Development:')}
  ${p("During the course of your employment, to enable you to discharge your duties efficiently, Company may invest in you by providing you specialized and/or certified job-related training. If you choose to separate from the Company after undergoing the training (before a minimum period of 12 months), Company has the right to recover any expenses expended on your training. Such training and development costs shall not exceed 5% of the total CTC with a cap of Rs 50,000/- annually.")}

  ${h('Confidentiality Clause:')}
  ${p('The Candidate recognizes and acknowledges that the system, business materials, marketing strategies, operational planning, product/service pricing policies, client details, salary, revenues, user information, software knowledge and all system documentation relating thereto ("Proprietary Information") which Company owns, plans or develops, whether for its own use or for use by its clients or relating thereto are confidential and proprietary to the Company.')}

  ${h('Non-Disclosure Clause:')}
  ${p("The Candidate agrees that, except as directed by the Company, the Candidate will not at any time, whether during or after his/her employment with the Company, disclose to any person or use any confidential information, or permit any person to examine and/or make copies of any documents which contain or are derived from Confidential Information, whether prepared by the Candidate or otherwise coming into the Candidate's possession or control without the prior written permission of the Company.")}

  ${h('Termination of Contract:')}
  ${p("The Candidate shall serve a notice period of <strong>60 Days</strong> for/before separating from the Company's services.")}
  ${p("The Company and the Candidate acknowledge and agree that the serving of notice for leaving the service of the Company is essence of the Contract and shall be strictly adhered to.")}
  ${p("Upon your resignation or retirement from the company or termination of your services, you are required to return all assets and properties of the Company such as systems, business materials, documents, correspondence, machines, data, files, books etc.")}
  ${p("In special cases or projects assignments, you may be required to provide telephonic support or project support at a mutually convenient time and place for a term of additional 30 (Thirty) days beyond the 60 days' notice period.")}

  ${h('Non-Compete:')}
  ${p('As per the terms and conditions discussed and confirmed, you cannot take any other employment or any other contract work, directly or indirectly, for and from any of "Simpliigence clients" or "clients of Simpliigence clients" for a period of <strong>3 years</strong> after leaving the job or termination of your job. In case you render your service to any such client within 1 year, Simpliigence will have the right to take legal action for any claims or damages.')}

  ${h('Non-Solicitation:')}
  ${p('For a period of <strong>5 years</strong> after termination of this employment, you shall not:')}
  ${indent('(a) Solicit or take away from the Company the business of any customers or clients of the Company; OR')}
  ${indent('(b) Entice away from the Company any person who at any time during such period shall have been an employee of the Company.')}

  ${h('Exclusive Employment:')}
  ${p('During your employment with the Company, you shall devote your time and attention exclusively to the duties entrusted to you and shall not engage directly or indirectly to work for any other person, firm or company in any capacity whatsoever, either part time, consultation or on job-to-job basis, without obtaining prior written permission of the Chairman of the Board of Directors.')}

  ${h('Working Hours:')}
  ${p('The Company reserves the right to modify or alter its working hours, and you may be required to work in shifts. Working hours will be decided by the Company management from time to time keeping the Client requirements in mind.')}

  ${h('Appraisals:')}
  ${p('There will be an appraisal conducted by your immediate supervisor or manager after your probation period of One month(s) with the Company, then on an annual basis. You are entitled to a salary hike only after completion of continuous One year of service, at the sole discretion of the Company.')}

  ${h('Miscellaneous Provisions:')}
  ${p('You will strictly adhere to the guidelines, policies and/or code of conduct of the Company pertaining to working hours, leaves, dress code, office cultures and conducts.')}
  ${p('It is your responsibility to notify the Company of any changes in your personal information (address, contact phone number, qualifications, marital status, passport details etc.) within 15 working days.')}
  ${p('You will abide by the Employee Service Conditions as enumerated above. Any of the terms and conditions of service may be modified, altered or changed at any time by the Company at its discretion.')}
  ${p("You are required to sign and submit a copy of this employment contract as a token of your acceptance of Company's terms and conditions.")}

  <hr style="margin:16px 0"/>
  ${p('We once again welcome you to our team and look forward to your contribution towards success of the organization and yourself.')}
  <p style="margin:4px 0">Thank You,</p>
  <p style="margin:4px 0">Best Regards,</p>
  <p style="margin:4px 0;font-weight:bold">For Simpliigence Private Limited</p>
  <br/>
  <p style="margin:4px 0">__________________</p>
  <p style="margin:4px 0;font-weight:bold">Raghu Seetharam</p>
  <p style="margin:4px 0">CEO</p>

  <hr style="margin:20px 0"/>
  <p style="font-weight:bold;font-size:12pt;margin:0 0 8px 0">Verified and Accepted:</p>
  ${p(`I have read, understood and accepted the above Employee Service Conditions/Contract. I understand that the Employee Service Conditions are the basis of my employment with the Company. I am under no obligation or duress to accept these terms and conditions of employment; I accept them of my own free choice and will.`)}
  <br/>
  <p style="margin:4px 0">__________________</p>
  <p style="margin:4px 0;font-weight:bold">${empName}</p>
  <p style="margin:4px 0">Date: ${contractDt} &nbsp;&nbsp;&nbsp; Place: ${place}</p>

  <!-- APPENDIX A -->
  <div style="page-break-before:always;margin-top:32px">
    <h2 style="text-align:center;font-size:13pt;margin:0 0 4px 0">Appendix – A</h2>
    <p style="font-weight:bold;font-size:9pt;margin:0 0 14px 0">Potential Salary Structure for ${empName} — Simpliigence Private Limited, India</p>
    <table style="width:100%;border-collapse:collapse;font-size:9pt">
      <tr style="background:#f0f0f0;font-weight:bold">
        <th style="border:1px solid #ccc;padding:5px 6px;text-align:left">Particulars of Salary</th>
        <th style="border:1px solid #ccc;padding:5px 6px;text-align:right">Monthly (Rs.)</th>
        <th style="border:1px solid #ccc;padding:5px 6px;text-align:right">Annually (Rs.)</th>
        <th style="border:1px solid #ccc;padding:5px 6px;text-align:left">Remarks</th>
      </tr>
      <tr style="font-weight:bold">
        <td style="border:1px solid #ccc;padding:4px 6px">FIXED CTC</td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right">${inrFmt(Math.round(fixed/12))}</td>
        <td style="border:1px solid #ccc;padding:4px 6px;text-align:right">${inrFmt(fixed)}</td>
        <td style="border:1px solid #ccc;padding:4px 6px">Payable Monthly</td>
      </tr>
      ${ctcRows}
      ${variable > 0 ? `<tr style="font-weight:bold"><td style="border:1px solid #ccc;padding:4px 6px">Variable Component **</td><td style="border:1px solid #ccc;padding:4px 6px;text-align:right">—</td><td style="border:1px solid #ccc;padding:4px 6px;text-align:right">${inrFmt(variable)}</td><td style="border:1px solid #ccc;padding:4px 6px;font-size:8pt">At discretion of Company</td></tr>` : ''}
      <tr style="font-weight:bold;background:#f5f5f5">
        <td style="border:1px solid #ccc;padding:5px 6px">TOTAL CTC</td>
        <td style="border:1px solid #ccc;padding:5px 6px;text-align:right">${inrFmt(Math.round((fixed+variable)/12))}</td>
        <td style="border:1px solid #ccc;padding:5px 6px;text-align:right">${inrFmt(fixed+variable)}</td>
        <td style="border:1px solid #ccc;padding:5px 6px"></td>
      </tr>
    </table>
    <p style="font-size:8.5pt;margin-top:10px">* Tax-free subject to bills submitted &nbsp;&nbsp; ** Variable at Company discretion; not a guaranteed right</p>
    <br/>
    <p style="font-weight:bold;margin:0 0 28px 0">UNDERSTOOD &amp; ACCEPTED:</p>
    <p style="margin:4px 0">__________________</p>
    <p style="margin:4px 0;font-weight:bold">${empName}</p>
  </div>
</div>`;
  }

  async function send() {
    setError('');
    if (!signerEmail) { setError('Signer email is required.'); return; }
    setSending(true);
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employee.id,
          type: 'offer',
          signerEmail,
          signerName,
          details: {
            employeeName:    empName,
            employeeAddress: empAddr,
            designation:     desig,
            contractDate:    contractDt,
            joiningDate:     joiningDt,
            placeOfPosting:  place,
            fixedAnnualCTC:  fixed,
            variableAnnualCTC: variable,
            ctcRows:         rows,
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'Send failed.'); return; }
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const steps = ['Basic Info', 'CTC Details', 'Preview & Edit', 'Send'];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full flex flex-col ${step === 3 ? 'max-w-3xl max-h-[96vh]' : 'max-w-2xl max-h-[92vh]'}`}>

        {/* Header */}
        <div className="shrink-0 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">Employment Contract</h2>
            <p className="text-xs text-gray-400 mt-0.5">{employee.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Step indicator */}
        <div className="shrink-0 flex px-6 pt-4 pb-0 gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex-1 text-center">
              <div className={`h-1.5 rounded-full mb-1.5 ${i + 1 <= step ? 'bg-blue-600' : 'bg-gray-100'}`} />
              <span className={`text-[10px] font-medium ${i + 1 === step ? 'text-blue-600' : 'text-gray-400'}`}>{s}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* ── Step 1: Basic Info ── */}
          {step === 1 && (
            <>
              <p className="text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2">
                Fields are pre-filled from the employee profile. Review and correct if needed.
              </p>
              <Inp label="Employee Full Name" value={empName} onChange={setEmpName} />
              <TextArea label="Employee Residential Address" value={empAddr} onChange={setEmpAddr} rows={3}
                placeholder="Full address including city, pincode" />
              <Inp label="Designation" value={desig} onChange={setDesig} />
              <div className="grid grid-cols-2 gap-3">
                <Inp label="Contract Effective Date" value={contractDt} onChange={setContractDt}
                  placeholder="21st May 2026" />
                <Inp label="Date of Joining" value={joiningDt} onChange={setJoiningDt}
                  placeholder="21st April 2026" />
              </div>
              <Inp label="Place of Posting" value={place} onChange={setPlace} />
            </>
          )}

          {/* ── Step 2: CTC ── */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Annual Fixed CTC (Rs.)</label>
                  <input type="number" value={fixedCtc} onChange={e => { setFixedCtc(e.target.value); setRows([]); }}
                    placeholder="e.g. 2200000"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400" />
                  {fixed > 0 && <p className="text-xs text-gray-400 mt-1">Rs {inrFmt(fixed)}/- ({inrWords(fixed)})</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Annual Variable CTC (Rs., optional)</label>
                  <input type="number" value={variableCtc} onChange={e => { setVariableCtc(e.target.value); setRows([]); }}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>

              {fixed > 0 && rows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-700">CTC Breakup — Appendix A</p>
                    <button onClick={() => setRows(defaultCTCRows(fixed, variable))}
                      className="text-xs text-blue-500 hover:underline">↺ Reset to defaults</button>
                  </div>

                  {ctcMatchWarning && (
                    <div className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg px-3 py-2 mb-2">
                      ⚠ Breakup total (Rs {inrFmt(rowsTotal)}) ≠ Fixed CTC (Rs {inrFmt(fixed)}). Adjust rows below.
                    </div>
                  )}

                  <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                    <div className="grid bg-gray-50 border-b border-gray-200 font-semibold text-gray-600"
                      style={{ gridTemplateColumns: '1fr 100px 110px' }}>
                      <div className="px-3 py-2">Component</div>
                      <div className="px-2 py-2 text-right">Monthly (Rs)</div>
                      <div className="px-2 py-2 text-right">Annual (Rs)</div>
                    </div>

                    {rows.map(r => r.isSpacer ? (
                      <div key={r.id} className="h-2 bg-gray-50 border-b border-gray-100" />
                    ) : (
                      <div key={r.id}
                        className={`grid border-b border-gray-100 items-center ${r.bold ? 'bg-blue-50 font-semibold' : ''}`}
                        style={{ gridTemplateColumns: '1fr 100px 110px' }}>
                        <div className="px-3 py-1.5">{r.label}</div>
                        <div className="px-2 py-1.5 text-right text-gray-500">
                          {r.id === 'variable' ? '—' : inrFmt(Math.round(r.annual/12))}
                        </div>
                        <div className="px-2 py-1">
                          {r.id === 'fixed_total' ? (
                            <span className="block text-right pr-1">{inrFmt(r.annual)}</span>
                          ) : (
                            <input type="number" value={r.annual}
                              onChange={e => updateRow(r.id, parseInt(e.target.value) || 0)}
                              className="w-full text-right border border-gray-200 rounded px-1 py-0.5 text-xs focus:ring-1 focus:ring-blue-400" />
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Total row */}
                    <div className="grid bg-gray-100 font-bold" style={{ gridTemplateColumns: '1fr 100px 110px' }}>
                      <div className="px-3 py-2">Total CTC</div>
                      <div className="px-2 py-2 text-right">{inrFmt(Math.round((fixed+variable)/12))}</div>
                      <div className="px-2 py-2 text-right">{inrFmt(fixed+variable)}</div>
                    </div>
                  </div>
                </div>
              )}

              {fixed <= 0 && (
                <p className="text-xs text-red-500">Enter the Annual Fixed CTC above to generate the breakup.</p>
              )}
            </>
          )}

          {/* ── Step 3: Preview & Edit ── */}
          {step === 3 && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">✏️</span>
                <div className="text-xs text-blue-800">
                  <span className="font-semibold">Full document preview.</span> Click any text to edit clauses, names, or dates directly. To change employee details or CTC, click <strong>← Back</strong>.
                </div>
              </div>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">Employment Contract — Full Document</span>
                  <button
                    onClick={() => setPreviewKey(k => k + 1)}
                    className="text-xs text-blue-500 hover:underline"
                    title="Reset any in-preview edits and regenerate from form data"
                  >↺ Reset preview</button>
                </div>
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="p-4 overflow-y-auto text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:ring-inset"
                  style={{ minHeight: '520px', maxHeight: '60vh' }}
                />
              </div>
            </>
          )}

          {/* ── Step 4: Send ── */}
          {step === 4 && (
            <>
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5 text-gray-700">
                <div><span className="font-medium">Employee:</span> {empName}</div>
                <div><span className="font-medium">Designation:</span> {desig}</div>
                <div><span className="font-medium">Joining:</span> {joiningDt}</div>
                <div><span className="font-medium">Fixed CTC:</span> Rs {inrFmt(fixed)}</div>
                {variable > 0 && <div><span className="font-medium">Variable:</span> Rs {inrFmt(variable)}</div>}
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-700">Zoho Sign — E-Signature Recipient</p>
                <Inp label="Signer Name" value={signerName} onChange={setSignerName} />
                <Inp label="Signer Email" value={signerEmail} onChange={setSignerEmail}
                  placeholder="employee@example.com" />
                <p className="text-xs text-blue-500">
                  Zoho Sign will send an email to this address with a link to sign the employment contract.
                </p>
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
              )}
            </>
          )}
        </div>

        {/* Footer buttons */}
        <div className="shrink-0 border-t border-gray-100 px-6 py-4 flex gap-3">
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)}
              className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-xl py-2.5 hover:bg-gray-50">
              ← Back
            </button>
          ) : (
            <button onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-xl py-2.5 hover:bg-gray-50">
              Cancel
            </button>
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 2 && fixed <= 0}
              className="flex-1 bg-blue-600 text-white text-sm rounded-xl py-2.5 hover:bg-blue-700 disabled:opacity-50 font-medium">
              {step === 3 ? 'Looks Good →' : 'Next →'}
            </button>
          ) : (
            <button
              onClick={send}
              disabled={sending || !signerEmail}
              className="flex-1 bg-green-600 text-white text-sm rounded-xl py-2.5 hover:bg-green-700 disabled:opacity-50 font-medium">
              {sending ? 'Generating & Sending…' : '✉️ Send for e-Signature'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN DOCUMENTS PANEL
═══════════════════════════════════════════════════════════════════════════ */

export default function DocumentsPanel({ employee }: { employee: Employee }) {
  const [docs,       setDocs]       = useState<Doc[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState(false);
  const [docType,    setDocType]    = useState<'offer' | 'experience' | 'increment'>('offer');
  const [sending,    setSending]    = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');
  const [showOffer,  setShowOffer]  = useState(false);

  // Simple modal fields for experience/increment
  const [signerEmail, setSignerEmail] = useState(employee.email ?? '');
  const [signerName,  setSignerName]  = useState(employee.name);

  const todayFormatted = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const [expFields, setExpFields] = useState({
    relievingDate: employee.termination_date
      ? new Date(employee.termination_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
      : todayFormatted,
    letterDate: todayFormatted,
  });

  const [incFields, setIncFields] = useState({
    currentSalary:  employee.salary ? `Rs. ${Number(employee.salary).toLocaleString('en-IN')} per month` : '',
    newSalary:      '',
    newRole:        '',
    effectiveDate:  todayFormatted,
    letterDate:     todayFormatted,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/documents?employeeId=${employee.id}`);
      const j = await r.json();
      setDocs(j.documents ?? []);
    } finally { setLoading(false); }
  }, [employee.id]);

  useEffect(() => { load(); }, [load]);

  async function syncStatus(docId: string) {
    await fetch('/api/documents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: docId }),
    });
    load();
  }

  async function sendSimple() {
    setError('');
    if (!signerEmail) { setError('Signer email required.'); return; }

    let details: Record<string, string> = {};
    if (docType === 'experience') {
      details = {
        employeeName:  employee.name,
        role:          employee.role,
        department:    employee.dept,
        joiningDate:   employee.joined
          ? new Date(employee.joined).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
          : '—',
        ...expFields,
      };
    } else if (docType === 'increment') {
      details = {
        employeeName: employee.name,
        currentRole:  employee.role,
        department:   employee.dept,
        ...incFields,
      };
    }

    setSending(true);
    try {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: employee.id, type: docType, details, signerEmail, signerName }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'Failed to send.'); return; }
      setSuccess(`✅ Sent! ${signerEmail} will receive a Zoho Sign email shortly.`);
      setModal(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally { setSending(false); }
  }

  return (
    <div>
      {/* Offer letter multi-step modal */}
      {showOffer && (
        <OfferLetterModal
          employee={employee}
          onClose={() => setShowOffer(false)}
          onSent={() => {
            setShowOffer(false);
            setSuccess('✅ Employment contract sent via Zoho Sign!');
            load();
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">HR Letters & e-Signature</h3>
        <button
          onClick={() => { setModal(true); setError(''); setSuccess(''); }}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-blue-700"
        >
          ＋ Generate Letter
        </button>
      </div>

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3">
          {success}
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
      ) : docs.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <div className="text-3xl mb-2">📄</div>
          <p className="text-sm">No letters yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="border border-gray-100 rounded-xl p-3 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{doc.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[doc.status]}`}>
                      {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Sent to: {doc.signer_email} · {fmt(doc.created_at)}
                    {doc.signed_at && <span className="ml-2 text-green-600">· Signed: {fmt(doc.signed_at)}</span>}
                  </div>
                </div>
                {doc.status === 'sent' && (
                  <button onClick={() => syncStatus(doc.id)}
                    className="text-xs text-blue-600 hover:underline shrink-0">↻ Sync</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Letter type picker modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="font-semibold text-gray-800">Generate HR Letter</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Letter Type</label>
                {(['offer', 'experience', 'increment'] as const).map(t => (
                  <button key={t} onClick={() => setDocType(t)}
                    className={`w-full text-left px-4 py-3 mb-2 rounded-xl border-2 text-sm transition-colors ${
                      docType === t ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium' : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}>
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>

              <hr className="border-gray-100" />

              {/* Offer → open the multi-step modal */}
              {docType === 'offer' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    The employment contract uses a 4-step wizard — enter joining details, edit the CTC breakup, preview the full contract, then send for e-signature.
                  </p>
                  <button
                    onClick={() => { setModal(false); setShowOffer(true); }}
                    className="w-full bg-blue-600 text-white text-sm rounded-xl py-2.5 hover:bg-blue-700 font-medium">
                    Open Contract Wizard →
                  </button>
                </div>
              )}

              {/* Experience */}
              {docType === 'experience' && (
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-1">
                    <div><span className="font-medium">Employee:</span> {employee.name} · {employee.role}</div>
                    <div><span className="font-medium">Joined:</span> {fmt(employee.joined)}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Last Working Day</label>
                    <input type="text" value={expFields.relievingDate}
                      onChange={e => setExpFields(f => ({ ...f, relievingDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Letter Date</label>
                    <input type="text" value={expFields.letterDate}
                      onChange={e => setExpFields(f => ({ ...f, letterDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <hr className="border-gray-100" />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Signer Name</label>
                    <input value={signerName} onChange={e => setSignerName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 mb-2" />
                    <label className="block text-xs font-medium text-gray-600 mb-1">Signer Email</label>
                    <input value={signerEmail} onChange={e => setSignerEmail(e.target.value)}
                      placeholder="employee@example.com"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400" />
                  </div>
                  {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
                  <div className="flex gap-3">
                    <button onClick={() => setModal(false)}
                      className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-xl py-2.5 hover:bg-gray-50">Cancel</button>
                    <button onClick={sendSimple} disabled={sending}
                      className="flex-1 bg-blue-600 text-white text-sm rounded-xl py-2.5 hover:bg-blue-700 disabled:opacity-60 font-medium">
                      {sending ? 'Sending…' : '✉️ Generate & Send'}
                    </button>
                  </div>
                </div>
              )}

              {/* Increment */}
              {docType === 'increment' && (
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600">
                    <span className="font-medium">Employee:</span> {employee.name} · {employee.role}
                  </div>
                  {[
                    { label: 'Current Monthly CTC', key: 'currentSalary', ph: 'e.g. Rs. 80,000 per month' },
                    { label: 'Revised Monthly CTC', key: 'newSalary',     ph: 'e.g. Rs. 95,000 per month' },
                    { label: 'New Designation (blank = no promotion)', key: 'newRole', ph: employee.role },
                    { label: 'Effective Date', key: 'effectiveDate', ph: '' },
                    { label: 'Letter Date',    key: 'letterDate',    ph: '' },
                  ].map(({ label, key, ph }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                      <input value={(incFields as Record<string,string>)[key]}
                        onChange={e => setIncFields(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={ph}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400" />
                    </div>
                  ))}
                  <hr className="border-gray-100" />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Signer Name</label>
                    <input value={signerName} onChange={e => setSignerName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 mb-2" />
                    <label className="block text-xs font-medium text-gray-600 mb-1">Signer Email</label>
                    <input value={signerEmail} onChange={e => setSignerEmail(e.target.value)}
                      placeholder="employee@example.com"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400" />
                  </div>
                  {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
                  <div className="flex gap-3">
                    <button onClick={() => setModal(false)}
                      className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-xl py-2.5 hover:bg-gray-50">Cancel</button>
                    <button onClick={sendSimple} disabled={sending}
                      className="flex-1 bg-blue-600 text-white text-sm rounded-xl py-2.5 hover:bg-blue-700 disabled:opacity-60 font-medium">
                      {sending ? 'Sending…' : '✉️ Generate & Send'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
