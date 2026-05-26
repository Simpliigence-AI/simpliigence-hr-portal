const TOKEN_URL = 'https://accounts.zoho.in/oauth/v2/token';
const SIGN_API  = 'https://sign.zoho.in/api/v1';

// ---------------------------------------------------------------------------
// Token management — fetch a fresh access token using the stored refresh token
// ---------------------------------------------------------------------------
let _cachedToken: { token: string; expiresAt: number } | null = null;

export async function getZohoAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - 60_000) {
    return _cachedToken.token;
  }

  // Validate env vars upfront for a clear error message
  const clientId     = process.env.ZOHO_SIGN_CLIENT_ID;
  const clientSecret = process.env.ZOHO_SIGN_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_SIGN_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      `Missing Zoho env vars: ${[
        !clientId     && 'ZOHO_SIGN_CLIENT_ID',
        !clientSecret && 'ZOHO_SIGN_CLIENT_SECRET',
        !refreshToken && 'ZOHO_SIGN_REFRESH_TOKEN',
      ].filter(Boolean).join(', ')}`,
    );
  }

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'refresh_token',
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });
  } catch (err) {
    throw new Error(`Token fetch network error (accounts.zoho.in unreachable?): ${(err as Error).message}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Zoho token exchange failed (HTTP ${res.status}): ${JSON.stringify(data)}`);
  }

  _cachedToken = {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return _cachedToken.token;
}

// ---------------------------------------------------------------------------
// Build a raw multipart/form-data body — avoids FormData/Blob/File compat issues
// across Node.js versions (Node 18 doesn't always have File globally).
// ---------------------------------------------------------------------------
function buildMultipartBody(
  pdfBytes: Buffer,
  fileName: string,
  requestDataJson: string,
): { body: Buffer; contentType: string } {
  const boundary = `----ZohoSignBoundary${Date.now()}`;
  const CRLF     = '\r\n';

  const parts: Buffer[] = [
    // ── PDF file part ──────────────────────────────────────────────────────
    Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}` +
      `Content-Type: application/pdf${CRLF}${CRLF}`,
    ),
    pdfBytes,
    Buffer.from(CRLF),

    // ── JSON data part ─────────────────────────────────────────────────────
    Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="data"${CRLF}` +
      `Content-Type: application/json${CRLF}${CRLF}` +
      requestDataJson +
      CRLF,
    ),

    // ── Closing boundary ───────────────────────────────────────────────────
    Buffer.from(`--${boundary}--${CRLF}`),
  ];

  return {
    body:        Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ---------------------------------------------------------------------------
// Send a document (PDF bytes) for e-signature
// ---------------------------------------------------------------------------
export interface SignerInfo {
  name:  string;
  email: string;
}

export interface SendForSignatureResult {
  requestId:  string;
  documentId: string;
  signingUrl?: string;
}

export async function sendDocumentForSignature(
  pdfBytes:    Buffer,
  fileName:    string,
  requestName: string,
  signer:      SignerInfo,
): Promise<SendForSignatureResult> {
  const token = await getZohoAccessToken();

  const requestData = {
    requests: {
      request_name:    requestName,
      expiration_days: 30,
      is_sequential:   true,
      actions: [
        {
          recipient_name:   signer.name,
          recipient_email:  signer.email,
          action_type:      'SIGN',
          signing_order:    1,
          verify_recipient: false,
        },
      ],
    },
  };

  const { body, contentType } = buildMultipartBody(
    pdfBytes,
    fileName,
    JSON.stringify(requestData),
  );

  // ── Step 1: Create the request (lands in DRAFT state) ───────────────────
  let res: Response;
  try {
    res = await fetch(`${SIGN_API}/requests`, {
      method:  'POST',
      headers: {
        Authorization:  `Zoho-oauthtoken ${token}`,
        'Content-Type': contentType,
      },
      body,
    });
  } catch (err) {
    throw new Error(`Sign API network error: ${(err as Error).message}`);
  }

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Sign API returned non-JSON response (HTTP ${res.status})`);
  }

  if (json.status !== 'success') {
    throw new Error(`Zoho Sign create error (HTTP ${res.status}): ${JSON.stringify(json)}`);
  }

  const req = json.requests as Record<string, unknown>;
  const doc = (req.document_ids as Array<Record<string, string>> | undefined)?.[0];
  const requestId = req.request_id as string;

  // ── Step 2: Submit the request — this sends the signing email ───────────
  let submitRes: Response;
  try {
    submitRes = await fetch(`${SIGN_API}/requests/${requestId}/submit`, {
      method:  'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
      },
    });
  } catch (err) {
    throw new Error(`Sign API submit network error: ${(err as Error).message}`);
  }

  let submitJson: Record<string, unknown>;
  try {
    submitJson = await submitRes.json();
  } catch {
    throw new Error(`Sign API submit non-JSON response (HTTP ${submitRes.status})`);
  }

  if (submitJson.status !== 'success') {
    throw new Error(`Zoho Sign submit error (HTTP ${submitRes.status}): ${JSON.stringify(submitJson)}`);
  }

  const submittedReq = submitJson.requests as Record<string, unknown>;

  return {
    requestId,
    documentId: doc?.document_id ?? '',
    signingUrl: (submittedReq?.actions as Array<Record<string, string>> | undefined)?.[0]?.signing_url,
  };
}

// ---------------------------------------------------------------------------
// Get signing status of a request
// ---------------------------------------------------------------------------
export type ZohoSignStatus = 'inprogress' | 'completed' | 'declined' | 'expired' | 'recalled';

export async function getSigningStatus(requestId: string): Promise<ZohoSignStatus> {
  const token = await getZohoAccessToken();

  let res: Response;
  try {
    res = await fetch(`${SIGN_API}/requests/${requestId}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
  } catch (err) {
    throw new Error(`Status check network error: ${(err as Error).message}`);
  }

  const json = await res.json() as Record<string, Record<string, string>>;
  return (json.requests?.request_status ?? 'inprogress') as ZohoSignStatus;
}
