import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ACTIVE_LOCALES, LANG_COOKIE, isLocale } from '@/lib/i18n/locales'
import type { Database } from '@/types/database'

/** Refreshes the auth cookie on every request and gates the app surface.
 *  Returns the response so cookies set here reach the browser. */
export async function updateSession(request: NextRequest) {
  /*
    `?lang=` on a public page, carried into a cookie.

    A visitor has no profile to read a language off, so `resolveLocale` would
    always answer `no` and the splash's picker changed nothing. Setting the
    cookie on the REQUEST as well as the response is what makes the switch take
    effect on this render rather than the next one; a signed-in user's profile
    still wins, so this only ever speaks for someone who has no preference
    stored anywhere.
  */
  const asked = request.nextUrl.searchParams.get('lang')
  // ACTIVE, not merely valid: sv and da are seeded but not served, so
  // `?lang=sv` must not hand a visitor a page that is half Norwegian.
  const wanted = isLocale(asked) && ACTIVE_LOCALES.includes(asked) ? asked : null

  if (wanted) request.cookies.set(LANG_COOKIE, wanted)

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
    // V2-9. `/l/[code]` is the QR's landing: it redeems a live voucher and
    // redirects to `/s/[token]`. A room scans a code on a wall, so by
    // definition nobody there has a session — gating it would send thirty
    // people to a login they do not have, which is the same mistake `/r/`
    // avoids one route over. It authorises itself from the code inside
    // `redeem_live_voucher`, and V2-8's lesson applies: a directory name is not
    // a promise the router makes, so the path is listed HERE, explicitly.
    path.startsWith('/l/') ||
    // A shared report has no session by design: the unguessable link IS the
    // credential (DECISIONS). compose_report authorises the token itself, so
    // redirecting here would send every recipient to a login they do not have.
    path.startsWith('/r/') ||
    // The splash. `/` is the marketing page for a visitor with no session and
    // the product's front door for everyone else — a signed-in user is sent on
    // to Oversikt below rather than reading a pitch for something they already
    // bought.
    path === '/' ||
    // The two documents the splash's footer links to. Public by nature: a
    // privacy notice nobody can read before signing up is not a notice.
    path === '/personvern' ||
    path === '/databehandleravtale' ||
    // V2-8. Bruksområder is a MARKETING page — it is what the splash's use-case
    // section links to, and its whole audience is people with no account.
    //
    // The list above is the reason this was worth a defect rather than a line:
    // the route lives under `app/(marketing)/`, which reads like a promise the
    // router does not make. Middleware decides what is public, and it decides by
    // an explicit path list. `verify:browser` caught it — «asked for
    // /bruksomrader as anon but the browser ended up on /logg-inn» — because the
    // manifest declares the visitor, not because anything checked the folder.
    path === '/bruksomrader' ||
    // I1-2. The SCIM endpoint carries its OWN credential — a bearer token
    // checked in `lib/scim/auth.ts` against a per-organisation hash — so a
    // session redirect here is not a gate, it is a 302 to an HTML login page
    // sent to a machine that speaks JSON. Entra would report it as an
    // unintelligible failure and quarantine the connector.
    //
    // FOUND BY READING THIS FILE, NOT BY A TEST: the route handlers are plain
    // functions and `tests/db/scim-endpoint.test.ts` calls them directly, so
    // every authentication test in that suite passes with the endpoint
    // unreachable in production. The V2-8 comment eight lines up says the same
    // thing about a directory name; this is the API-route instance of it, and it
    // is `verify:browser`'s manifest — the visitor, declared — that proves the
    // path is actually served.
    path.startsWith('/api/scim/') ||
    path.startsWith('/_next') ||
    path === '/favicon.ico'

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/logg-inn'
    url.searchParams.set('neste', path)
    return NextResponse.redirect(url)
  }

  if (user && (path.startsWith('/logg-inn') || path === '/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/oversikt'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (wanted) {
    response.cookies.set(LANG_COOKIE, wanted, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  return response
}
