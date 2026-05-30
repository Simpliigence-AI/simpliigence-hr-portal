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
