import { NextResponse } from 'next/server';
import { getZohoAccessToken } from '@/lib/zoho-sign';

async function testEndpoint(url: string, token: string): Promise<string> {
      try {
              const res = await fetch(url, {
                        headers: { Authorization: `Zoho-oauthtoken ${token}` },
              });
              const json = await res.json() as Record<string, unknown>;
              return json.status === 'success'
                ? `ok (HTTP ${res.status})`
                        : `HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`;
      } catch (err) {
              const e = err as Error & { cause?: unknown };
              const cause = e.cause ? ` | cause: ${JSON.stringify(e.cause)}` : '';
              return `FAILED: ${e.message}${cause}`;
      }
}

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

  // Test India DC
  checks['sign.zohoapis.in'] = await testEndpoint(
          'https://sign.zohoapis.in/api/v1/requests?page_context.row_count=1',
          token,
        );

  // Test global DC (US)
  checks['sign.zohoapis.com'] = await testEndpoint(
          'https://sign.zohoapis.com/api/v1/requests?page_context.row_count=1',
          token,
        );

        // Test main zoho.* domains (zohoapis.* fails DNS on Vercel)
        checks['sign.zoho.in'] = await testEndpoint(
                  'https://sign.zoho.in/api/v1/requests?page_context.row_count=1',
                  token,
                );

        checks['sign.zoho.com'] = await testEndpoint(
                  'https://sign.zoho.com/api/v1/requests?page_context.row_count=1',
                  token,
                );

  const anySignOk = Object.entries(checks)
        .filter(([k]) => k.startsWith('sign.'))
        .some(([, v]) => v.startsWith('ok'));

  return NextResponse.json({ ok: anySignOk, checks }, { status: anySignOk ? 200 : 500 });
}
