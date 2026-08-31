// lib/appraisal-server.ts — server-only helpers for the appraisal module.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import nodemailer from 'nodemailer'

export const svc = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

export function newToken() {
  return randomBytes(24).toString('base64url')
}

export function baseUrl(req?: Request) {
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_BASE_URL
  if (env) return env.replace(/\/$/, '')
  if (req) {
    const h = new Headers(req.headers)
    const host = h.get('x-forwarded-host') || h.get('host')
    const proto = h.get('x-forwarded-proto') || 'https'
    if (host) return `${proto}://${host}`
  }
  return 'https://simpliigence-hr-portal.vercel.app'
}

export function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

type MailArgs = { to: string; subject: string; heading: string; body: string; cta?: { label: string; url: string }; footer?: string }

export function shell({ heading, body, cta, footer }: Omit<MailArgs, 'to' | 'subject'>) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:26px 32px;">
  <div style="font-size:20px;font-weight:700;color:#fff;">Simpliigence</div>
  <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:2px;">People &amp; Performance</div>
</td></tr>
<tr><td style="background:#fff;padding:30px 32px;">
  <div style="font-size:21px;font-weight:700;color:#1a1a2e;margin-bottom:14px;">${heading}</div>
  <div style="font-size:14px;color:#444;line-height:1.65;">${body}</div>
  ${cta ? `<div style="margin:26px 0 8px;"><a href="${cta.url}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">${cta.label}</a></div>
  <div style="font-size:11px;color:#999;margin-top:10px;word-break:break-all;">Or paste this link into your browser:<br>${cta.url}</div>` : ''}
</td></tr>
<tr><td style="background:#fafafa;border-radius:0 0 12px 12px;padding:16px 32px;border-top:1px solid #eee;">
  <div style="font-size:11px;color:#999;line-height:1.6;">${footer ?? 'This link is personal to you — please do not forward it. Questions? Reply to this email.'}</div>
</td></tr>
</table></td></tr></table></body></html>`
}

/** Which channel this deployment can actually send appraisal mail through. */
export function mailChannel(): 'graph' | 'smtp' | 'none' {
  if (process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) return 'graph'
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'smtp'
  return 'none'
}

/** The mailbox appraisal mail is sent from. Must be a real M365 mailbox. */
export function mailFrom() {
  return process.env.APPRAISAL_FROM || 'raghu.seetharam@simpliigence.com'
}

async function graphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID!,
        client_secret: process.env.AZURE_CLIENT_SECRET!,
        grant_type: 'client_credentials',
        scope: 'https://graph.microsoft.com/.default',
      }),
    }
  )
  const j = await res.json()
  if (!res.ok || !j.access_token) throw new Error(j.error_description || j.error || 'token request failed')
  return j.access_token as string
}

/**
 * Send through Microsoft 365 with the app registration already used by the
 * Teams sync. Needs the Mail.Send *application* permission with admin consent;
 * without it Graph answers 403 and we say so rather than failing silently.
 */
async function sendViaGraph(args: MailArgs): Promise<{ ok: boolean; error?: string }> {
  const token = await graphToken()
  const sender = mailFrom()
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: args.subject,
        body: { contentType: 'HTML', content: shell(args) },
        toRecipients: [{ emailAddress: { address: args.to } }],
      },
      saveToSentItems: true,
    }),
  })
  if (res.status === 202) return { ok: true }
  const text = await res.text()
  let detail = text.slice(0, 300)
  try { detail = JSON.parse(text)?.error?.message ?? detail } catch {}
  if (res.status === 403) {
    return { ok: false, error: `Graph refused (403). The app registration needs the Mail.Send application permission with admin consent. ${detail}` }
  }
  if (res.status === 404) {
    return { ok: false, error: `No mailbox found for ${sender}. Set APPRAISAL_FROM to a real M365 mailbox. ${detail}` }
  }
  return { ok: false, error: `Graph ${res.status}: ${detail}` }
}

async function sendViaSmtp(args: MailArgs): Promise<{ ok: boolean; error?: string }> {
  const user = process.env.GMAIL_USER!
  const pass = process.env.GMAIL_APP_PASSWORD!
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
  await transporter.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME || 'Simpliigence People Team'}" <${user}>`,
    to: args.to,
    subject: args.subject,
    html: shell(args),
  })
  return { ok: true }
}

export async function sendMail(args: MailArgs): Promise<{ ok: boolean; error?: string }> {
  if (!args.to) return { ok: false, error: 'No email address on file' }
  const channel = mailChannel()
  if (channel === 'none') return { ok: false, error: 'No mail channel configured' }
  try {
    return channel === 'graph' ? await sendViaGraph(args) : await sendViaSmtp(args)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}

export async function logEvent(appraisalId: string, actor: string, event: string, detail?: string) {
  await svc().from('appraisal_events').insert({ appraisal_id: appraisalId, actor, event, detail: detail ?? null })
}
