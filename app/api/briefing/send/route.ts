import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

const RECIPIENTS = [
  { name: 'Sudha Raghu',         email: 'sudha@simpliigence.com',   owner: 'Sudha Raghu' },
  { name: 'Akanksha Srivastava', email: 'akanksha@simpliigence.com', owner: 'Akanksha Srivastava' },
]
const PREVIEW_EMAIL = 'raghu.seetharam@simpliigence.com'

function priorityColor(p: string) {
  if (p === 'High')   return { bar: '#E24B4A', badge: '#FCEBEB', text: '#A32D2D' }
  if (p === 'Medium') return { bar: '#EF9F27', badge: '#FAEEDA', text: '#854F0B' }
  return { bar: '#63A522', badge: '#EAF3DE', text: '#3B6D11' }
}

function taskCard(task: {title:string; status:string; priority:string; due_date:string|null; description:string|null}) {
  const c = priorityColor(task.priority)
  const dueLabel = task.due_date
    ? `<div style="font-size:11px;color:#888;margin-top:5px;">📅 Due ${new Date(task.due_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>`
    : ''
  return `
    <div style="background:#f9f9f9;border-radius:0 8px 8px 0;padding:12px 14px;border-left:3px solid ${c.bar};margin-bottom:8px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div style="font-size:13px;font-weight:600;color:#1a1a2e;">${task.title}</div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <span style="background:${c.badge};color:${c.text};font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;">${task.priority}</span>
          <span style="background:#E6F1FB;color:#185FA5;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;">${task.status}</span>
        </div>
      </div>
      ${task.description ? `<div style="font-size:12px;color:#666;margin-top:4px;">${task.description}</div>` : ''}
      ${dueLabel}
    </div>`
}

function buildEmail(recipientName: string, tasks: {title:string;status:string;priority:string;due_date:string|null;description:string|null}[], today: string) {
  const high = tasks.filter(t => t.priority === 'High')
  const firstName = recipientName.split(' ')[0]
  const urgencyBadge = high.length > 0
    ? `<span style="background:#FCEBEB;color:#A32D2D;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;">${high.length} high priority</span>`
    : `<span style="background:#EAF3DE;color:#3B6D11;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;">On track</span>`

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f0f0;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

<tr><td style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:28px 32px;">
  <table width="100%"><tr>
    <td><div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Simpliigence</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:2px;">HR · People Operations</div></td>
    <td align="right"><div style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Daily Briefing</div>
                      <div style="font-size:13px;color:rgba(255,255,255,0.7);margin-top:3px;">${today}</div></td>
  </tr></table>
</td></tr>

<tr><td style="background:#ffffff;padding:28px 32px 20px;">
  <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:6px;">Good morning, ${firstName} 👋</div>
  <div style="font-size:14px;color:#666;line-height:1.6;margin-bottom:20px;">Here's your HR action snapshot for today. You have <strong>${tasks.length} open item${tasks.length !== 1 ? 's' : ''}</strong> — let's keep the momentum going.</div>

  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:700;color:#1a1a2e;text-transform:uppercase;letter-spacing:0.5px;">Your Open Actions</div>
    ${urgencyBadge}
  </div>

  ${tasks.map(taskCard).join('')}
</td></tr>

<tr><td style="background:#f9f9f9;border-radius:0 0 12px 12px;padding:20px 32px;">
  <table width="100%"><tr>
    <td style="font-size:11px;color:#999;line-height:1.6;">
      Simpliigence HR Portal · Sent weekdays at 8:00 AM IST<br>
      Manage tasks at <a href="https://simpliigence-hr-portal.vercel.app/actions" style="color:#185FA5;">simpliigence-hr-portal.vercel.app</a>
    </td>
    <td align="right">
      <a href="https://simpliigence-hr-portal.vercel.app/actions" style="background:#1a1a2e;color:#ffffff;font-size:12px;padding:8px 18px;border-radius:8px;text-decoration:none;font-weight:600;white-space:nowrap;">Open Portal →</a>
    </td>
  </tr></table>
</td></tr>

</table></td></tr></table>
</body></html>`
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const isPreview = url.searchParams.get('preview') === '1'

    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    })

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    const results: string[] = []

    for (const recipient of RECIPIENTS) {
      const { data: tasks } = await supabase
        .from('hr_actions')
        .select('title,status,priority,due_date,description')
        .eq('owner', recipient.owner)
        .not('status', 'in', '("Done","Cancelled")')
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false })

      if (!tasks || tasks.length === 0) {
        results.push(`${recipient.name}: no open tasks, skipped`)
        continue
      }

      const html = buildEmail(recipient.name, tasks, today)
      const to = isPreview ? PREVIEW_EMAIL : recipient.email

      await transporter.sendMail({
        from: `"${process.env.GMAIL_FROM_NAME}" <${process.env.GMAIL_USER}>`,
        to,
        subject: `${isPreview ? '[PREVIEW] ' : ''}Your HR action items — ${today}`,
        html,
      })
      results.push(`${recipient.name}: sent to ${to}`)
    }

    return NextResponse.json({ ok: true, results })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
