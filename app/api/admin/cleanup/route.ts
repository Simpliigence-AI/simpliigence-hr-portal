import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export async function GET() {
  const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await a.auth.admin.updateUserById('e552d8db-be02-441b-8e18-f492dec68603', { password: 'Simpliigence12#' })
  return NextResponse.json({ ok: !error, email: data?.user?.email, error: error?.message })
}
