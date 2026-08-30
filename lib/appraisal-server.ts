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

export async function sendMail(args: MailArgs): Promise<{ ok: boolean; error?: string }> {
  const user = process.env.GMAIL_USER || ''
  const pass = process.env.GMAIL_APP_PASSWORD || ''
  if (!user || !pass) return { ok: false, error: 'SMTP not configured' }
  if (!args.to) return { ok: false, error: 'No email address on file' }
  try {
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
    await transporter.sendMail({
      from: `"${process.env.GMAIL_FROM_NAME || 'Simpliigence People Team'}" <${user}>`,
      to: args.to,
      subject: args.subject,
      html: shell(args),
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}

export async function logEvent(appraisalId: string, actor: string, event: string, detail?: string) {
  await svc().from('appraisal_events').insert({ appraisal_id: appraisalId, actor, event, detail: detail ?? null })
}
