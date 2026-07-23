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

/**
 * A single signature field placement.
 * page:      0-based page index (matches the coordinates emitted by the HTML→PDF renderer
 *            and by generateOfferLetter; Zoho's page_no is used 0-based here).
 * yFromTop:  y coordinate in PDF points measured from the TOP of the page.
 * xFromLeft: x coordinate in PDF points from the LEFT edge (defaults to ~108pt).
 */
export interface SigField {
  page:       number;
  yFromTop:   number;
  xFromLeft?: number;
}

/**
 * Where to place signature field(s). The employee is the recipient who receives the signing
 * email and may have MULTIPLE signature fields (the contract has two employee signature lines
 * — the mid-doc "Verified and Accepted" block and the final "UNDERSTOOD & ACCEPTED" block —
 * both signed by the same recipient). `company` is the CEO / counter-signature field; it is
 * only added when a company signer email is configured via ZOHO_CEO_EMAIL (otherwise it is
 * safely skipped so the employee-signing flow is never broken).
 *
 * `employees` carries the full list of employee fields. `employee` (singular) is retained for
 * back-compat and, when present, is appended to the list.
 * Back-compat: a bare { page, yFromTop } is still accepted and treated as a single employee field.
 */
export interface SignaturePlacement {
  employees?: SigField[];
  employee?:  SigField;
  company?:   SigField;
}

export interface SendForSignatureResult {
  requestId:  string;
  documentId: string;
  signingUrl?: string;
}

const SIG_WIDTH  = 200;
const SIG_HEIGHT = 45;

// CEO counter-signs all employment contracts electronically; default per HR, override via env.
// These are company (not secret) values — a plain corporate email + display name.
const DEFAULT_CEO_EMAIL = 'raghu.seetharam@simpliigence.com';
const DEFAULT_CEO_NAME  = 'Raghu Seetharam';

export async function sendDocumentForSignature(
  pdfBytes:     Buffer,
  fileName:     string,
  requestName:  string,
  signer:       SignerInfo,
  placement?:   SignaturePlacement | SigField,
): Promise<SendForSignatureResult> {
  const token = await getZohoAccessToken();

  // Normalise legacy bare { page, yFromTop } → { employee: {...} }. A SignaturePlacement is
  // recognised by having any of the placement keys (employees/employee/company).
  const isPlacement = (p: unknown): p is SignaturePlacement =>
    !!p && typeof p === 'object' &&
    ('employees' in (p as object) || 'employee' in (p as object) || 'company' in (p as object));
  const place: SignaturePlacement =
    isPlacement(placement)
      ? placement
      : placement
        ? { employee: placement as SigField }
        : {};

  // Collect all employee signature fields (list + optional legacy singular).
  const employeeFields: SigField[] = [
    ...(place.employees ?? []),
    ...(place.employee ? [place.employee] : []),
  ];
  const empFields = employeeFields.length ? employeeFields : [{ page: 2, yFromTop: 700 }];

  // The company/CEO field is added whenever a company anchor placement exists. The CEO signer
  // defaults to the HR-confirmed counter-signer and can still be overridden via env.
  const ceoEmail = process.env.ZOHO_CEO_EMAIL || DEFAULT_CEO_EMAIL;
  const ceoName  = process.env.ZOHO_CEO_NAME  || DEFAULT_CEO_NAME;
  const includeCompany = !!(place.company && ceoEmail);

  const recipients = [
    {
      recipient_name:   signer.name,
      recipient_email:  signer.email,
      action_type:      'SIGN' as const,
      signing_order:    1,
      verify_recipient: false,
    },
    ...(includeCompany ? [{
      recipient_name:   ceoName,
      recipient_email:  ceoEmail!,
      action_type:      'SIGN' as const,
      signing_order:    2,
      verify_recipient: false,
    }] : []),
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

  const rawActions = req.actions as Array<Record<string, unknown>> | undefined;
  const actionId   = (rawActions?.[0]?.action_id as string) ?? '';
  const ceoActionId = includeCompany ? ((rawActions?.[1]?.action_id as string) ?? '') : '';

  console.log('[zoho-sign] Step 1 extracted:', { requestId, documentId, actionId, ceoActionId, includeCompany });
  if (!requestId || !documentId || !actionId || (includeCompany && !ceoActionId)) {
    throw new Error(
      `Zoho Sign Step 1 ID extraction failed — requestId="${requestId}", documentId="${documentId}", actionId="${actionId}" ` +
      `| response.requests keys: ${Object.keys(req).join(', ')} ` +
      `| document_ids: ${JSON.stringify(req.document_ids)} ` +
      `| actions: ${JSON.stringify(rawActions)}`,
    );
  }

  // ── Step 1.5: Add signature field(s) via PUT /requests/{requestId} ───────
  // A signature is an "image_field" in Zoho Sign (NOT sign_fields — that causes error 9004).
  // Must be sent as application/x-www-form-urlencoded with data= prefix (NOT application/json).
  //
  // Placement uses coordinates measured from the rendered PDF: the employee field sits at the
  // employee signature line, and (when a company signer is configured) the CEO field sits at
  // the "For Simpliigence Private Limited" signature line. page_no is 0-based (matches the
  // renderer / generateOfferLetter). Falls back to sensible defaults when no placement given.
  const mkImageField = (
    actId: string, name: string, f: SigField,
  ) => ({
    field_type_name: 'Signature',
    document_id:     documentId,
    action_id:       actId,
    field_label:     name,
    field_name:      name,
    is_mandatory:    true,
    x_coord:         Math.round(f.xFromLeft ?? 108),
    y_coord:         Math.round(f.yFromTop),
    abs_width:       SIG_WIDTH,
    abs_height:      SIG_HEIGHT,
    page_no:         f.page,
  });

  // The employee recipient gets ONE image_field per employee signature line (field names must
  // be unique). All belong to the single employee action_id (Recipient1).
  const employeeImageFields = empFields.map((f, i) =>
    mkImageField(actionId, i === 0 ? 'EmployeeSignature' : `EmployeeSignature${i + 1}`, f));

  const fieldActions: Array<Record<string, unknown>> = [
    {
      action_id:       actionId,
      recipient_name:  signer.name,
      recipient_email: signer.email,
      action_type:     'SIGN',
      fields: { image_fields: employeeImageFields },
    },
    ...(includeCompany ? [{
      action_id:       ceoActionId,
      recipient_name:  ceoName,
      recipient_email: ceoEmail!,
      action_type:     'SIGN',
      fields: { image_fields: [mkImageField(ceoActionId, 'CompanySignature', place.company!)] },
    }] : []),
  ];

  const fieldsPayload = {
    requests: {
      request_name: requestName,
      actions: fieldActions,
    },
  };

  console.log('[zoho-sign] Step 1.5 payload:', JSON.stringify(fieldsPayload));

  let fieldsRes: Response;
  try {
    fieldsRes = await fetch(`${SIGN_API}/requests/${requestId}`, {
      method:  'PUT',
      headers: {
        Authorization:  `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ data: JSON.stringify(fieldsPayload) }),
    });
  } catch (err) {
    throw new Error(`Sign API update request network error: ${(err as Error).message}`);
  }

  let fieldsJson: Record<string, unknown>;
  try {
    fieldsJson = await fieldsRes.json();
  } catch {
    throw new Error(`Sign API fields non-JSON response (HTTP ${fieldsRes.status})`);
  }

  console.log('[zoho-sign] Step 1.5 response:', JSON.stringify(fieldsJson));

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
