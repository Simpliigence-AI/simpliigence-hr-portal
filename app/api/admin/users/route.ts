import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET() {
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

  // Only admins (no row in user_roles, or role=admin) can list users
  const { data: callerRole } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  if (callerRole?.role === 'manager')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // List all auth users via service role
  const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch all role assignments
  const { data: roles } = await adminClient.from('user_roles').select('user_id, role, assigned_at, assigned_by')
  const roleMap = Object.fromEntries((roles ?? []).map(r => [r.user_id, r]))

  const result = users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    role: roleMap[u.id]?.role ?? 'admin',
    assigned_at: roleMap[u.id]?.assigned_at ?? null,
    assigned_by: roleMap[u.id]?.assigned_by ?? null,
  }))

  return NextResponse.json(result)
}


export async function POST(req: Request) {
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

  const { email, role, password: customPassword } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  // Create user with a random password — they can reset via "Forgot password"
  const tempPassword = customPassword || (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!1')
  const { data: newUser, error } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Assign role if manager
  if (role === 'manager' && newUser.user) {
    await adminClient.from('user_roles').upsert({
      user_id: newUser.user.id,
      role: 'manager',
      assigned_by: user.email,
      assigned_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  return NextResponse.json({
    ok: true,
    id: newUser.user?.id,
    email: newUser.user?.email,
    tempPassword,
  })
}
