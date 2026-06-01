import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export const dynamic = 'force-dynamic'

const RECIPIENTS = [
  { name: 'Sudha Raghu',         email: 'sudha@simpliigence.com',    owner: 'Sudha Raghu' },
  { name: 'Akanksha Srivastava', email: 'akanksha@simpliigence.com', owner: 'Akanksha Srivastava' },
]
const PREVIEW_EMAIL = 'raghu.seetharam@simpliigence.com'

function priorityColors(p: string) {
  if (p === 'High')   return { bar: '#E24B4A', bg: '#FCEBEB', text: '#A32D2D' }
  if (p === 'Medium') return { bar: '#EF9F27', bg: '#FAEEDA', text: '#854F0B' }
  return                     { bar: '#63A522', bg: '#EAF3DE', text: '#3B6D11' }
}

function taskHtml(t: {title:string; status:string; priority:string; due_date:string|null; description:string|null}) {
  const c = priorityColors(t.priority)
  return `<div style="background:#f8f8f8;border-radius:0 8px 8px 0;padding:12px 14px;border-left:3px solid ${c.bar};margin-bottom:8px;">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
    <div style="font-size:13px;font-weight:600;color:#1a1a2e;">${t.title}</div>
    <div style="white-space:nowrap;">
      <span style="background:${c.bg};color:${c.text};font-size:10px;padding:2px 7px;border-radius:9px;font-weight:600;">${t.priority}</span>
      <span style="background:#E6F1FB;color:#185FA5;font-size:10px;padding:2px 7px;border-radius:9px;font-weight:600;margin-left:4px;">${t.status}</span>
    </div>
  </div>
  ${t.description ? `<div style="font-size:12px;color:#666;margin-top:4px;">${t.description.split('\\n')[0]}</div>` : ''}
  ${t.due_date ? `<div style="font-size:11px;color:#888;margin-top:5px;">📅 Due ${new Date(t.due_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>` : ''}
</div>`
}

function buildHtml(name: string, tasks: {title:string;status:string;priority:string;due_date:string|null;description:string|null}[], today: string) {
  const first = name.split(' ')[0]
  const high = tasks.filter(t => t.priority === 'High').length
  const badge = high > 0
    ? `<span style="background:#FCEBEB;color:#A32D2D;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;">${high} high priority</span>`
    : `<span style="background:#EAF3DE;color:#3B6D11;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;">On track</span>`

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

<tr><td style="background:#1a1a2e;border-radius:12px 12px 0 0;padding:26px 32px;">
  <table width="100%"><tr>
    <td><div style="font-size:20px;font-weight:700;color:#fff;">Simpliigence</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px;">HR · People Operations</div></td>
    <td align="right"><div style="font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Daily Briefing</div>
                      <div style="font-size:13px;color:rgba(255,255,255,0.65);margin-top:3px;">${today}</div></td>
  </tr></table>
</td></tr>

<tr><td style="background:#fff;padding:28px 32px;">
  <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:6px;">Good morning, ${first} 👋</div>
  <div style="font-size:14px;color:#555;line-height:1.6;margin-bottom:20px;">You have <strong>${tasks.length} open action item${tasks.length!==1?'s':''}</strong> today. Let's keep the momentum going.</div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
    <div style="font-size:12px;font-weight:700;color:#1a1a2e;text-transform:uppercase;letter-spacing:0.5px;">Your open actions</div>
    ${badge}
  </div>
  ${tasks.map(taskHtml).join('')}
</td></tr>

<tr><td style="background:#f8f8f8;border-radius:0 0 12px 12px;padding:18px 32px;">
  <table width="100%"><tr>
    <td style="font-size:11px;color:#999;line-height:1.6;">
      Simpliigence HR Portal · Weekdays at 8:00 AM IST<br>
      <a href="https://simpliigence-hr-portal.vercel.app/actions" style="color:#185FA5;text-decoration:none;">View all in portal →</a>
    </td>
    <td align="right">
      <a href="https://simpliigence-hr-portal.vercel.app/actions" style="background:#1a1a2e;color:#fff;font-size:12px;padding:9px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open Portal</a>
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    })

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })

    const results: string[] = []

    for (const r of RECIPIENTS) {
      const { data: tasks, error } = await supabase
        .from('hr_actions')
        .select('title,status,priority,due_date,description')
        .eq('owner', r.owner)
        .not('status', 'in', '("Done","Cancelled")')
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false })

      if (error) { results.push(`${r.name}: db error: ${error.message}`); continue }
      if (!tasks?.length) { results.push(`${r.name}: no open tasks`); continue }

      const to = isPreview ? PREVIEW_EMAIL : r.email
      await transporter.sendMail({
        from: `"${process.env.GMAIL_FROM_NAME || 'Simpliigence HR'}" <${process.env.GMAIL_USER}>`,
        to,
        subject: `${isPreview ? '[PREVIEW] ' : ''}Your HR action items — ${today}`,
        html: buildHtml(r.name, tasks, today),
      })
      results.push(`${r.name}: sent to ${to}`)
    }

    return NextResponse.json({ ok: true, results })
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
