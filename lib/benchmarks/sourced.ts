/**
 * Q134 — is this benchmark row something we may show a customer?
 *
 * `supabase/seed.sql` shipped five industry rows with INVENTED numbers (3.9,
 * 12, 0.72, 3.7, 8) and the source «Seed — erstatt med kildeført referanse».
 * Every database built from that seed, production included, therefore rendered
 * a comparison bar positioned by a made-up figure, with a developer note under
 * it telling the reader the figure was made up. Found by walking the product as
 * a customer; no gate reaches it, because a gate checks that the number renders
 * and not whether anyone stands behind it.
 *
 * That is «never fabricate data in the UI» broken in the most direct way
 * available — a fake value indistinguishable from a real one in review, which
 * survives into demos as though it were true — and it was the FIRST comparison
 * a first customer would ever see.
 *
 * THE LIMIT OF THIS CHECK, STATED, because it is a string test and this project
 * keeps a table about mistaking one of those for a property: it can only refuse
 * a source that DECLARES itself provisional. A confidently-worded invented
 * citation passes. The durable half is therefore not this function but the seed
 * no longer shipping numbers at all; this closes the databases that already
 * have them, without a migration, which is the half that reaches production
 * today.
 */
const PROVISIONAL = /(^|\b)(seed|placeholder|tbd|todo|dummy|eksempel|example)\b|erstatt med|replace with/i

export function isSourced(source: string | null | undefined): boolean {
  const s = (source ?? '').trim()
  if (!s) return false
  return !PROVISIONAL.test(s)
}
