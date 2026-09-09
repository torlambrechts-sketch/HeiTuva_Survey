import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

/**
 * `/l/[code]` — where the QR points. **The voucher, redeemed.**
 *
 * Tor, 2026-09-09: «The code is a VOUCHER, not a ticket: scanning it calls a
 * public RPC that mints a single-use token for that device, and the respondent
 * enters the existing submit_response path like any other invitee.»
 *
 * So this route does exactly one thing and then gets out of the way: it calls
 * `public.redeem_live_voucher` and **redirects to `/s/[token]`**. There is no
 * live respondent surface, no second question renderer and no second write
 * path — the person answers on the same screen every other respondent uses,
 * which is what keeps CLAUDE.md invariant 2 the general sentence it is.
 *
 * ── WHY THIS IS A SERVER COMPONENT AND NOT A FORM POST ─────────────────────
 *
 * A GET that mints a token is a write on a read verb, which is normally wrong.
 * It is right here, and deliberately: **the alternative is a screen with a
 * button between the scan and the survey**, and the failure that produces is a
 * room of thirty people each looking at an interstitial they must tap. The
 * mint is idempotent in the only sense that matters — a second scan produces a
 * second token, both valid, both single-use, both expiring with the session —
 * and the RPC writes an invitation and never a response.
 *
 * Its one refusal is deliberately uninformative. `redeem_live_voucher` answers
 * `not_found_or_closed` for a wrong code, a closed one and an expired one
 * alike, so an unauthenticated caller cannot enumerate live sessions by reading
 * the difference, and this page must not undo that by explaining which it was.
 */
export default async function LiveJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const t = await getTranslations('liveJoin')

  // Shape-checked before it reaches the database. The RPC upper-cases and trims
  // its own input, so this is a cheap rejection rather than the authority.
  const clean = code.trim().toUpperCase()
  let token: string | null = null

  if (/^[A-Z0-9]{6,10}$/.test(clean)) {
    const supabase = await createClient()
    const { data } = await supabase.rpc('redeem_live_voucher', { p_code: clean })
    const payload = data as { token?: string; error?: string } | null
    if (payload?.token) token = payload.token
  }

  if (token) redirect(`/s/${token}`)

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-4 px-5 py-10">
      <h1 className="font-display text-2xl font-medium">{t('title')}</h1>
      <p className="text-[14px] leading-[1.55] text-mut">{t('invalid')}</p>
      <Link href="/" className="text-[14px] font-semibold text-ink underline">
        {t('back')}
      </Link>
    </main>
  )
}
