import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'raghu.seetharam@simpliigence.com'
const VALID_ROLES = ['admin', 'manager', 'viewer'] as const
type Role = typeof VALID_ROLES[number]

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function requireAdmin() {
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
  if (!user || user.email !== ADMIN_EMAIL) return null
  return user
}

// PUT /api/admin/users/[id]/role — update a user's role
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { role } = await req.json() as { role: Role }
  if (!VALID_ROLES.includes(role))
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  // Prevent removing own admin role
  if (params.id === user.id && role !== 'admin')
    return NextResponse.json({ error: 'Cannot remove your own admin role' }, { status: 400 })

  const { error } = await adminClient.from('user_roles').upsert({
    user_id: params.id,
    role,
    assigned_by: user.email,
    assigned_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, role })
}
