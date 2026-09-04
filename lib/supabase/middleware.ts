import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

/** Refreshes the auth cookie on every request and gates the app surface.
 *  Returns the response so cookies set here reach the browser. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // getUser() revalidates against the auth server. getSession() only reads the
  // cookie, which a client can forge — never gate on it.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic =
    path.startsWith('/logg-inn') ||
    path.startsWith('/auth') ||
    path.startsWith('/s/') || // respondent surface is deliberately unauthenticated
    // A shared report has no session by design: the unguessable link IS the
    // credential (DECISIONS). compose_report authorises the token itself, so
    // redirecting here would send every recipient to a login they do not have.
    path.startsWith('/r/') ||
    path.startsWith('/_next') ||
    path === '/favicon.ico'

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/logg-inn'
    url.searchParams.set('neste', path)
    return NextResponse.redirect(url)
  }

  if (user && path.startsWith('/logg-inn')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
