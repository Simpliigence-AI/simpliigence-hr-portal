import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { sendDocumentForSignature, getSigningStatus, downloadSignedPdf, SignaturePlacement } from '@/lib/zoho-sign';
import { generateOfferLetter, generateExperienceLetter, generateIncrementLetter } from '@/lib/letter-templates';
import { renderContractPdf } from '@/lib/render-pdf';

// Headless Chromium (HTML→PDF) needs the Node.js runtime, and rendering can take a few
// seconds, so allow more time than the platform default.
export const runtime = 'nodejs';
export const maxDuration = 60;

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

  // Generate PDF + signature placement
  let pdfBytes: Buffer;
  let title: string;
  let placement: SignaturePlacement | undefined;
  try {
    if (type === 'offer') {
      title = `Employment Contract - ${details?.employeeName ?? 'Employee'}`;
      if (typeof editedHtml === 'string' && editedHtml.trim()) {
        // Preferred path: render the exact HTML the user edited in the preview step, so
        // free-typed edits persist and layout comes from CSS. Signature anchors are measured
        // from the rendered document (robust to edits changing pagination).
        const { pdf, anchors } = await renderContractPdf(editedHtml);
        pdfBytes = pdf;
        // There are TWO employee signature anchors (mid-doc "Verified and Accepted" + final
        // "UNDERSTOOD & ACCEPTED"), both for the SAME recipient. Carry all of them.
        const emps = anchors.filter(a => a.role === 'employee');
        const cmp  = anchors.find(a => a.role === 'company');
        placement = {
          employees: emps.map(e => ({ page: e.page, yFromTop: e.yFromTop, xFromLeft: e.xFromLeft })),
          company:   cmp && { page: cmp.page, yFromTop: cmp.yFromTop, xFromLeft: cmp.xFromLeft },
        };
      } else {
        // Fallback: legacy byte-builder when no edited HTML was supplied.
        const r = await generateOfferLetter(details);
        pdfBytes = r.pdfBytes;
        title = r.title;
        placement = { employee: { page: r.signaturePage, yFromTop: r.signatureYFromTop } };
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
      { error: `PDF generation failed: ${(e as Error).message}` },
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
      placement,
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

// Service-role client — storage writes and employee_documents inserts must run
// server-side regardless of the caller's RLS session (same pattern as teams-sync).
function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Auto-archive: pull the signed PDF from Zoho and file it exactly like a manual
// upload — employee-documents storage bucket + employee_documents row — so it
// appears in the dossier Documents tab. Idempotent: the storage path embeds the
// tracking-row id, and we skip if a row for this letter already exists.
async function archiveSignedPdf(
  documentId: string,
  doc: { employee_id: string; title: string; zoho_request_id: string },
): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  const admin = adminSupabase();

  // Already archived? (deterministic path marker: {documentId}-signed-)
  const { data: existing } = await admin
    .from('employee_documents')
    .select('id')
    .eq('employee_id', doc.employee_id)
    .like('url', `%${documentId}-signed-%`)
    .limit(1);
  if (existing?.length) return;

  const pdf = await downloadSignedPdf(doc.zoho_request_id);

  const slug = (doc.title || 'letter')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'letter';
  const path = `${doc.employee_id}/${documentId}-signed-${slug}.pdf`;

  const { error: upErr } = await admin.storage
    .from('employee-documents')
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const { data: { publicUrl } } = admin.storage.from('employee-documents').getPublicUrl(path);

  const { error: insErr } = await admin.from('employee_documents').insert({
    employee_id:    doc.employee_id,
    name:           `Signed - ${doc.title}.pdf`,
    doc_type:       'Signed Letter',
    url:            publicUrl,
    sharepoint_url: null,
  });
  if (insErr) throw new Error(`employee_documents insert failed: ${insErr.message}`);
}

// PATCH /api/documents  — sync status from Zoho
export async function PATCH(req: NextRequest) {
  const { documentId } = await req.json();
  if (!documentId) return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });

  const supabase = serverSupabase();
  const { data: doc } = await supabase
    .from('documents')
    .select('zoho_request_id, employee_id, title')
    .eq('id', documentId)
    .single();
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

  // On completion, archive the signed PDF into the employee's Documents tab.
  // Non-fatal: an archive failure must never break the status sync.
  let archived = false;
  let warning: string | undefined;
  if (newStatus === 'signed') {
    try {
      await archiveSignedPdf(documentId, doc);
      archived = true;
    } catch (e) {
      warning = `Status updated, but archiving the signed PDF failed: ${(e as Error).message}`;
      console.error('[documents] auto-archive failed:', e);
    }
  }

  return NextResponse.json({ status: newStatus, archived, ...(warning ? { warning } : {}) });
}
