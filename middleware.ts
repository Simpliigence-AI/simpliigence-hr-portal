import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Paths managers are allowed to visit — everything else redirects to /performance
const MANAGER_ALLOWED = ['/performance']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  const { pathname } = request.nextUrl

  // Redirect unauthenticated users to login
  if (!session && pathname !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Role-based routing: managers may only visit /performance (and /api/ routes)
  if (session && pathname !== '/login' && !pathname.startsWith('/api/')) {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .maybeSingle()

    const role = roleData?.role ?? 'admin'

    if (role === 'manager') {
      const allowed = MANAGER_ALLOWED.some(
        p => pathname === p || pathname.startsWith(p + '/')
      )
      if (!allowed) {
        const url = request.nextUrl.clone()
        url.pathname = '/performance'
        return NextResponse.redirect(url)
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/zoho-test|api/employees|api/briefing).*)',
  ],
}
