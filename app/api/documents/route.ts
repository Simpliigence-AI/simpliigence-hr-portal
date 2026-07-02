import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendDocumentForSignature, getSigningStatus } from '@/lib/zoho-sign';
import { generateOfferLetter, generateExperienceLetter, generateIncrementLetter } from '@/lib/letter-templates';

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
  const { employeeId, type, details, signerEmail, signerName } = body;

  if (!employeeId || !type || !signerEmail || !signerName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Generate PDF
  let pdfBytes: Buffer;
  let title: string;
  let signaturePage: number | undefined;
  let signatureYFromTop: number | undefined;
  try {
    if (type === 'offer') {
      ({ pdfBytes, title, signaturePage, signatureYFromTop } = await generateOfferLetter(details));
    } else if (type === 'experience') {
      ({ pdfBytes, title } = await generateExperienceLetter(details));
    } else if (type === 'increment') {
      ({ pdfBytes, title } = await generateIncrementLetter(details));
    } else {
      return NextResponse.json({ error: 'Unknown document type' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: `PDF generation failed: ${(e as Error).message}` }, { status: 500 });
  }

  // Send to Zoho Sign
  let zohoResult;
  try {
    const signatureLoc = (signaturePage !== undefined && signatureYFromTop !== undefined)
      ? { page: signaturePage, yFromTop: signatureYFromTop }
      : undefined;
    zohoResult = await sendDocumentForSignature(
      pdfBytes,
      `${title.replace(/\s+/g, '_')}.pdf`,
      title,
      { name: signerName, email: signerEmail },
      signatureLoc,
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
