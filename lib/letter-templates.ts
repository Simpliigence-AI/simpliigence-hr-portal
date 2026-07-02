/**
 * HR Letter Templates — pure-JS multi-page PDF builder, zero npm deps
 * A4 (595×842 pts), Times-Roman / Times-Bold built-in fonts
 */

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */

type PdfOp =
  | { kind: 'text'; text: string; x: number; y: number; size: number; bold?: boolean }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; w?: number };

export interface CTCRow {
  id:       string;
  label:    string;
  annual:   number;  // editable by HR
  remarks:  string;
  bold?:    boolean;
  isSpacer?: boolean;
}

export interface OfferLetterDetails {
  // Employee
  employeeName:    string;
  employeeAddress: string;
  designation:     string;
  // Dates
  contractDate:    string;  // e.g. "21st May 2026"
  joiningDate:     string;  // e.g. "21st April 2026"
  // Location
  placeOfPosting:  string;
  // CTC
  fixedAnnualCTC:    number;
  variableAnnualCTC: number;
  ctcRows:           CTCRow[];
}

/* ═══════════════════════════════════════════════════════════════════════════
   CTC HELPERS
═══════════════════════════════════════════════════════════════════════════ */

/** Format number in Indian number system: 2200000 → "22,00,000" */
export function inrFmt(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return s;
  let result = s.slice(-3);
  let rest = s.slice(0, -3);
  while (rest.length > 2) { result = rest.slice(-2) + ',' + result; rest = rest.slice(0, -2); }
  return (rest ? rest + ',' : '') + result;
}

/** Number to Indian words: 2200000 → "Twenty Two Lakh Only" */
export function inrWords(amount: number): string {
  const u = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const t = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two = (n: number): string => n < 20 ? u[n] : (t[Math.floor(n/10)] + (n%10 ? ' '+u[n%10] : '')).trim();
  const three = (n: number): string => {
    const h = Math.floor(n/100), r = n%100;
    return ((h ? u[h]+' Hundred ' : '') + (r ? two(r) : '')).trim();
  };
  if (!amount) return 'Zero Only';
  let w = '';
  const cr = Math.floor(amount/10000000);
  const lk = Math.floor((amount%10000000)/100000);
  const th = Math.floor((amount%100000)/1000);
  const re = amount%1000;
  if (cr) w += two(cr)+' Crore ';
  if (lk) w += two(lk)+' Lakh ';
  if (th) w += two(th)+' Thousand ';
  if (re) w += three(re)+' ';
  return w.trim()+' Only';
}

/** Default CTC breakup rows for a given fixed annual CTC */
export function defaultCTCRows(fixedAnnual: number, variableAnnual = 0): CTCRow[] {
  const basic  = Math.round(fixedAnnual * 0.50);
  const hra    = Math.round(fixedAnnual * 0.25);
  const lta    = 120000;
  const news   = 12000;
  const tel    = 15000;
  const cedu   = 2400;
  const car    = 28800;
  const epf    = 21600;
  const other  = fixedAnnual - basic - hra - lta - news - tel - cedu - car - epf;

  const rows: CTCRow[] = [
    { id:'fixed_total', label:'- FIXED',               annual:fixedAnnual,  remarks:'Payable Monthly',  bold:true },
    { id:'spacer1',     label:'',                       annual:0,            remarks:'',                 isSpacer:true },
    { id:'basic',       label:'Basic',                  annual:basic,        remarks:'Taxable' },
    { id:'hra',         label:'House Rent Allowance',   annual:hra,          remarks:'Taxable partially if Rent receipts provided (per Income Tax rules)' },
    { id:'lta',         label:'Leave Travel Allowance', annual:lta,          remarks:'Claimed twice in a block of four years. Current block is 2022-2025' },
    { id:'news',        label:'Newspaper/Journal Allowance', annual:news,    remarks:'Tax free, provided Bills submitted *' },
    { id:'tel',         label:'Telephone/Internet Allowance', annual:tel,    remarks:'Tax free, provided Bills submitted *' },
    { id:'cedu',        label:'Children Education Allowance', annual:cedu,   remarks:'Tax free, provided Bills submitted *' },
    { id:'car',         label:'Car Maintenance',        annual:car,          remarks:'Tax free, provided Bills submitted *' },
    { id:'other',       label:'Other Allowances',       annual:other,        remarks:'Taxable' },
    { id:'epf',         label:'EPF Contribution',       annual:epf,          remarks:'Tax Free' },
  ];

  if (variableAnnual > 0) {
    rows.push(
      { id:'spacer2',  label:'', annual:0, remarks:'', isSpacer:true },
      { id:'variable', label:'Variable Component **', annual:variableAnnual, remarks:'At discretion of Company; not a guaranteed right', bold:true },
    );
  }
  return rows;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PDF BUILDER — MULTI-PAGE
═══════════════════════════════════════════════════════════════════════════ */

const PAGE_W = 595, PAGE_H = 842;
const TOP_Y  = 762, BOT_Y  = 72;
const LM = 62, RM = 533;
const LS = 1.48;

function pdfEsc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

function buildStream(ops: PdfOp[]): Buffer {
  const out: string[] = [];
  let inBT = false, cf = '', cs = 0;
  const endBT   = () => { if (inBT)  { out.push('ET');  inBT = false; } };
  const startBT = () => { if (!inBT) { out.push('BT'); inBT = true; } };
  for (const op of ops) {
    if (op.kind === 'line') {
      endBT();
      out.push(`${op.w ?? 0.5} w`);
      out.push(`${op.x1} ${op.y1} m ${op.x2} ${op.y2} l S`);
    } else {
      startBT();
      const f = op.bold ? '/F2' : '/F1';
      if (f !== cf || op.size !== cs) { out.push(`${f} ${op.size} Tf`); cf = f; cs = op.size; }
      out.push(`1 0 0 1 ${op.x} ${op.y} Tm`);
      out.push(`(${pdfEsc(op.text)}) Tj`);
    }
  }
  if (inBT) out.push('ET');
  return Buffer.from(out.join('\n'), 'latin1');
}

function buildMultiPagePDF(pages: PdfOp[][]): Buffer {
  // Object layout:
  //  1 = Catalog, 2 = Pages dict, 3 = Font Roman, 4 = Font Bold
  //  5+i*2 = Page i,  6+i*2 = Stream i
  const n = pages.length;
  const pageIds   = pages.map((_, i) => 5 + i * 2);
  const streamIds = pages.map((_, i) => 6 + i * 2);
  const totalObjs = 4 + n * 2;
  const offsets: number[] = new Array(totalObjs + 1).fill(0);

  const bufs: Buffer[] = [];
  let pos = 0;
  const w = (s: string) => { const b = Buffer.from(s + '\n', 'latin1'); bufs.push(b); pos += b.length; };
  const raw = (b: Buffer) => { bufs.push(b); pos += b.length; };

  w('%PDF-1.4');

  offsets[1] = pos;
  w(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`);

  offsets[2] = pos;
  w(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${n} >>\nendobj`);

  offsets[3] = pos;
  w(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>\nendobj`);

  offsets[4] = pos;
  w(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>\nendobj`);

  for (let i = 0; i < n; i++) {
    const stream = buildStream(pages[i]);
    offsets[pageIds[i]] = pos;
    w(`${pageIds[i]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}]\n/Contents ${streamIds[i]} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj`);
    offsets[streamIds[i]] = pos;
    raw(Buffer.from(`${streamIds[i]} 0 obj\n<< /Length ${stream.length} >>\nstream\n`, 'latin1'));
    raw(stream);
    raw(Buffer.from('\nendstream\nendobj\n', 'latin1'));
  }

  const xrefPos = pos;
  const xr = ['xref', `0 ${totalObjs + 1}`, '0000000000 65535 f '];
  for (let i = 1; i <= totalObjs; i++) xr.push(offsets[i].toString().padStart(10,'0') + ' 00000 n ');
  xr.push('trailer', `<< /Size ${totalObjs + 1} /Root 1 0 R >>`, 'startxref', String(xrefPos), '%%EOF');
  raw(Buffer.from(xr.join('\n'), 'latin1'));

  return Buffer.concat(bufs);
}

/* ═══════════════════════════════════════════════════════════════════════════
   DOC BUILDER — auto page-break, word-wrap, tables
═══════════════════════════════════════════════════════════════════════════ */

class DocBuilder {
  private pages: PdfOp[][] = [[]];
  private _y = TOP_Y;
  private totalPages: number; // will be set on build

  get ops(): PdfOp[] { return this.pages[this.pages.length - 1]; }
  get y(): number    { return this._y; }
  get pageNum(): number { return this.pages.length; }

  private ensureSpace(need: number) {
    if (this._y - need < BOT_Y) { this.pages.push([]); this._y = TOP_Y; }
  }

  txt(text: string, x: number, y: number, size: number, bold = false) {
    this.ops.push({ kind: 'text', text, x, y, size, bold });
  }

  line(x1: number, y1: number, x2: number, y2: number, w = 0.5) {
    this.ops.push({ kind: 'line', x1, y1, x2, y2, w });
  }

  hRule(w = 0.5) { this.line(LM, this._y, RM, this._y, w); }

  print(text: string, x: number, size: number, bold = false) {
    this.ensureSpace(Math.ceil(size * LS) + 2);
    this.txt(text, x, this._y, size, bold);
    this._y -= Math.ceil(size * LS);
  }

  gap(n = 10) { this._y -= n; }

  /** word-wrap paragraph */
  para(text: string, size = 11, indent = 0) {
    const maxCh = Math.floor((RM - LM - indent) / (size * 0.52));
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxCh && line) { this.print(line, LM + indent, size); line = word; }
      else line = candidate;
    }
    if (line) this.print(line, LM + indent, size);
  }

  /** heading + gap */
  heading(text: string, size = 12) {
    this.gap(6);
    this.print(text, LM, size, true);
    this.gap(2);
  }

  /** two-column row (label: value) */
  row(label: string, value: string, size = 11) {
    this.ensureSpace(Math.ceil(size * LS) + 2);
    this.txt(label + ':', LM + 10, this._y, size, true);
    this.txt(value,       LM + 230, this._y, size);
    this._y -= Math.ceil(size * LS);
  }

  /** Appendix A CTC table */
  ctcTable(rows: CTCRow[], fixedAnnual: number, variableAnnual: number) {
    const sx = LM;
    const cw = [190, 80, 90, 153]; // col widths: Particulars, Monthly, Annual, Remarks
    const tw = cw.reduce((a,b)=>a+b,0);
    const rh = 15; // row height
    const sz = 8.5;
    const pad = 3;

    const drawRow = (cells: string[], y: number, bold = false, bg = false) => {
      let x = sx;
      cells.forEach((cell, i) => {
        if (cell) this.txt(cell, x + pad, y - rh + pad + 2, sz, bold);
        x += cw[i];
      });
    };

    const tableRows: { cells: string[]; bold?: boolean }[] = [
      { cells: ['Particulars of Salary', `Monthly\nin Rs.`, `Annually\nin Rs.`, `Remarks / Designation:\n${rows[0] ? '' : ''}`], bold: true },
      { cells: ['Cost to Company', '', '', ''] },
      { cells: [`- FIXED`, inrFmt(Math.round(fixedAnnual/12)), inrFmt(fixedAnnual), 'Payable Monthly'], bold: true },
      { cells: ['', '', '', ''] },
      ...rows
        .filter(r => !r.isSpacer && r.id !== 'fixed_total' && r.id !== 'variable')
        .map(r => ({
          cells: [r.label, inrFmt(Math.round(r.annual/12)), inrFmt(r.annual), r.remarks],
          bold: r.bold,
        })),
    ];

    if (variableAnnual > 0) {
      tableRows.push(
        { cells: ['', '', '', ''] },
        { cells: ['Variable Component **', '-', inrFmt(variableAnnual), 'At discretion of Company'], bold: true },
      );
    }

    const tableHeight = tableRows.length * rh + rh; // +1 for bottom border
    this.ensureSpace(tableHeight + 20);

    const startY = this._y;

    // Draw all rows
    tableRows.forEach((row, idx) => {
      drawRow(row.cells, startY - idx * rh, row.bold ?? false);
    });

    // Horizontal lines
    for (let i = 0; i <= tableRows.length; i++) {
      const ly = startY - i * rh;
      this.line(sx, ly, sx + tw, ly, 0.4);
    }

    // Vertical lines
    let x = sx;
    for (const w of [...cw, 0]) {
      this.line(x, startY, x, startY - tableRows.length * rh, 0.4);
      x += w;
    }

    this._y = startY - tableRows.length * rh - 6;
  }

  /** Build final PDF bytes */
  build(): Buffer {
    // Add page numbers to each page
    this.pages.forEach((pageOps, i) => {
      pageOps.push({
        kind: 'text', text: `Page ${i+1} of ${this.pages.length}`,
        x: PAGE_W/2 - 25, y: 30, size: 8,
      });
    });
    return buildMultiPagePDF(this.pages);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   EMPLOYMENT CONTRACT (Offer Letter)
═══════════════════════════════════════════════════════════════════════════ */

export interface OfferLetterResult {
  pdfBytes:           Buffer;
  title:              string;
  signaturePage:      number;  // 0-based page index
  signatureYFromTop:  number;  // y in PDF points measured from page TOP (Zoho Sign convention)
}

export async function generateOfferLetter(
  d: OfferLetterDetails,
): Promise<OfferLetterResult> {
  const b = new DocBuilder();

  // ── Letterhead (matches Experience / Increment letters) ─────────────────
  b.print('SIMPLIIGENCE PRIVATE LIMITED', PAGE_W / 2 - 100, 18, true);
  b.print('Technology Consulting  |  Salesforce  |  AI/ML  |  GCC Advisory', PAGE_W / 2 - 130, 8.5);
  b.print('No. 179/1, 10th-A Main Road, Indiranagar 2nd Stage, Bangalore, India - 560038', LM, 8.5);
  b.gap(4);
  b.hRule(1.5);
  b.gap(16);

  // ── Page 1 ─────────────────────────────────────────────────────────────

  // Title
  b.print('EMPLOYMENT CONTRACT', PAGE_W/2 - 70, 16, true);
  b.gap(16);

  b.para(`This Employment Contract is made at Bangalore, Karnataka and effective this ${d.contractDate}.`);
  b.gap(10);

  b.para(`BETWEEN: ${d.employeeName} (the "Employee"), an Indian Resident residing at: ${d.employeeAddress}`);
  b.gap(6);
  b.print('The Party to the First part', LM + 20, 11);
  b.gap(8);

  b.para('AND: Simpliigence Private Limited (the "Company"), a Private Limited Company having its registered office at: No. 179/1, 10th-A Main Road, Indiranagar 2nd Stage, Bangalore, India - 560038.');
  b.gap(6);
  b.print('The Party to the Second part', LM + 20, 11);
  b.gap(8);

  b.para('(Collectively referred to as "Parties")');
  b.gap(10);

  b.para(`This Contract is entered by the Parties after the issue of appointment letter or execution of the employment contract dated ${d.joiningDate}.`);
  b.gap(8);

  b.para(`WHEREAS the Company desires to employ the Party to the First Part and the said Party desires to be employed/appointed by the Company in employment for the post of a ${d.designation}.`);
  b.gap(12);

  b.print('Employee Service Conditions:', LM, 12, true);
  b.para('Following are the terms and conditions associated with your employment:');
  b.gap(8);

  b.para('"Company" or "Simpliigence" for all purposes shall mean Simpliigence Private Limited');
  b.gap(4);
  b.para(`"You" or "Candidate" for all purposes shall mean ${d.employeeName}`);
  b.gap(10);

  b.print('Remuneration:', LM, 11, true);
  b.para(
    `Your annual Gross salary/CTC will be Rs ${inrFmt(d.fixedAnnualCTC)}/- ` +
    `(Rupees ${inrWords(d.fixedAnnualCTC)}).` +
    (d.variableAnnualCTC > 0
      ? ` In addition, you will be eligible for a variable component of Rs ${inrFmt(d.variableAnnualCTC)}/- ` +
        `(Rupees ${inrWords(d.variableAnnualCTC)}) subject to Company policies and performance.`
      : '') +
    ` Any additional allowances, incentives and other benefits of your employment will be as per Company policies as applicable from time to time and based on performance, as may be mutually decided by the Company and the Candidate.`
  );
  b.gap(6);
  b.para('Your CTC includes and will continue to include all statutory liability and taxes applicable to you as an employee from time to time.');
  b.gap(6);
  b.para('A breakup of your tentative CTC is detailed under Appendix – A to this contract which is subject to change.');
  b.gap(6);
  b.para('This is a position of continuous responsibility and does not entail payment of extra time or overtime.');
  b.gap(12);

  b.print('Period of Probation:', LM, 11, true);
  b.para('Your tenure with the Company will commence with a probationary period lasting up to Six months. Throughout this time, it is imperative that you substantiate your suitability for the assigned position to the Company\'s contentment. The Company holds the discretionary authority to either terminate or extend your probation period, contingent upon your performance and occupational adeptness in the designated role.');
  b.gap(6);
  b.para('During the probationary phase, the Company retains the prerogative to adjust your compensation or withhold salary should your performance fail to meet expectations. Post the probationary term, a comprehensive evaluation will be conducted based on your execution of assigned tasks, fulfilment of roles, and adherence to responsibilities. The Company will then make a determination regarding the continuation or cessation of your employment. It is emphasized that the Company reserves the right to modify the agreed-upon payment terms in response to unsatisfactory performance.');
  b.gap(12);

  b.print('Place of Employment:', LM, 11, true);
  b.para(`The Candidate's initial place of posting/employment will be in ${d.placeOfPosting} and the Candidate shall have to travel to different cities during the tenure of his/her employment. You may be required to travel on Company work, and you will be reimbursed expenses as per Company policies.`);
  b.gap(6);
  b.para('Your travel/conveyance allowance/reimbursement is strictly between yourself and the Company. It has been determined to be claimed based on actual expenses as preapproved by your manager. This limit is based on numerous factors such as nature of assignment, job role and skills.');

  // ── Page 2 ─────────────────────────────────────────────────────────────

  b.gap(12);
  b.print('Training and Development:', LM, 11, true);
  b.para('During the course of your employment, to enable you to discharge your duties efficiently, Company may invest in you by providing you specialized and/or certified job-related training. If you choose to separate from the Company after undergoing the training (before a minimum period of 12 months), Company has the right to recover any expenses expended on your training including and not limited to associated expenses thereof. Such training and development costs that you may be eligible for shall be as per Company training policies, duly preapproved by your manager on actual basis only. The same shall not exceed 5% of the total CTC with a cap of 50000 INR, whichever is less, annually as agreed.');
  b.gap(12);

  b.print('Confidentiality Clause:', LM, 11, true);
  b.para('The Candidate recognizes and acknowledges that the system, business materials, marketing strategies, operational planning, product/service pricing policies, client details, salary, revenues, user information, software knowledge and all system documentation relating thereto ("Proprietary Information") which Company owns, plans or develops, whether for its own use or for use by its clients or relating thereto are confidential and proprietary to the Company. The Candidate further recognizes and acknowledges that in order to enable the Company to perform services for its clients, such clients may furnish to the Company Confidential Information concerning their business affairs, property, methods of operation or other data; that the goodwill afforded to the Company depends upon, among other things, the Company and its employees (Candidate) keeping such services and information confidential (collectively, including Company systems and Company\'s client information, the "Confidential Information").');
  b.gap(12);

  b.print('Non-Disclosure Clause:', LM, 11, true);
  b.para('The Candidate agrees that, except as directed by the Company, the Candidate will not at any time, whether during or after his/her employment with the Company, disclose to any person or use any confidential information, or permit any person to examine and/or make copies of any documents which contain or are derived from Confidential Information, whether prepared by the Candidate or otherwise coming into the Candidate\'s possession or control without the prior written permission of the Company. Any separate Agreement entered between the Candidate and the Company, elaborating this Clause, shall be construed as part of this Contract and shall be fully binding on both the Parties.');
  b.gap(12);

  b.print('Termination of Contract:', LM, 11, true);
  b.para('The Candidate shall serve a notice period of 60 Days for/before separating from the Company\'s services.');
  b.gap(6);
  b.para('The Company and the Candidate acknowledge and agree that the serving of notice for leaving the service of the Company is essence of the Contract and shall be strictly adhered to.');
  b.gap(6);
  b.para('Upon your resignation or retirement from the company or termination of your services, you are required to return all assets and properties of the Company such as systems, business materials, documents, correspondence, machines, data, files, books etc. as pertain to or belong to the Company.');
  b.gap(6);
  b.para('In special cases or projects assignments, you may be required to provide telephonic support or project support at a mutually convenient time and place for a term of additional 30 (Thirty) days beyond the 60 days\' notice period.');
  b.gap(6);
  b.para('You agree and undertake that during or after your employment with the Company, you shall not act in a manner which may harm the Company, its business or repute in any manner.');
  b.gap(12);

  b.print('Non-Compete:', LM, 11, true);
  b.para('As per the terms and conditions discussed and confirmed, you cannot take any other employment or any other contract work, directly or indirectly, for and from any of "Simpliigence clients" or "clients of Simpliigence clients" for a period of 3 years after leaving the job or termination of your job. In case, you will render your service to any of "Simpliigence clients" or "clients of Simpliigence clients" for a period of 1 year after leaving the job or termination of your job, Simpliigence will have the right to take any legal action for any claims or damages or for loss of revenue/profits and you must pay the same to Simpliigence at your own cost.');
  b.gap(6);
  b.para('You further warrant that you shall be bound and undertake that you will not directly or indirectly, whether through partnership or as a shareholder, joint venture partner, collaborator, employee consultant, or agent or in any other manner whatsoever, whether for profit or otherwise carry on any business which directly or indirectly, competes with the Company or harm the Company\'s business or repute.');

  // ── Page 3 ─────────────────────────────────────────────────────────────

  b.gap(12);
  b.print('Non-Solicitation:', LM, 11, true);
  b.para('For a period of 5 years after termination of this employment, you shall not:');
  b.gap(4);
  b.para('Solicit or take away from the Company, the business of any customers or clients of the Company, who have been customers or clients of the Company at any time during or prior to your employment with the Company; OR', 11, 20);
  b.gap(4);
  b.para('Entice away from the Company any person who at any time during such period shall have been an employee of the Company.', 11, 20);
  b.gap(12);

  b.print('Exclusive Employment:', LM, 11, true);
  b.para('During your employment with the Company, you shall devote your time and attention exclusively to the duties entrusted to you and shall provide full time efforts towards the role assigned to you and shall not engage directly or indirectly or allow yourself to engage to work for any person, firm or company in the capacity whatsoever, either part time, consultation or on job to job basis, without obtaining prior written permission of the Chairman of the Board of Directors of the Company.');
  b.gap(12);

  b.print('Working Hours:', LM, 11, true);
  b.para('The Company reserves the right to modify or alter its working hours, and you may be required to work in shifts. Working hours will be decided by the Company management from time to time keeping the Client requirements in mind.');
  b.gap(12);

  b.print('Appraisals:', LM, 11, true);
  b.para('There will be an appraisal conducted by your immediate supervisor or manager or director of the company after your probation period of One month(s) with the Company to consider your employment for confirmation purpose only. Then onwards these shall be done on an annual basis only. The purpose of the appraisals is to provide you with feedback on your performance and to highlight the areas which needs improvement. You are entitled to a salary hike only after completion of continuous One year of service and annually thereafter and the hike is at the sole discretion of the Company only.');
  b.gap(12);

  b.print('Miscellaneous Provisions:', LM, 11, true);
  b.para('You will strictly adhere to the guidelines, policies and/or code of conduct of the Company pertaining to working hours, leaves, dress code, office cultures and conducts and will work within the framework of the company policies as decided from time to time.');
  b.gap(6);
  b.para('It is your responsibility to notify the Company of any changes in your personal information (like address, contact phone number, additional qualifications, marital status, change of nomination, passport details etc.) within 15 working days.');
  b.gap(6);
  b.para('You will abide by the Employee Service Conditions as enumerated above. Any of the terms and conditions of service may be modified, altered or changed at any time by the Company at its discretion.');
  b.gap(6);
  b.para('You are required to sign and submit a copy of this employment contract as a token of your acceptance of Company\'s terms and conditions.');
  b.gap(12);

  b.para('We once again welcome you to our team and look forward to your contribution towards success of the organization and yourself.');
  b.gap(8);
  b.print('Thank You,', LM, 11);
  b.print('Best Regards,', LM, 11);
  b.print('For Simpliigence Private Limited', LM, 11, true);
  b.gap(36);

  b.print('__________________', LM, 11);
  b.print('Raghu Seetharam', LM, 11, true);
  b.print('CEO', LM, 11);
  b.txt(`Place: Bangalore`, RM - 120, b.y + 32, 11);
  b.txt(`Date: ${d.contractDate}`, RM - 120, b.y + 20, 11);
  b.gap(24);

  b.hRule(0.5);
  b.gap(10);
  b.print('Verified and Accepted:', LM, 11, true);
  b.gap(6);
  b.para(`I have read, understood and accepted the above Employee Service Conditions/Contract. I understand that the Employee Service Conditions are the basis of my employment with the Company. I have also ensured that the Company has good prospects and is capable of offering me career growth. I am under no obligation or duress to accept these terms and conditions of employment; I accept them of my own free choice and will.`);
  b.gap(36);

  // ── Capture employee signature position BEFORE printing the line ────────
  // b.y is in PDF native coords (from BOTTOM). Zoho Sign uses y from TOP.
  const empSigPage = b.pageNum - 1;          // 0-based
  const empSigYFromTop = PAGE_H - b.y;       // convert to Zoho Sign convention

  b.print('__________________', LM, 11);
  b.print(d.employeeName, LM, 11, true);
  b.gap(8);
  b.print(`Date: ${d.contractDate}`, LM, 11);
  b.txt(`Place: ${d.placeOfPosting}`, RM - 100, b.y + 14, 11);

  // ── Appendix A ─────────────────────────────────────────────────────────

  // Force new page for Appendix
  b['pages'].push([]);
  b['_y'] = TOP_Y;

  b.print('Appendix – A', PAGE_W/2 - 40, 14, true);
  b.gap(4);
  b.print(`Potential Salary Structure for ${d.employeeName} - Simpliigence Private Limited, India`, LM, 9, true);
  b.gap(14);

  b.ctcTable(d.ctcRows, d.fixedAnnualCTC, d.variableAnnualCTC ?? 0);
  b.gap(12);

  b.para('* You shall be required to produce before the Company all supporting of such expenses incurred in order to claim exemption of such allowances from income tax.', 9);
  b.gap(6);
  if (d.variableAnnualCTC > 0) {
    b.para('** Any performance incentives shall be at the discretion of the Company and its policies, and you shall not claim it as your right. If Company management deems you eligible for the same, then it shall be only after due evaluation of your performance.', 9);
    b.gap(6);
  }
  b.para('You shall also be required to produce at the time of your joining a self-declaration of the investments you have incurred during the financial year towards claiming deduction under the Income Tax Act.', 9);
  b.gap(6);
  b.para('Copies of such Proof of investments shall be submitted by you to the company along with actuals for verification purpose before 20th March of the relevant financial year. If you leave the Company before submission of such proofs or do not produce them at all, the Company shall adjust the tax while computing your full and final settlement.', 9);
  b.gap(20);

  b.print('UNDERSTOOD & ACCEPTED:', LM, 11, true);
  b.gap(36);
  b.print('__________________', LM, 11);
  b.print(d.employeeName, LM, 11, true);

  return {
    pdfBytes:          b.build(),
    title:             `Employment Contract - ${d.employeeName}`,
    signaturePage:     empSigPage,
    signatureYFromTop: empSigYFromTop,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPERIENCE / RELIEVING LETTER
═══════════════════════════════════════════════════════════════════════════ */

export interface ExperienceLetterDetails {
  employeeName:  string;
  role:          string;
  department:    string;
  joiningDate:   string;
  relievingDate: string;
  letterDate:    string;
}

export async function generateExperienceLetter(
  d: ExperienceLetterDetails,
): Promise<{ pdfBytes: Buffer; title: string }> {
  const b = new DocBuilder();

  // Letterhead
  b.print('SIMPLIIGENCE PRIVATE LIMITED', LM, 18, true);
  b.print('Technology Consulting  |  Salesforce  |  AI/ML  |  GCC Advisory', LM, 8.5);
  b.print('No. 179/1, 10th-A Main Road, Indiranagar 2nd Stage, Bangalore - 560038', LM, 8.5);
  b.gap(4); b.hRule(1.5); b.gap(16);

  b.print(`Date: ${d.letterDate}`, LM, 11);
  b.gap(8);
  b.print('EXPERIENCE & RELIEVING LETTER', LM, 14, true);
  b.gap(10);
  b.para('To Whom It May Concern,');
  b.gap(6);
  b.para(`This is to certify that ${d.employeeName} was employed with Simpliigence Private Limited in the capacity of ${d.role}, ${d.department} department, from ${d.joiningDate} to ${d.relievingDate}.`);
  b.gap(8);
  b.para(`During their tenure, ${d.employeeName} demonstrated professionalism, technical competence, and a strong commitment to delivering quality work. They have been relieved of their duties with effect from ${d.relievingDate} and there are no dues or obligations pending against them.`);
  b.gap(8);
  b.para('We wish them the very best in their future endeavours and are happy to provide a reference upon request.');
  b.gap(22);
  b.print('For Simpliigence Private Limited:', LM, 11, true);
  b.gap(32);
  b.print('__________________', LM, 11);
  b.print('Raghu Seetharam', LM, 11, true);
  b.print('CEO', LM, 11);
  b.gap(8);
  b.print(`Date: ${d.letterDate}`, LM, 11);

  return { pdfBytes: b.build(), title: `Experience Letter - ${d.employeeName}` };
}

/* ═══════════════════════════════════════════════════════════════════════════
   INCREMENT / PROMOTION LETTER
═══════════════════════════════════════════════════════════════════════════ */

export interface IncrementLetterDetails {
  employeeName:  string;
  currentRole:   string;
  newRole?:      string;
  department:    string;
  currentSalary: string;
  newSalary:     string;
  effectiveDate: string;
  letterDate:    string;
}

export async function generateIncrementLetter(
  d: IncrementLetterDetails,
): Promise<{ pdfBytes: Buffer; title: string }> {
  const isPromo = !!d.newRole && d.newRole !== d.currentRole;
  const b = new DocBuilder();

  b.print('SIMPLIIGENCE PRIVATE LIMITED', LM, 18, true);
  b.print('Technology Consulting  |  Salesforce  |  AI/ML  |  GCC Advisory', LM, 8.5);
  b.print('No. 179/1, 10th-A Main Road, Indiranagar 2nd Stage, Bangalore - 560038', LM, 8.5);
  b.gap(4); b.hRule(1.5); b.gap(16);

  b.print(`Date: ${d.letterDate}`, LM, 11);
  b.gap(8);
  b.print(isPromo ? 'PROMOTION & SALARY REVISION LETTER' : 'SALARY INCREMENT LETTER', LM, 14, true);
  b.gap(10);
  b.para(`Dear ${d.employeeName},`);
  b.gap(6);
  b.para(
    isPromo
      ? `We are pleased to inform you that in recognition of your outstanding performance and contributions, you have been promoted to the position of ${d.newRole}, effective ${d.effectiveDate}.`
      : `We are pleased to inform you that following your performance review, your salary has been revised with effect from ${d.effectiveDate}.`,
  );
  b.gap(10);
  b.print('REVISED COMPENSATION DETAILS', LM, 12, true);
  b.gap(6);
  if (isPromo) { b.row('Previous Designation', d.currentRole); b.row('Revised Designation', d.newRole!); }
  else b.row('Designation', d.currentRole);
  b.row('Department', d.department);
  b.row('Previous Monthly CTC', d.currentSalary);
  b.row('Revised Monthly CTC', d.newSalary);
  b.row('Effective Date', d.effectiveDate);
  b.gap(12);
  b.para('All other terms and conditions of your employment remain unchanged. We appreciate your continued hard work and dedication, and look forward to your growing contribution to Simpliigence.');
  b.gap(22);
  b.print('For Simpliigence Private Limited:', LM, 11, true);
  b.gap(32);
  b.print('__________________', LM, 11);
  b.print('Raghu Seetharam', LM, 11, true);
  b.print('CEO', LM, 11);
  b.gap(26);
  b.para(`I, ${d.employeeName}, acknowledge receipt of this letter and accept the revised terms.`);
  b.gap(32);
  b.print('Signature: ______________________________', LM, 11);
  b.gap(14);
  b.print('Date:      ______________________________', LM, 11);

  return {
    pdfBytes: b.build(),
    title: `${isPromo ? 'Promotion' : 'Increment'} Letter - ${d.employeeName}`,
  };
}
