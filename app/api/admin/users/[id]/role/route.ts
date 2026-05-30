import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerRole } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  if (callerRole?.role === 'manager')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { role } = await req.json()
  if (!['admin', 'manager'].includes(role))
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  if (role === 'admin') {
    // admin = no entry in user_roles table
    await adminClient.from('user_roles').delete().eq('user_id', params.id)
  } else {
    await adminClient.from('user_roles').upsert(
      {
        user_id: params.id,
        role,
        assigned_by: user.email,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
  }

  return NextResponse.json({ ok: true, role })
}
