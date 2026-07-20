import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'raghu.seetharam@simpliigence.com'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function makeServerClient() {
  const cookieStore = cookies()
  return createServerClient(
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
}

async function requireAdmin() {
  const supabase = makeServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) return null
  return user
}

// GET /api/admin/users — list all auth users with their roles
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: { users }, error }, { data: roles }] = await Promise.all([
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
    adminClient.from('user_roles').select('user_id, role, assigned_at, assigned_by'),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const roleMap = Object.fromEntries((roles ?? []).map(r => [r.user_id, r]))

  const result = users.map(u => ({
    id: u.id,
    email: u.email ?? '',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
    role: roleMap[u.id]?.role ?? 'viewer',
    assigned_at: roleMap[u.id]?.assigned_at ?? null,
    assigned_by: roleMap[u.id]?.assigned_by ?? null,
  }))

  const order: Record<string, number> = { admin: 0, manager: 1, viewer: 2 }
  result.sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3) || a.email.localeCompare(b.email))

  return NextResponse.json(result)
}

// POST /api/admin/users — create a new user
export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, role, password: customPassword } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const tempPassword = customPassword || (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!1')
  const { data: newUser, error } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (role && role !== 'admin' && newUser.user) {
    await adminClient.from('user_roles').upsert({
      user_id: newUser.user.id,
      role,
      assigned_by: user.email,
      assigned_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  return NextResponse.json({ ok: true, id: newUser.user?.id, email: newUser.user?.email, tempPassword })
}
