import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// GET /api/documents/file?id=<employee_documents row id>
//
// The employee-documents storage bucket is PRIVATE, so raw object URLs 404 with
// "Bucket not found". This route authenticates the caller (same Supabase session
// check as the other API routes), looks the row up with the service-role client,
// and 302-redirects to a short-lived signed URL for the underlying file.

function serverSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => (cookieStore as unknown as { getAll: () => { name: string; value: string }[] }).getAll() } },
  );
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Rows historically stored the full public object URL
// (.../storage/v1/object/public/employee-documents/<path>); newer rows store the
// bare storage path. Accept both; reject anything else.
function storagePathFrom(url: string): string | null {
  const marker = '/employee-documents/';
  if (url.includes(marker)) {
    const rest = url.split(marker)[1]?.split('?')[0];
    return rest ? decodeURIComponent(rest) : null;
  }
  return /^https?:\/\//i.test(url) ? null : url;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Session check — only signed-in users may fetch stored documents.
  const { data: { user } } = await serverSupabase().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 });
  }
  const admin = adminSupabase();

  const { data: row, error } = await admin
    .from('employee_documents')
    .select('url')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row?.url) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const path = storagePathFrom(row.url);
  if (!path) return NextResponse.json({ error: 'Document has no storage path' }, { status: 404 });

  const { data: signed, error: signErr } = await admin.storage
    .from('employee-documents')
    .createSignedUrl(path, 60);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message ?? 'Could not create signed URL' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}
