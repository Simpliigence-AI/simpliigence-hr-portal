import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendDocumentForSignature, getSigningStatus } from '@/lib/zoho-sign';
import { generateOfferLetter, generateExperienceLetter, generateIncrementLetter } from '@/lib/letter-templates';
import { renderContractPdf } from '@/lib/render-pdf';

// Headless Chromium (HTML→PDF) needs the Node.js runtime, and rendering can take a few
// seconds, so allow more time than the platform default.
export const runtime = 'nodejs';
export const maxDuration = 60;

// NON-SECRET runtime diagnostics for PDF-render failures on serverless. The headless-Chromium
// path breaks when @sparticuz/chromium fails to extract its NSS shared libs or set
// LD_LIBRARY_PATH; this surfaces exactly what is present so a future failure is self-diagnosing.
// Reports NO secrets (no Supabase/Zoho keys) — only Node version, LD_LIBRARY_PATH, the resolved
// chromium binary path, and which key .so files exist vs are missing in the /tmp lib dirs.
function renderDiagnostics(): string {
  try {
    const keyLibs = ['libnss3.so', 'libnspr4.so', 'libnssutil3.so', 'libplc4.so', 'libplds4.so', 'libsoftokn3.so', 'libfreebl3.so'];
    const libDirs = [path.join(os.tmpdir(), 'al2', 'lib'), path.join(os.tmpdir(), 'al2023', 'lib')];
    (process.env.LD_LIBRARY_PATH || '').split(':').filter(Boolean).forEach(d => { if (!libDirs.includes(d)) libDirs.push(d); });
    const present = new Set<string>();
    for (const d of libDirs) { try { for (const f of fs.readdirSync(d)) present.add(f); } catch { /* dir absent */ } }
    const found = keyLibs.filter(l => present.has(l));
    const missing = keyLibs.filter(l => !present.has(l));
    const chromiumBin = path.join(os.tmpdir(), 'chromium');
    const execPath = fs.existsSync(chromiumBin) ? chromiumBin : '(not extracted)';
    return [
      `node=${process.versions.node}`,
      `LD_LIBRARY_PATH=${process.env.LD_LIBRARY_PATH ? process.env.LD_LIBRARY_PATH : '(unset)'}`,
      `chromium=${execPath}`,
      `libs_found=[${found.join(',')}]`,
      `libs_missing=[${missing.join(',')}]`,
    ].join(' ');
  } catch (e) {
    return `diagnostics_error=${(e as Error).message}`;
  }
}

function serverSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => (cookieStore as unknown as { getAll: () => { name: string; value: string }[] }).getAll() } },
  );
}

// GET /api/documents?employeeId=SPL-001
export async function GET(req: NextRequest) {
  const employeeId = req.nextUrl.searchParams.get('employeeId');
  if (!employeeId) return NextResponse.json({ error: 'Missing employeeId' }, { status: 400 });

  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}

// POST /api/documents  — generate + send for signature
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { employeeId, type, details, signerEmail, signerName, editedHtml } = body;

  if (!employeeId || !type || !signerEmail || !signerName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Generate PDF. Signature fields are placed by Zoho Sign via TEXT TAGS embedded in the
  // document (automatic field detection) — no coordinate placement is computed or passed.
  let pdfBytes: Buffer;
  let title: string;
  try {
    if (type === 'offer') {
      title = `Employment Contract - ${details?.employeeName ?? 'Employee'}`;
      if (typeof editedHtml === 'string' && editedHtml.trim()) {
        // Preferred path: render the exact HTML the user edited in the preview step, so
        // free-typed edits persist and layout comes from CSS. The rendered PDF carries the
        // Zoho Sign text tags at each signature line; Zoho detects and places the fields on
        // upload, immune to pagination / edit drift.
        pdfBytes = await renderContractPdf(editedHtml);
      } else {
        // Fallback: legacy byte-builder when no edited HTML was supplied.
        const r = await generateOfferLetter(details);
        pdfBytes = r.pdfBytes;
        title = r.title;
      }
    } else if (type === 'experience') {
      ({ pdfBytes, title } = await generateExperienceLetter(details));
    } else if (type === 'increment') {
      ({ pdfBytes, title } = await generateIncrementLetter(details));
    } else {
      return NextResponse.json({ error: 'Unknown document type' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: `PDF generation failed: ${(e as Error).message} | diag: ${renderDiagnostics()}` },
      { status: 500 },
    );
  }

  // Send to Zoho Sign
  let zohoResult;
  try {
    zohoResult = await sendDocumentForSignature(
      pdfBytes,
      `${title.replace(/\s+/g, '_')}.pdf`,
      title,
      { name: signerName, email: signerEmail },
    );
  } catch (e) {
    return NextResponse.json({ error: `Zoho Sign error: ${(e as Error).message}` }, { status: 500 });
  }

  // Save record to Supabase
  const supabase = serverSupabase();
  const { data: doc, error: dbErr } = await supabase
    .from('documents')
    .insert({
      employee_id:      employeeId,
      type,
      title,
      zoho_request_id:  zohoResult.requestId,
      zoho_document_id: zohoResult.documentId,
      status:           'sent',
      signer_email:     signerEmail,
      signer_name:      signerName,
      details,
      sent_at:          new Date().toISOString(),
    })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ document: doc, signingUrl: zohoResult.signingUrl });
}

// PATCH /api/documents  — sync status from Zoho
export async function PATCH(req: NextRequest) {
  const { documentId } = await req.json();
  if (!documentId) return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });

  const supabase = serverSupabase();
  const { data: doc } = await supabase.from('documents').select('zoho_request_id').eq('id', documentId).single();
  if (!doc?.zoho_request_id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const zohoStatus = await getSigningStatus(doc.zoho_request_id);

  // Map Zoho status → our status
  const statusMap: Record<string, string> = {
    inprogress: 'sent',
    completed:  'signed',
    declined:   'declined',
    expired:    'expired',
    recalled:   'expired',
  };
  const newStatus = statusMap[zohoStatus] ?? 'sent';

  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'signed') update.signed_at = new Date().toISOString();

  await supabase.from('documents').update(update).eq('id', documentId);
  return NextResponse.json({ status: newStatus });
}
