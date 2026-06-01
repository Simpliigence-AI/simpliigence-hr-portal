import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const ids = ['18f6c6e2-3e08-455e-bff1-ff92b8410217','5f00a67f-37ca-4ab2-989d-84939c5e4717','237e764f-43d6-47fb-8ec9-62fd18da3bdc']
  const results = await Promise.all(ids.map(id => a.auth.admin.updateUserById(id, { password: 'Simpliigence12#' }).then(r => ({ id, ok: !r.error, email: r.data?.user?.email, err: r.error?.message }))))
  return NextResponse.json({ results })
}
