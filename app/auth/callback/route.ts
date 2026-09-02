import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Exchanges the emailed code for a session (invite, magic link, recovery). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('neste') ?? '/'

  if (!code) return NextResponse.redirect(`${origin}/logg-inn?feil=mangler-kode`)

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/logg-inn?feil=ugyldig-lenke`)

  // Only ever redirect within this origin — an open redirect here would let an
  // invite link forward a freshly authenticated user to an attacker's page.
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  return NextResponse.redirect(`${origin}${target}`)
}
