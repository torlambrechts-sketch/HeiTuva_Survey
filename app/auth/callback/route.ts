import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/** Exchanges the emailed code for a session (invite, magic link, recovery). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  // Zod at the boundary (CLAUDE.md rule 6). `neste` is constrained to a single
  // leading slash so it cannot become a protocol-relative open redirect.
  const Params = z.object({
    code: z.string().min(1),
    neste: z
      .string()
      .regex(/^\/(?!\/)[\w\-/]*$/)
      .optional(),
  })
  const parsed = Params.safeParse({
    code: searchParams.get('code') ?? undefined,
    neste: searchParams.get('neste') ?? undefined,
  })
  if (!parsed.success) return NextResponse.redirect(`${origin}/logg-inn?feil=mangler-kode`)
  const { code, neste } = parsed.data
  const next = neste ?? '/'

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/logg-inn?feil=ugyldig-lenke`)

  // Only ever redirect within this origin — an open redirect here would let an
  // invite link forward a freshly authenticated user to an attacker's page.
  const target = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  return NextResponse.redirect(`${origin}${target}`)
}
