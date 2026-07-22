/**
 * Shared employment-contract layout — used by BOTH:
 *   • the frontend "Preview & Edit" step (components/DocumentsPanel.tsx) to fill the
 *     contentEditable editor, and
 *   • the backend HTML→PDF renderer (lib/render-pdf.ts) so the signed PDF is produced
 *     from exactly the HTML the user edited (WYSIWYG).
 *
 * The single source of truth for page geometry lives in LAYOUT below; the renderer uses
 * these same numbers to map signature anchor markers to Zoho Sign page/point coordinates.
 *
 * Pure strings + numbers only — safe to import from a 'use client' component and from a
 * Node.js API route alike (no browser/node-only deps).
 */

/* ─── Page geometry (points; A4 = 595.28 × 841.89pt, matching the sample contract) ─── */
export const LAYOUT = {
  pageWpt: 595.28,
  pageHpt: 841.89,
  marginTopPt: 88, // header band lives in here
  marginBottomPt: 80, // footer band lives in here
  marginLeftPt: 90, // list markers / signature / footer align near here
  marginRightPt: 72,
  // Signature anchor field box (Zoho image_field) size, in points.
  sigFieldWidthPt: 200,
  sigFieldHeightPt: 42,
} as const;

export const PX_PER_PT = 96 / 72; // 1.3333…
export const PT_PER_PX = 72 / 96; // 0.75

/** CSS content-box width in device px — the renderer sets its viewport to this so the
 *  on-screen layout it measures matches the paginated print layout exactly. */
export function contentWidthPx(): number {
  return Math.round((LAYOUT.pageWpt - LAYOUT.marginLeftPt - LAYOUT.marginRightPt) * PX_PER_PT);
}

/* ─── Logo (text/SVG wordmark fallback — see PR notes: real asset still needed) ─── */
function logoSvg(): string {
  // Approximation of the Simpliigence wordmark: dark navy "Simpli" + "gence" with an
  // orange cloud swoosh over the "ii". Replace with the real logo asset when supplied.
  return `
<svg width="230" height="46" viewBox="0 0 230 46" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Simpliigence">
  <path d="M96 15 q10 -11 22 -4 q6 -9 17 -4 q9 -3 12 6" fill="none" stroke="#f2871f" stroke-width="4" stroke-linecap="round"/>
  <text x="0" y="34" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700">
    <tspan fill="#1b2a4a">Simpli</tspan><tspan fill="#1d63a6">igence</tspan>
  </text>
  <text x="2" y="44" font-family="Arial, Helvetica, sans-serif" font-size="7.5" letter-spacing="0.3" fill="#555">Partners in Innovation. Delivering What Matters. By Design.</text>
</svg>`.trim();
}

function footerMarkSvg(): string {
  return `
<svg width="26" height="30" viewBox="0 0 26 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M3 12 q10 -9 20 0" fill="none" stroke="#f2871f" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="8" cy="16" r="2.6" fill="#f2871f"/><circle cx="18" cy="16" r="2.6" fill="#1d63a6"/>
  <rect x="5.4" y="19" width="5.2" height="9" rx="2.4" fill="#f2871f"/>
  <rect x="15.4" y="19" width="5.2" height="9" rx="2.4" fill="#1d63a6"/>
</svg>`.trim();
}

/* ─── The stylesheet (identical for preview and print → WYSIWYG) ─── */
export function contractCss(): string {
  const { pageWpt, pageHpt, marginTopPt, marginBottomPt, marginLeftPt, marginRightPt } = LAYOUT;
  return `
<style>
  /* Page size only. Margins + the repeating header/footer are supplied by the PDF renderer
     via Puppeteer's displayHeaderFooter templates (drawn inside the page margins on EVERY
     page). The .contract-header/.contract-footer below are shown INLINE in the on-screen
     editor for context and hidden in print so they never duplicate/overlap. */
  @page { size: ${pageWpt}pt ${pageHpt}pt; }

  .contract { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.42; color: #111; }
  .contract * { box-sizing: border-box; }

  /* Header + footer: shown inline on screen so the editor previews the letterhead. */
  .contract-header, .contract-footer { width: 100%; }
  .contract-header {
    border-bottom: 3px solid #111; padding-bottom: 6pt; margin-bottom: 14pt;
  }
  .contract-header .logo svg { display: block; }
  .contract-footer {
    border-top: 3px solid #111; padding-top: 5pt; margin-top: 16pt;
    display: flex; justify-content: space-between; gap: 10pt;
    font-family: Arial, Helvetica, sans-serif; font-size: 7pt; line-height: 1.35; color: #333;
  }
  .contract-footer .col { flex: 1; }
  .contract-footer .col.left { display: flex; align-items: flex-end; gap: 5pt; }
  .contract-footer .region { font-weight: 700; letter-spacing: 0.4px; }
  .contract-footer a { color: #1d63a6; text-decoration: underline; }

  /* In print (and print-media emulation used for anchor measurement) the inline
     header/footer are removed from flow — the renderer draws the real repeating ones. */
  @media print {
    .contract-header, .contract-footer { display: none !important; }
  }

  /* Body typography */
  .contract .doc-title { text-align: center; font-size: 13.3pt; font-weight: 700; margin: 0 0 14pt 0; }
  .contract p { margin: 0 0 11pt 0; }
  .contract .body p { padding-left: 36pt; }         /* body copy indents to ~127pt like the sample */
  .contract .clause-h { padding-left: 0; font-weight: 700; margin: 6pt 0 6pt 0; }
  .contract .num { padding-left: 0 !important; }     /* numbered list markers hang at the left margin */
  .contract ol.clauses { margin: 0; padding-left: 18pt; }
  .contract ol.clauses > li { margin: 8pt 0; }
  .contract ol.sub { margin: 4pt 0; padding-left: 18pt; }
  .contract .indent { padding-left: 60pt !important; }

  /* Signature blocks — left edge ~108pt = 18pt inside the 90pt page margin */
  .sec-break { break-before: page; }
  .sig-block { padding-left: 18pt; position: relative; }
  .sig-space { height: ${LAYOUT.sigFieldHeightPt}pt; }
  .sig-anchor { display: inline-block; width: 1px; height: 1px; overflow: hidden; }
  .sig-line { font-weight: 700; letter-spacing: 1px; margin: 0; }
  .sig-name { font-weight: 700; margin: 2pt 0 0 0; padding-left: 0; }
  .sig-role { margin: 0; padding-left: 0; }
  .sig-meta-right { position: absolute; right: 0; top: 0; text-align: left; }
  .sig-meta-right p { font-weight: 700; margin: 0 0 4pt 0; padding-left: 0; }
  .sig-meta-left p { margin: 2pt 0 0 0; padding-left: 0; }
  .verified { font-weight: 700; margin: 10pt 0 8pt 0; padding-left: 18pt; }
  .accept-para { padding-left: 18pt !important; }

  /* Appendix table */
  .appendix-title { text-align: center; font-size: 13pt; font-weight: 700; margin: 10pt 0 14pt 0; }
  table.ctc { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.ctc th, table.ctc td { border: 1px solid #333; padding: 4pt 6pt; vertical-align: top; }
  table.ctc .center { text-align: center; }
  table.ctc .bold { font-weight: 700; }
  .appendix-note { font-size: 10.5pt; padding-left: 18pt; margin: 8pt 0; }
</style>`.trim();
}

/* ─── Data shape ─── */
export interface ContractRow {
  id: string;
  label: string;
  annual: number;
  remarks: string;
  bold?: boolean;
  isSpacer?: boolean;
}
export interface ContractData {
  employeeName: string;
  employeeAddress: string;
  designation: string;
  contractDate: string; // "6th July 2026"
  joiningDate: string;
  placeOfPosting: string;
  fixedAnnualCTC: number;
  variableAnnualCTC: number;
  rows: ContractRow[];
}

/* ─── INR helpers (duplicated tiny helpers to keep this module dep-free) ─── */
function inrFmt(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return s;
  let result = s.slice(-3);
  let rest = s.slice(0, -3);
  while (rest.length > 2) { result = rest.slice(-2) + ',' + result; rest = rest.slice(0, -2); }
  return (rest ? rest + ',' : '') + result;
}
function inrWords(amount: number): string {
  const u = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const t = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number): string => n < 20 ? u[n] : (t[Math.floor(n / 10)] + (n % 10 ? ' ' + u[n % 10] : '')).trim();
  const three = (n: number): string => {
    const h = Math.floor(n / 100), r = n % 100;
    return ((h ? u[h] + ' Hundred ' : '') + (r ? two(r) : '')).trim();
  };
  if (!amount) return 'Zero Only';
  let w = '';
  const cr = Math.floor(amount / 10000000);
  const lk = Math.floor((amount % 10000000) / 100000);
  const th = Math.floor((amount % 100000) / 1000);
  const re = amount % 1000;
  if (cr) w += two(cr) + ' Crore ';
  if (lk) w += two(lk) + ' Lakh ';
  if (th) w += two(th) + ' Thousand ';
  if (re) w += three(re) + ' ';
  return w.trim() + ' Only';
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ─── Header / footer fragments ─── */
export function contractHeaderHtml(): string {
  return `<div class="contract-header"><div class="logo">${logoSvg()}</div></div>`;
}
export function contractFooterHtml(): string {
  return `<div class="contract-footer">
    <div class="col left">${footerMarkSvg()}<div>
        <a href="https://www.simpliigence.com">www.simpliigence.com</a><br/>
        email: <a href="mailto:contactus@simpliigence.com">contactus@simpliigence.com</a>
      </div></div>
    <div class="col center">
      <div class="region">INDIA</div>
      179, 10th 'A' Main Road, Paramahansa Yogananda Rd, Indiranagar, Bengaluru, Karnataka 560038<br/>
      +91 78936 42241
    </div>
    <div class="col right">
      <div class="region">USA</div>
      Monroe, New Jersey, USA<br/>
      +1 973-218-4840<br/>
      CIN: U74140KA2019FTC130286
    </div>
  </div>`;
}

/* ─── Puppeteer displayHeaderFooter templates ───
 * These are drawn by Chromium inside the page's top/bottom margins on EVERY printed page.
 * Templates are isolated documents: styles must be inline and font-size must be set
 * explicitly (Chromium forces it to 0 otherwise). Left/right padding aligns with the body. */
export function headerTemplateHtml(): string {
  const padL = LAYOUT.marginLeftPt;
  const padR = LAYOUT.marginRightPt;
  return `<div style="width:100%; font-size:0; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
    <div style="padding:14pt ${padR}pt 5pt ${padL}pt; border-bottom:3px solid #111;">${logoSvg()}</div>
  </div>`;
}
export function footerTemplateHtml(): string {
  const padL = LAYOUT.marginLeftPt;
  const padR = LAYOUT.marginRightPt;
  const col = 'display:inline-block; vertical-align:top; font-family:Arial,Helvetica,sans-serif; font-size:7pt; line-height:1.35; color:#333;';
  return `<div style="width:100%; font-size:0; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
    <div style="padding:5pt ${padR}pt 0 ${padL}pt; border-top:3px solid #111;">
      <div style="${col} width:31%;">
        <span style="display:inline-block; vertical-align:bottom;">${footerMarkSvg()}</span>
        <span style="display:inline-block; vertical-align:bottom; padding-left:5pt;">
          <span style="color:#1d63a6; text-decoration:underline;">www.simpliigence.com</span><br/>
          email: <span style="color:#1d63a6; text-decoration:underline;">contactus@simpliigence.com</span>
        </span>
      </div><div style="${col} width:38%;">
        <b style="letter-spacing:0.4px;">INDIA</b><br/>
        179, 10th 'A' Main Road, Paramahansa Yogananda Rd, Indiranagar, Bengaluru, Karnataka 560038<br/>+91 78936 42241
      </div><div style="${col} width:29%;">
        <b style="letter-spacing:0.4px;">USA</b><br/>
        Monroe, New Jersey, USA<br/>+1 973-218-4840<br/>CIN: U74140KA2019FTC130286
      </div>
    </div>
  </div>`;
}

/* ─── Appendix-A salary table ─── */
function appendixTableHtml(d: ContractData): string {
  const bodyRows = d.rows
    .filter(r => r.id !== 'fixed_total')
    .map(r => {
      if (r.isSpacer) {
        return `<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>`;
      }
      const monthly = r.id === 'variable' ? '—' : inrFmt(Math.round(r.annual / 12));
      const annually = inrFmt(r.annual);
      const cls = r.bold ? ' class="bold"' : '';
      return `<tr${cls}><td>${esc(r.label)}</td><td>${monthly}</td><td>${annually}</td><td>${esc(r.remarks)}</td></tr>`;
    })
    .join('\n      ');

  return `<table class="ctc">
      <tr class="bold"><td class="center" colspan="4">Potential Salary Structure for ${esc(d.employeeName)} - Simpliigence Private Limited, India</td></tr>
      <tr class="bold">
        <td>Particulars of Salary</td><td>Monthly</td><td>Annually</td>
        <td>Remarks<br/>Designation: ${esc(d.designation)}</td>
      </tr>
      <tr class="bold"><td></td><td>in Rs.</td><td>in Rs.</td><td></td></tr>
      <tr class="bold"><td>Cost to Company</td><td></td><td></td><td></td></tr>
      <tr class="bold"><td>- FIXED</td><td>${inrFmt(Math.round(d.fixedAnnualCTC / 12))}</td><td>${inrFmt(d.fixedAnnualCTC)}</td><td>Payable Monthly</td></tr>
      <tr><td>&nbsp;</td><td></td><td></td><td></td></tr>
      ${bodyRows}
    </table>`;
}

/**
 * Build the full styled contract as an HTML fragment: <style> + header + footer + body,
 * with two embedded signature anchor markers (data-role="company" / "employee").
 * This exact fragment is placed into the editor and, after edits, rendered to the PDF.
 */
export function buildContractHtml(d: ContractData): string {
  const addr = d.employeeAddress?.trim() ? esc(d.employeeAddress) : '<em>[address not entered]</em>';
  const variable = d.variableAnnualCTC || 0;
  const remuneration =
    `Your annual Gross salary/CTC will be Rs ${inrFmt(d.fixedAnnualCTC)}/- (Rupees ${inrWords(d.fixedAnnualCTC)}).` +
    (variable > 0
      ? ` In addition, you will be eligible for a variable component of Rs ${inrFmt(variable)}/- (Rupees ${inrWords(variable)}) subject to Company policies and performance.`
      : '') +
    ` Any additional allowances, incentives and other benefits of your employment will be as per Company policies as applicable from time to time and based on performance, as may be mutually decided by the Company and the Candidate.`;

  return `${contractCss()}
<div class="contract">
${contractHeaderHtml()}
${contractFooterHtml()}
<div class="doc-body">
  <p class="doc-title">EMPLOYMENT CONTRACT</p>

  <div class="body">
    <p>This Employment Contract is made at Bangalore, Karnataka and effective this <strong>${esc(d.contractDate)}</strong>.</p>
    <p>BETWEEN: <strong>${esc(d.employeeName)}</strong> (the "Employee"), an Indian Resident residing at: ${addr}</p>
    <p class="indent">➢ The Party to the First part</p>
    <p>AND: <strong>Simpliigence Private Limited</strong> (the "Company"), a Private Limited Company having its registered office at: <strong>No. 179/1, 10th-A Main Road, Indiranagar 2nd Stage, Bangalore, India - 560038.</strong></p>
    <p class="indent">➢ The Party to the Second part</p>
    <p>(Collectively referred to as ''Parties'')</p>
    <p>This Contract is entered by the Parties after the issue of appointment letter or execution of the employment contract dated <strong>${esc(d.joiningDate)}</strong>.</p>
    <p>WHEREAS the Company desires to employ the Party to the First Part and the said Party desires to be employed/appointed by the Company in employment for the post of a <strong>${esc(d.designation)}</strong>.</p>
    <p>Employee Service Conditions: Following are the terms and conditions associated with your employment:</p>
    <p>"Company" or "Simpliigence" for all purposes shall mean Simpliigence Private Limited</p>
    <p>"You" or "Candidate" for all purposes shall mean <strong>${esc(d.employeeName)}</strong></p>
    <p>Remuneration: ${remuneration}</p>
    <p>Your CTC includes and will continue to include all statutory liability and taxes applicable to you as an employee from time to time.</p>
    <p>A breakup of your tentative CTC is detailed under Appendix – A to this contract which is subject to change.</p>
    <p>This is a position of continuous responsibility and does not entail payment of extra time or overtime.</p>
  </div>

  <ol class="clauses">
    <li><p class="clause-h">Period of Probation:</p>
      <div class="body">
      <p>Your tenure with the Company will commence with a probationary period lasting up to Six months. Throughout this time, it is imperative that you substantiate your suitability for the assigned position to the Company's contentment. The Company holds the discretionary authority to either terminate or extend your probation period, contingent upon your performance and occupational adeptness in the designated role.</p>
      <p>During the probationary phase, the Company retains the prerogative to adjust your compensation or withhold salary should your performance fail to meet expectations. Post the probationary term, a comprehensive evaluation will be conducted based on your execution of assigned tasks, fulfilment of roles, and adherence to responsibilities. The Company will then make a determination regarding the continuation or cessation of your employment. It is emphasized that the Company reserves the right to modify the agreed-upon payment terms in response to unsatisfactory performance.</p>
      </div>
    </li>
    <li><p class="clause-h">Place of Employment:</p>
      <div class="body">
      <p>The Candidate's initial place of posting/employment will be in <strong>${esc(d.placeOfPosting)}</strong> and the Candidate shall have to travel to different cities during the tenure of his/her employment. You may be required to travel on Company work, and you will be reimbursed expenses as per Company policies.</p>
      <p>Your travel/conveyance allowance/reimbursement is strictly between yourself and the Company. It has been determined to be claimed based on actual expenses as preapproved by your manager. This limit is based on numerous factors such as nature of assignment, job role and skills.</p>
      </div>
    </li>
    <li><p class="clause-h">Training and Development:</p>
      <div class="body"><p>During the course of your employment, to enable you to discharge your duties efficiently, Company may invest in you by providing you specialized and/or certified job-related training. If you choose to separate from the Company after undergoing the training (before a minimum period of 12 months), Company has the right to recover any expenses expended on your training. Such training and development costs shall not exceed 5% of the total CTC with a cap of Rs 50,000/- annually.</p></div>
    </li>
    <li><p class="clause-h">Confidentiality Clause:</p>
      <div class="body"><p>The Candidate recognizes and acknowledges that the system, business materials, marketing strategies, operational planning, product/service pricing policies, client details, salary, revenues, user information, software knowledge and all system documentation relating thereto ("Proprietary Information") which Company owns, plans or develops, whether for its own use or for use by its clients or relating thereto are confidential and proprietary to the Company.</p></div>
    </li>
    <li><p class="clause-h">Non-Disclosure Clause:</p>
      <div class="body"><p>The Candidate agrees that, except as directed by the Company, the Candidate will not at any time, whether during or after his/her employment with the Company, disclose to any person or use any confidential information, or permit any person to examine and/or make copies of any documents which contain or are derived from Confidential Information, whether prepared by the Candidate or otherwise coming into the Candidate's possession or control without the prior written permission of the Company.</p></div>
    </li>
    <li><p class="clause-h">Termination of Contract:</p>
      <div class="body">
      <p>The Candidate shall serve a notice period of <strong>60 Days</strong> for/before separating from the Company's services.</p>
      <p>The Company and the Candidate acknowledge and agree that the serving of notice for leaving the service of the Company is essence of the Contract and shall be strictly adhered to.</p>
      <p>Upon your resignation or retirement from the company or termination of your services, you are required to return all assets and properties of the Company such as systems, business materials, documents, correspondence, machines, data, files, books etc.</p>
      <p>In special cases or projects assignments, you may be required to provide telephonic support or project support at a mutually convenient time and place for a term of additional 30 (Thirty) days beyond the 60 days' notice period.</p>
      </div>
    </li>
    <li><p class="clause-h">Non-Compete:</p>
      <div class="body"><p>As per the terms and conditions discussed and confirmed, you cannot take any other employment or any other contract work, directly or indirectly, for and from any of "Simpliigence clients" or "clients of Simpliigence clients" for a period of <strong>3 years</strong> after leaving the job or termination of your job. In case you render your service to any such client within 1 year, Simpliigence will have the right to take legal action for any claims or damages.</p></div>
    </li>
    <li><p class="clause-h">Non-solicitation:</p>
      <div class="body"><p>For a period of 5 years after termination of this employment, you shall not:</p></div>
      <ol class="sub" type="a">
        <li><p>Solicit or take away from the Company, the business of any customers or clients of the Company, who have been customers or clients of the Company at any time during or prior to your employment with the Company Or</p></li>
        <li><p>Entice away from the Company any person who at any time during such period shall have been an employee of the Company.</p></li>
      </ol>
    </li>
    <li><p class="clause-h">Exclusive employment:</p>
      <div class="body"><p>During your employment with the Company, you shall devote your time and attention exclusively to the duties entrusted to you and shall provide full time efforts towards the role assigned to you and shall not engage directly or indirectly or allow yourself to engage to work for any person, firm or company in the capacity whatsoever, either part time, consultation or on job to job basis, without obtaining prior written permission of the Chairman of the Board of Directors of the Company.</p></div>
    </li>
    <li><p class="clause-h">Working hours:</p>
      <div class="body"><p>The Company reserves the right to modify or alter its working hours, and you may be required to work in shifts. Working hours will be decided by the Company management from time to time keeping the Client requirements in mind.</p></div>
    </li>
    <li><p class="clause-h">Appraisals:</p>
      <div class="body"><p>There will be an appraisal conducted by your immediate supervisor or manager or director of the company after your probation period of One month(s) with the Company to consider your employment for confirmation purpose only. Then onwards these shall be done on an annual basis only. The purpose of the appraisals is to provide you with feedback on your performance and to highlight the areas which needs improvement. You are entitled to a salary hike only after completion of continuous One year of service and annually thereafter and the hike is at the sole discretion of the Company only.</p></div>
    </li>
    <li><p class="clause-h">Miscellaneous Provisions:</p>
      <ol class="sub" type="a">
        <li><p>You will strictly adhere to the guidelines, policies and/or code of conduct of the Company pertaining to working hours, leaves, dress code, office cultures and conducts and will work within the framework of the company policies as decided from time to time.</p></li>
        <li><p>It is your responsibility to notify the Company of any changes in your personal information (like address, contact phone number, additional qualifications, marital status, change of nomination, passport details etc.) within 15 working days.</p></li>
        <li><p>You will abide by the Employee Service Conditions as enumerated above. Any of the terms and conditions of service may be modified, altered or changed at any time by the Company at its discretion.</p></li>
      </ol>
    </li>
  </ol>

  <!-- ── CEO / company signature block (own page) ── -->
  <div class="sec-break">
    <div class="body">
      <p>You are required to sign and submit a copy of this employment contract as a token of your acceptance of Company's terms and conditions.</p>
      <p>We once again welcome you to our team and look forward to your contribution towards success of the organization and yourself.</p>
      <p>Thank You,<br/>Best Regards,<br/><strong>For Simpliigence Private Limited</strong></p>
    </div>
    <div class="sig-block">
      <div class="sig-space"><span class="sig-anchor" data-role="company"></span></div>
      <p class="sig-line">__________________</p>
      <p class="sig-name">Raghu Seetharam</p>
      <p class="sig-role">CEO</p>
      <div class="sig-meta-right">
        <p>Place: Bengaluru</p>
        <p>Date: ${esc(d.contractDate)}</p>
      </div>
    </div>
    <p class="verified">Verified and Accepted:</p>
    <p class="accept-para">I have read, understood and accepted the above Employee Service Conditions/Contract. I understand that the Employee Service Conditions are the basis of my employment with the Company. I have also ensured that the Company has good prospects and is capable of offering me career growth. I am under no obligation or duress to accept these terms and conditions of employment; I accept them of my own free choice and will.</p>
  </div>

  <!-- ── Employee signature block (top of next page) ── -->
  <div class="sec-break">
    <div class="sig-block">
      <div class="sig-space"><span class="sig-anchor" data-role="employee"></span></div>
      <p class="sig-line">__________________</p>
      <p class="sig-name">${esc(d.employeeName)}</p>
      <div class="sig-meta-left">
        <p>Date: ${esc(d.contractDate)}</p>
        <p>Place: ${esc(d.placeOfPosting)}</p>
      </div>
    </div>

    <!-- ── Appendix A (flows onto the employee-signature page, like the sample) ── -->
    <p class="appendix-title">Appendix – A</p>
    ${appendixTableHtml(d)}
    <p class="appendix-note">*You shall be required to produce before the Company all supporting of such expenses incurred in order to claim exemption of such allowances from income tax.</p>
    ${variable > 0 ? `<p class="appendix-note">** Any performance incentives shall be at the discretion of the Company and its policies, and you shall not claim it as your right. If Company management deems you eligible for the same, then it shall be only after due evaluation of your performance.</p>` : ''}
    <p class="appendix-note">You shall also be required to produce at the time of your joining a self-declaration of the investments you have incurred during the financial year towards claiming deduction under the Income tax Act.</p>
    <p class="appendix-note">Copies of such Proof of investments shall be submitted by you to the company along with actuals for verification purpose before 20th March of the relevant financial year. If you leave the Company before submission of such proofs or do not produce them at all, the Company shall adjust the tax while computing your full and final settlement.</p>
  </div>

  <!-- ── Final understood & accepted ── -->
  <div class="sec-break sig-block" style="padding-top:16pt">
    <p class="verified" style="padding-left:0">UNDERSTOOD &amp; ACCEPTED:</p>
    <div class="sig-space"></div>
    <p class="sig-line">__________________</p>
    <p class="sig-name">${esc(d.employeeName)}</p>
  </div>
</div>
</div>`;
}
