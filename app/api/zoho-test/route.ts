import { NextResponse } from 'next/server';
import { getZohoAccessToken } from '@/lib/zoho-sign';

export async function GET() {
    const checks: Record<string, string> = {};

    checks.ZOHO_SIGN_CLIENT_ID     = process.env.ZOHO_SIGN_CLIENT_ID     ? 'set' : 'MISSING';
    checks.ZOHO_SIGN_CLIENT_SECRET = process.env.ZOHO_SIGN_CLIENT_SECRET ? 'set' : 'MISSING';
    checks.ZOHO_SIGN_REFRESH_TOKEN = process.env.ZOHO_SIGN_REFRESH_TOKEN ? 'set' : 'MISSING';

    const anyMissing = Object.values(checks).some(v => v === 'MISSING');
    if (anyMissing) {
          return NextResponse.json({ ok: false, checks }, { status: 500 });
        }

    let token: string;
    try {
          token = await getZohoAccessToken();
          checks.tokenFetch = `ok (length ${token.length})`;
        } catch (err) {
          checks.tokenFetch = `FAILED: ${(err as Error).message}`;
          return NextResponse.json({ ok: false, checks }, { status: 500 });
        }

    try {
          const res = await fetch('https://sign.zohoapis.in/api/v1/requests?page_context.row_count=1', {
                  headers: { Authorization: `Zoho-oauthtoken ${token}` },
                });
          const json = await res.json() as Record<string, unknown>;
          checks.signApi = json.status === 'success'
            ? `ok (HTTP ${res.status})`
            : `unexpected: ${JSON.stringify(json).slice(0, 200)}`;
        } catch (err) {
          checks.signApi = `FAILED: ${(err as Error).message}`;
          return NextResponse.json({ ok: false, checks }, { status: 500 });
        }

    return NextResponse.json({ ok: true, checks });
  }
