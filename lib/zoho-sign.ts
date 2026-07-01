const TOKEN_URL = 'https://accounts.zoho.in/oauth/v2/token';
const SIGN_API = 'https://sign.zoho.in/api/v1';

// ---------------------------------------------------------------------------
// Token management — fetch a fresh access token using the stored refresh token
// ---------------------------------------------------------------------------
let _cachedToken: { token: string; expiresAt: number } | null = null;

export async function getZohoAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - 60_000) {
    return _cachedToken.token;
  }

  const clientId = process.env.ZOHO_SIGN_CLIENT_ID;
  const clientSecret = process.env.ZOHO_SIGN_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_SIGN_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      `Missing Zoho env vars: ${[
        !clientId && 'ZOHO_SIGN_CLIENT_ID',
        !clientSecret && 'ZOHO_SIGN_CLIENT_SECRET',
        !refreshToken && 'ZOHO_SIGN_REFRESH_TOKEN',
      ].filter(Boolean).join(', ')}`,
    );
  }

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
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
    token: data.access_token,
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
  const CRLF = '\r\n';

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
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ---------------------------------------------------------------------------
// Send a document (PDF bytes) for e-signature
// ---------------------------------------------------------------------------
export interface SignerInfo {
  name: string;
  email: string;
}

export interface SendForSignatureResult {
  requestId: string;
  documentId: string;
  signingUrl?: string;
}

export async function sendDocumentForSignature(
  pdfBytes: Buffer,
  fileName: string,
  requestName: string,
  signer: SignerInfo,
): Promise<SendForSignatureResult> {
  const token = await getZohoAccessToken();

  const requestData = {
    requests: {
      request_name: requestName,
      expiration_days: 30,
      is_sequential: true,
      actions: [
        {
          recipient_name: signer.name,
          recipient_email: signer.email,
          action_type: 'SIGN',
          signing_order: 1,
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
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
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
  const requestId = (req.request_id as string) ?? '';

  // document_ids may be [{document_id, document_name}] or just [string]
  const rawDocs = req.document_ids as Array<Record<string, string> | string> | undefined;
  const rawDoc = rawDocs?.[0];
  const doc = typeof rawDoc === 'string' ? undefined : rawDoc;
  const documentId = (typeof rawDoc === 'string' ? rawDoc : rawDoc?.document_id) ?? '';

  // Extract action_id — Zoho Sign needs this to bind the signature field to the signer
  const rawActions = req.actions as Array<Record<string, unknown>> | undefined;
  const actionId = (rawActions?.[0]?.action_id as string) ?? '';

  // Fail fast with full response detail so Vercel logs show what Zoho actually returned
  console.log('[zoho-sign] Step 1 extracted:', { requestId, documentId, actionId });
  if (!requestId || !documentId || !actionId) {
    throw new Error(
      `Zoho Sign Step 1 ID extraction failed — requestId="${requestId}", documentId="${documentId}", actionId="${actionId}" ` +
      `| response.requests keys: ${Object.keys(req).join(', ')} ` +
      `| document_ids: ${JSON.stringify(req.document_ids)} ` +
      `| actions[0]: ${JSON.stringify(rawActions?.[0])}`,
    );
  }

  // ── Step 1.5: Add a signature field to the document ─────────────────────
  // Zoho Sign requires at least one field per signer before submit (error 9101).
  // IMPORTANT: `fields` must be an object with typed sub-arrays (e.g. sign_fields),
  // NOT a flat array — a flat array causes error 9004 "No match found".
  const fieldsPayload = {
    fields: {
      sign_fields: [
        {
          action_id: actionId,
          field_label: 'Signature',
          field_name: 'Signature',
          is_mandatory: true,
          x_coord: 50,
          y_coord: 680,
          abs_width: 200,
          abs_height: 50,
          page_no: 0,          // Zoho Sign uses 0-based page numbers
        },
      ],
    },
  };

  let fieldsRes: Response;
  try {
    fieldsRes = await fetch(`${SIGN_API}/requests/${requestId}/documents/${documentId}/fields`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fieldsPayload),
    });
  } catch (err) {
    throw new Error(`Sign API add fields network error: ${(err as Error).message}`);
  }

  let fieldsJson: Record<string, unknown>;
  try {
    fieldsJson = await fieldsRes.json();
  } catch {
    throw new Error(`Sign API fields non-JSON response (HTTP ${fieldsRes.status})`);
  }

  if (fieldsJson.status !== 'success') {
    throw new Error(
      `Zoho Sign add fields error (HTTP ${fieldsRes.status}): ${JSON.stringify(fieldsJson)} ` +
      `[requestId=${requestId}, documentId=${documentId}, actionId=${actionId}]`,
    );
  }

  // ── Step 2: Submit the request — this sends the signing email ───────────
  let submitRes: Response;
  try {
    submitRes = await fetch(`${SIGN_API}/requests/${requestId}/submit`, {
      method: 'POST',
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
