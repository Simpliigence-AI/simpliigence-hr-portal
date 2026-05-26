/**
 * HR Letter Templates — pure-JS PDF builder, zero npm deps
 * A4 (595×842 pts), Times-Roman / Times-Bold built-in fonts
 */

/* ═══════════════════════════════════════════════════════════════
   MINIMAL PDF BUILDER
═══════════════════════════════════════════════════════════════ */

type PdfOp =
  | { kind: 'text'; text: string; x: number; y: number; size: number; bold?: boolean }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; w?: number };

function pdfEsc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?'); // strip non-Latin-1-safe chars
}

function buildStream(ops: PdfOp[]): Buffer {
  const out: string[] = [];
  let inBT = false, curFont = '', curSize = 0;

  const endBT   = () => { if (inBT)  { out.push('ET');  inBT = false; } };
  const startBT = () => { if (!inBT) { out.push('BT'); inBT = true;  } };

  for (const op of ops) {
    if (op.kind === 'line') {
      endBT();
      out.push(`${op.w ?? 0.5} w`);
      out.push(`${op.x1} ${op.y1} m ${op.x2} ${op.y2} l S`);
    } else {
      startBT();
      const f = op.bold ? '/F2' : '/F1';
      if (f !== curFont || op.size !== curSize) {
        out.push(`${f} ${op.size} Tf`);
        curFont = f; curSize = op.size;
      }
      out.push(`1 0 0 1 ${op.x} ${op.y} Tm`);
      out.push(`(${pdfEsc(op.text)}) Tj`);
    }
  }
  if (inBT) out.push('ET');
  return Buffer.from(out.join('\n'), 'latin1');
}

function buildPDF(ops: PdfOp[]): Buffer {
  const stream = buildStream(ops);
  const bufs: Buffer[] = [];
  const off = new Array<number>(7).fill(0);
  let pos = 0;

  const w = (s: string) => {
    const b = Buffer.from(s + '\n', 'latin1');
    bufs.push(b); pos += b.length;
  };
  const raw = (b: Buffer) => { bufs.push(b); pos += b.length; };

  w('%PDF-1.4');

  off[1] = pos;
  w('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  off[2] = pos;
  w('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');

  off[3] = pos;
  w('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]\n/Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj');

  off[4] = pos;
  raw(Buffer.from(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n`, 'latin1'));
  raw(stream);
  raw(Buffer.from('\nendstream\nendobj\n', 'latin1'));

  off[5] = pos;
  w('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>\nendobj');

  off[6] = pos;
  w('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>\nendobj');

  const xrefPos = pos;
  const xr = ['xref', '0 7', '0000000000 65535 f '];
  for (let i = 1; i < 7; i++) xr.push(off[i].toString().padStart(10, '0') + ' 00000 n ');
  xr.push('trailer', '<< /Size 7 /Root 1 0 R >>', 'startxref', String(xrefPos), '%%EOF');
  raw(Buffer.from(xr.join('\n'), 'latin1'));

  return Buffer.concat(bufs);
}

/* ═══════════════════════════════════════════════════════════════
   LETTER BUILDER helper class
═══════════════════════════════════════════════════════════════ */

const LM = 62;   // left margin
const RM = 533;  // right margin
const LS = 1.5;  // line-spacing factor

class LB {
  private ops: PdfOp[] = [];
  y = 780;

  txt(text: string, x: number, y: number, size: number, bold = false) {
    this.ops.push({ kind: 'text', text, x, y, size, bold });
  }

  ln(y = this.y, w = 0.5) {
    this.ops.push({ kind: 'line', x1: LM, y1: y, x2: RM, y2: y, w });
  }

  print(text: string, x: number, size: number, bold = false) {
    this.txt(text, x, this.y, size, bold);
    this.y -= Math.ceil(size * LS);
  }

  row(label: string, value: string, size = 11) {
    this.txt(label + ':', LM + 10, this.y, size, true);
    this.txt(value,       LM + 220, this.y, size);
    this.y -= Math.ceil(size * LS);
  }

  gap(n = 10) { this.y -= n; }

  para(text: string, size = 11, indent = 0) {
    const maxCh = Math.floor((RM - LM - indent) / (size * 0.52));
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxCh && line) {
        this.print(line, LM + indent, size);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) this.print(line, LM + indent, size);
  }

  letterhead() {
    this.print('SIMPLIIGENCE LLC', LM, 20, true);
    this.y += 2;
    this.print('Technology Consulting  |  Salesforce  |  AI/ML  |  GCC Advisory', LM, 8.5);
    this.print('Old Bridge, NJ  |  Bangalore, India  |  www.simpliigence.com', LM, 8.5);
    this.gap(6);
    this.ln(this.y, 1.5);
    this.gap(18);
  }

  footer() {
    this.ln(46, 0.5);
    this.txt('Confidential  |  Simpliigence LLC  |  Not for unauthorised distribution', LM, 32, 8);
  }

  build(): Buffer { return buildPDF(this.ops); }
}

/* ═══════════════════════════════════════════════════════════════
   LETTER TYPE DEFINITIONS
═══════════════════════════════════════════════════════════════ */

export interface OfferLetterDetails {
  employeeName: string;
  role:         string;
  department:   string;
  location:     string;
  salary:       string;   // e.g. "Rs. 80,000 per month"
  joiningDate:  string;
  managerName:  string;
  letterDate:   string;
}

export async function generateOfferLetter(
  d: OfferLetterDetails,
): Promise<{ pdfBytes: Buffer; title: string }> {
  const b = new LB();
  b.letterhead();

  b.print(`Date: ${d.letterDate}`, LM, 11);
  b.gap(4);
  b.print('OFFER LETTER', LM, 14, true);
  b.gap(10);
  b.para(`Dear ${d.employeeName},`);
  b.gap(6);
  b.para(
    `We are delighted to offer you the position of ${d.role} at Simpliigence LLC. ` +
    `This letter confirms the terms of your employment as agreed during the selection process.`,
  );
  b.gap(10);
  b.print('TERMS OF EMPLOYMENT', LM, 12, true);
  b.gap(6);
  b.row('Position',          d.role);
  b.row('Department',        d.department);
  b.row('Work Location',     d.location);
  b.row('Reporting Manager', d.managerName);
  b.row('Date of Joining',   d.joiningDate);
  b.row('Gross Monthly CTC', d.salary);
  b.gap(12);
  b.para(
    'This offer is contingent upon successful completion of background verification and submission of all ' +
    'required documents prior to your date of joining. All other standard company policies and benefits ' +
    'will apply as communicated during onboarding.',
  );
  b.gap(8);
  b.para(
    'Please sign and return this letter as your acceptance. We look forward to welcoming you to the Simpliigence family.',
  );
  b.gap(22);
  b.print('For Simpliigence LLC:', LM, 11, true);
  b.gap(32);
  b.print('Authorised Signatory', LM, 11);
  b.gap(26);
  b.print(`I, ${d.employeeName}, accept the offer on the terms stated above.`, LM, 11, true);
  b.gap(32);
  b.print('Signature: ______________________________', LM, 11);
  b.gap(16);
  b.print('Date:      ______________________________', LM, 11);
  b.footer();

  return { pdfBytes: b.build(), title: `Offer Letter - ${d.employeeName}` };
}

/* ─── Experience / Relieving Letter ───────────────────────────────────────── */

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
  const b = new LB();
  b.letterhead();

  b.print(`Date: ${d.letterDate}`, LM, 11);
  b.gap(4);
  b.print('EXPERIENCE & RELIEVING LETTER', LM, 14, true);
  b.gap(10);
  b.para('To Whom It May Concern,');
  b.gap(6);
  b.para(
    `This is to certify that ${d.employeeName} was employed with Simpliigence LLC in the capacity of ` +
    `${d.role}, ${d.department} department, from ${d.joiningDate} to ${d.relievingDate}.`,
  );
  b.gap(8);
  b.para(
    `During their tenure, ${d.employeeName} demonstrated professionalism, technical competence, and a ` +
    `strong commitment to delivering quality work. They have been relieved of their duties with effect ` +
    `from ${d.relievingDate} and there are no dues or obligations pending against them.`,
  );
  b.gap(8);
  b.para(
    `We wish them the very best in their future endeavours and are happy to provide a reference upon request.`,
  );
  b.gap(22);
  b.print('For Simpliigence LLC:', LM, 11, true);
  b.gap(32);
  b.print('Authorised Signatory', LM, 11);
  b.gap(16);
  b.print(`Date: ${d.letterDate}`, LM, 11);
  b.footer();

  return { pdfBytes: b.build(), title: `Experience Letter - ${d.employeeName}` };
}

/* ─── Increment / Promotion Letter ────────────────────────────────────────── */

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
  const isPromotion = !!d.newRole && d.newRole !== d.currentRole;
  const heading     = isPromotion ? 'PROMOTION & SALARY REVISION LETTER' : 'SALARY INCREMENT LETTER';

  const b = new LB();
  b.letterhead();

  b.print(`Date: ${d.letterDate}`, LM, 11);
  b.gap(4);
  b.print(heading, LM, 14, true);
  b.gap(10);
  b.para(`Dear ${d.employeeName},`);
  b.gap(6);
  b.para(
    isPromotion
      ? `We are pleased to inform you that in recognition of your outstanding performance and contributions, ` +
        `you have been promoted to the position of ${d.newRole}, effective ${d.effectiveDate}.`
      : `We are pleased to inform you that following your performance review, your salary has been revised ` +
        `with effect from ${d.effectiveDate}.`,
  );
  b.gap(10);
  b.print('REVISED COMPENSATION DETAILS', LM, 12, true);
  b.gap(6);
  if (isPromotion) {
    b.row('Previous Designation', d.currentRole);
    b.row('Revised Designation',  d.newRole!);
  } else {
    b.row('Designation', d.currentRole);
  }
  b.row('Department',            d.department);
  b.row('Previous Monthly CTC',  d.currentSalary);
  b.row('Revised Monthly CTC',   d.newSalary);
  b.row('Effective Date',        d.effectiveDate);
  b.gap(12);
  b.para(
    'All other terms and conditions of your employment remain unchanged. We appreciate your continued hard ' +
    'work and dedication, and look forward to your growing contribution to Simpliigence.',
  );
  b.gap(22);
  b.print('For Simpliigence LLC:', LM, 11, true);
  b.gap(32);
  b.print('Authorised Signatory', LM, 11);
  b.gap(26);
  b.para(`I, ${d.employeeName}, acknowledge receipt of this letter and accept the revised terms.`);
  b.gap(32);
  b.print('Signature: ______________________________', LM, 11);
  b.gap(16);
  b.print('Date:      ______________________________', LM, 11);
  b.footer();

  return { pdfBytes: b.build(), title: `${isPromotion ? 'Promotion' : 'Increment'} Letter - ${d.employeeName}` };
}
