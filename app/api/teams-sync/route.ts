import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/* ── Microsoft Graph helpers ──────────────────────────────────────── */

async function getGraphToken(): Promise<string> {
  const tenantId     = process.env.AZURE_TENANT_ID!;
  const clientId     = process.env.AZURE_CLIENT_ID!;
  const clientSecret = process.env.AZURE_CLIENT_SECRET!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Azure token error: ${err}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

interface GraphUser {
  id:               string;
  displayName:      string;
  mail?:            string | null;
  userPrincipalName?: string;
  jobTitle?:        string | null;
  department?:      string | null;
  mobilePhone?:     string | null;
  businessPhones?:  string[];
}

async function fetchAllUsers(token: string): Promise<GraphUser[]> {
  const users: GraphUser[] = [];
  let url: string | null =
    'https://graph.microsoft.com/v1.0/users' +
    '?$select=id,displayName,mail,userPrincipalName,jobTitle,department,mobilePhone,businessPhones' +
    '&$top=999&$filter=accountEnabled eq true';

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const page = await res.json() as { value: GraphUser[]; '@odata.nextLink'?: string };
    users.push(...page.value);
    url = page['@odata.nextLink'] ?? null;
  }
  return users;
}

async function fetchPhoto(token: string, userId: string): Promise<Buffer | null> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userId}/photo/$value`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/* ── Main handler ─────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  // Validate env vars
  const missing = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'].filter(
    k => !process.env[k],
  );
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing env vars: ${missing.join(', ')}. Add them in Vercel settings.` },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // needs service role to write storage + update rows
  );

  let synced = 0, photos = 0, skipped = 0;
  const log: string[] = [];

  try {
    // 1. Get Graph token
    log.push('🔑 Authenticating with Azure AD…');
    const token = await getGraphToken();

    // 2. Fetch all M365 users
    log.push('👥 Fetching Microsoft 365 users…');
    const msUsers = await fetchAllUsers(token);
    log.push(`   Found ${msUsers.length} M365 users`);

    // 3. Load all employees from Supabase (for matching)
    const { data: employees } = await supabase
      .from('employees')
      .select('id, name, ms_email')
      .eq('active', true);

    if (!employees?.length) {
      return NextResponse.json({ error: 'No active employees found in Supabase.' }, { status: 400 });
    }

    // Build a name-normalise helper
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

    // 4. Match + sync each M365 user
    log.push('🔄 Matching and syncing…');

    for (const msUser of msUsers) {
      const email = msUser.mail ?? msUser.userPrincipalName ?? '';

      // Match by email first, then by display name
      const emp =
        employees.find(e => e.ms_email && norm(e.ms_email) === norm(email)) ??
        employees.find(e => norm(e.name) === norm(msUser.displayName));

      if (!emp) { skipped++; continue; }

      // 5. Fetch and upload photo
      let photoUrl: string | null = null;
      const photoBuffer = await fetchPhoto(token, msUser.id);
      if (photoBuffer) {
        const filePath = `${emp.id}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, photoBuffer, {
            contentType: 'image/jpeg',
            upsert: true,
          });

        if (!uploadError) {
          const { data: publicData } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
          photoUrl = publicData.publicUrl;
          photos++;
        }
      }

      // 6. Update employee record
      const phone =
        msUser.mobilePhone ??
        (msUser.businessPhones?.length ? msUser.businessPhones[0] : null);

      await supabase.from('employees').update({
        ms_user_id:    msUser.id,
        ms_email:      email || null,
        job_title:     msUser.jobTitle    ?? null,
        ms_department: msUser.department  ?? null,
        phone:         phone              ?? null,
        ...(photoUrl ? { photo_url: photoUrl } : {}),
        ms_synced_at:  new Date().toISOString(),
      }).eq('id', emp.id);

      synced++;
    }

    log.push(`✅ Synced ${synced} employees (${photos} photos uploaded, ${skipped} M365 users had no match)`);

    return NextResponse.json({ synced, photos, skipped, log });

  } catch (e) {
    const msg = (e as Error).message;
    log.push(`❌ Error: ${msg}`);
    return NextResponse.json({ error: msg, log }, { status: 500 });
  }
}
