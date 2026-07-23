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
// Build a raw multipart/form-data body
// ---------------------------------------------------------------------------
function buildMultipartBody(
  pdfBytes: Buffer,
  fileName: string,
  requestDataJson: string,
): { body: Buffer; contentType: string } {
  const boundary = `----ZohoSignBoundary${Date.now()}`;
  const CRLF     = '\r\n';

  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}` +
      `Content-Type: application/pdf${CRLF}${CRLF}`,
    ),
    pdfBytes,
    Buffer.from(CRLF),
    Buffer.from(
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="data"${CRLF}` +
      `Content-Type: application/json${CRLF}${CRLF}` +
      requestDataJson +
      CRLF,
    ),
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

// CEO counter-signs all employment contracts electronically; default per HR, override via env.
// These are company (not secret) values — a plain corporate email + display name.
const DEFAULT_CEO_EMAIL = 'raghu.seetharam@simpliigence.com';
const DEFAULT_CEO_NAME  = 'Raghu Seetharam';

export async function sendDocumentForSignature(
  pdfBytes:     Buffer,
  fileName:     string,
  requestName:  string,
  signer:       SignerInfo,
): Promise<SendForSignatureResult> {
  const token = await getZohoAccessToken();

  // Signature fields are NOT placed by coordinates. The uploaded PDF carries Zoho Sign TEXT
  // TAGS at each signature line ({{Signature:Recipient1}} for the employee, {{Signature:Recipient2}}
  // for the CEO — see lib/contract-layout.ts). Zoho's automatic field detection scans the
  // document text on upload and creates each Signature field where its tag sits, mapping
  // Recipient<n> to the Nth action below. Recipient order MUST match these actions exactly:
  //   • Recipient1 = employee   (signing_order 1)
  //   • Recipient2 = CEO/company (signing_order 2)
  // The CEO recipient is therefore ALWAYS included so the Recipient2 tag resolves. The CEO
  // signer defaults to the HR-confirmed counter-signer and can be overridden via env.
  const ceoEmail = process.env.ZOHO_CEO_EMAIL || DEFAULT_CEO_EMAIL;
  const ceoName  = process.env.ZOHO_CEO_NAME  || DEFAULT_CEO_NAME;

  const recipients = [
    {
      recipient_name:   signer.name,
      recipient_email:  signer.email,
      action_type:      'SIGN' as const,
      signing_order:    1,
      verify_recipient: false,
    },
    {
      recipient_name:   ceoName,
      recipient_email:  ceoEmail,
      action_type:      'SIGN' as const,
      signing_order:    2,
      verify_recipient: false,
    },
  ];

  const requestData = {
    requests: {
      request_name:    requestName,
      expiration_days: 30,
      is_sequential:   true,
      actions:         recipients,
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

  const req        = json.requests as Record<string, unknown>;
  const requestId  = (req.request_id as string) ?? '';

  const rawDocs  = req.document_ids as Array<Record<string, string> | string> | undefined;
  const rawDoc   = rawDocs?.[0];
  const doc      = typeof rawDoc === 'string' ? undefined : rawDoc;
  const documentId = (typeof rawDoc === 'string' ? rawDoc : rawDoc?.document_id) ?? '';

  // Signature fields for BOTH recipients are created by Zoho's automatic text-tag detection
  // while the PDF is uploaded in Step 1 above ({{Signature:Recipient1}} → employee action,
  // {{Signature:Recipient2}} → CEO action). There is deliberately NO separate coordinate
  // field-placement (former "Step 1.5") call — coordinate fields would conflict with the
  // detected tag fields. We only need the request/document IDs to submit and to record it.
  console.log('[zoho-sign] Step 1 extracted:', { requestId, documentId, actions: req.actions });
  if (!requestId || !documentId) {
    throw new Error(
      `Zoho Sign Step 1 ID extraction failed — requestId="${requestId}", documentId="${documentId}" ` +
      `| response.requests keys: ${Object.keys(req).join(', ')} ` +
      `| document_ids: ${JSON.stringify(req.document_ids)} ` +
      `| actions: ${JSON.stringify(req.actions)}`,
    );
  }

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

  console.log('[zoho-sign] Step 2 submit response:', JSON.stringify(submitJson));

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
