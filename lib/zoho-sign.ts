const TOKEN_URL   = 'https://accounts.zoho.in/oauth/v2/token';
const SIGN_API    = 'https://sign.zohoapis.in/api/v1';

// ---------------------------------------------------------------------------
// Token management — fetch a fresh access token using the stored refresh token
// ---------------------------------------------------------------------------
let _cachedToken: { token: string; expiresAt: number } | null = null;

export async function getZohoAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - 60_000) {
    return _cachedToken.token;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     process.env.ZOHO_SIGN_CLIENT_ID!,
      client_secret: process.env.ZOHO_SIGN_CLIENT_SECRET!,
      refresh_token: process.env.ZOHO_SIGN_REFRESH_TOKEN!,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Zoho token error: ${JSON.stringify(data)}`);
  }

  _cachedToken = {
    token:     data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return _cachedToken.token;
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

  // Build multipart form
  const form = new FormData();

  // Attach the PDF file
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  form.append('file', blob, fileName);

  // Build the request JSON
  const requestData = {
    requests: {
      request_name:    requestName,
      expiration_days: 30,
      is_sequential:   true,
      actions: [
        {
          recipient_name:  signer.name,
          recipient_email: signer.email,
          action_type:     'SIGN',
          signing_order:   1,
          verify_recipient: false,
          fields: {
            signature_fields: [
              {
                field_name:    'Signature',
                field_label:   'Signature',
                page_no:       1,
                document_id:   '0',          // Zoho replaces with actual doc id
                x_coord:       62,
                y_coord:       680,
                width:         180,
                height:        40,
                is_mandatory:  true,
              },
            ],
            date_fields: [
              {
                field_name:  'SignDate',
                field_label: 'Date',
                page_no:     1,
                document_id: '0',
                x_coord:     300,
                y_coord:     680,
                width:       120,
                height:      40,
                is_mandatory: true,
              },
            ],
          },
        },
      ],
    },
  };

  form.append('data', JSON.stringify(requestData));

  const res = await fetch(`${SIGN_API}/requests`, {
    method:  'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    body:    form,
  });

  const json = await res.json();

  if (json.status !== 'success') {
    throw new Error(`Zoho Sign error: ${JSON.stringify(json)}`);
  }

  const req = json.requests;
  const doc = req.document_ids?.[0];

  return {
    requestId:  req.request_id,
    documentId: doc?.document_id ?? '',
    signingUrl: req.actions?.[0]?.signing_url,
  };
}

// ---------------------------------------------------------------------------
// Get signing status of a request
// ---------------------------------------------------------------------------
export type ZohoSignStatus = 'inprogress' | 'completed' | 'declined' | 'expired' | 'recalled';

export async function getSigningStatus(requestId: string): Promise<ZohoSignStatus> {
  const token = await getZohoAccessToken();

  const res = await fetch(`${SIGN_API}/requests/${requestId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });

  const json = await res.json();
  return (json.requests?.request_status ?? 'inprogress') as ZohoSignStatus;
}
