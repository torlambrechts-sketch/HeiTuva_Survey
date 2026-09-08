/**
 * The audience-facing member status — DECISIONS **Q61**.
 *
 * ── WHY THIS IS A DERIVATION AND NOT A COLUMN ───────────────────────────────
 *
 * The v2 bundle draws FOUR statuses on the Medlemmer card (V2:4327–4335):
 * `Aktiv`, `Bounce`, `Reservert`, `Ny`. `org_members.status` is a THREE-value
 * enum — `invited | active | inactive` (`M:0002:46`) — and it is about the
 * account, not about whether a person can or may be reached.
 *
 * Q61: «derive, do not duplicate. **No new status column.**» The reason is
 * stated in the decision and is worth repeating where the code lives: *a second
 * column carrying a derived fact is a column that disagrees with its source the
 * first time one of them is written alone*. `Reservert` lives in
 * `suppressions`, and a `status = 'reservert'` beside it would go stale the
 * moment an objection is lifted by anything that did not also remember to write
 * the enum.
 *
 * So this is the whole of the vocabulary, in one function, and
 * `tests/unit/member-status.test.ts` binds it to Q61's clause rather than to my
 * memory of it.
 *
 * ── PRECEDENCE, WHICH THE DECISION DOES NOT SETTLE AND SOMEBODY MUST ────────
 *
 * A person can be several of these at once — invited AND suppressed, active AND
 * bounced AND suppressed. The order below is by WHAT CHANGES WHAT HAPPENS TO
 * THEM, most decisive first:
 *
 *   hidden     `inactive` — Q61 says these are not listed at all
 *   Reservert  they have objected; nothing will be sent, whatever else is true
 *   Bounce     the last thing sent did not arrive
 *   Ny         invited, has not signed in
 *   Aktiv      none of the above
 *
 * `Reservert` outranks `Bounce` deliberately: a bounce is a fact about an
 * address, an objection is a decision by a person, and showing the address
 * problem over the person's decision would invite somebody to "fix" the address
 * and send anyway.
 */
export const MEMBER_STATUSES = ['reservert', 'bounce', 'ny', 'aktiv'] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

export type MemberFacts = {
  /** `org_members.status`. */
  accountStatus: string
  /** A row in `suppressions` for this address, org-wide (Q60). */
  suppressed: boolean
  /** `bounced_at` on the member's most recent invitation. */
  bouncedAt: string | null
}

/**
 * Returns `null` for a member the card does not list — Q61's «`inactive` →
 * (hidden)». `null` rather than a fifth status, so a caller that forgets to
 * filter renders nothing instead of inventing a word the design does not have.
 */
export function memberStatus(m: MemberFacts): MemberStatus | null {
  if (m.accountStatus === 'inactive') return null
  if (m.suppressed) return 'reservert'
  if (m.bouncedAt) return 'bounce'
  if (m.accountStatus === 'invited') return 'ny'
  return 'aktiv'
}

/**
 * The pill's background, from the bundle's own mapping (V2:5008–5009):
 * `Aktiv → --sf2`, `Bounce → --ac3`, `Reservert → --ac3`, `Ny → --sbg`.
 * Tokens, never literals — CLAUDE.md's theme table is the source.
 */
export const STATUS_BG: Record<MemberStatus, string> = {
  aktiv: 'var(--sf2)',
  bounce: 'var(--ac3)',
  reservert: 'var(--ac3)',
  ny: 'var(--sbg)',
}

/** next-intl keys, one per status. Kept beside the vocabulary so a fifth status
 *  cannot be added without a key, and bound by the test. */
export const STATUS_KEY: Record<MemberStatus, string> = {
  aktiv: 'mgStatusAktiv',
  bounce: 'mgStatusBounce',
  reservert: 'mgStatusReservert',
  ny: 'mgStatusNy',
}
