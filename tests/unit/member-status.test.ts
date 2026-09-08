import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MEMBER_STATUSES,
  STATUS_BG,
  STATUS_KEY,
  memberStatus,
  type MemberFacts,
} from '@/lib/audiences/member-status'

/**
 * DECISIONS **Q61** — «derive, do not duplicate. No new status column.»
 *
 * The clause is a mapping, so these bind the mapping rather than sampling it,
 * and the last two bind it to things outside this file: the message catalogue,
 * and the SCHEMA — because the whole point of Q61 is that the four words are
 * not stored anywhere.
 */
const facts = (p: Partial<MemberFacts> = {}): MemberFacts => ({
  accountStatus: 'active',
  suppressed: false,
  bouncedAt: null,
  ...p,
})

describe('(Q61) the four statuses are derived from data that already exists', () => {
  it('maps each of the three account states the clause names', () => {
    expect(memberStatus(facts({ accountStatus: 'active' }))).toBe('aktiv')
    expect(memberStatus(facts({ accountStatus: 'invited' }))).toBe('ny')
    // «inactive → (hidden)» — null, not a fifth word.
    expect(memberStatus(facts({ accountStatus: 'inactive' }))).toBeNull()
  })

  it('Bounce comes from the invitation, Reservert from the suppression list', () => {
    expect(memberStatus(facts({ bouncedAt: '2026-09-01T00:00:00Z' }))).toBe('bounce')
    expect(memberStatus(facts({ suppressed: true }))).toBe('reservert')
  })

  it('RESERVERT OUTRANKS BOUNCE, and the order is the point', () => {
    // A bounce is a fact about an address; an objection is a decision by a
    // person. Showing the address problem over the decision invites somebody to
    // "fix" the address and send anyway.
    expect(memberStatus(facts({ suppressed: true, bouncedAt: '2026-09-01T00:00:00Z' }))).toBe(
      'reservert',
    )
    expect(memberStatus(facts({ accountStatus: 'invited', suppressed: true }))).toBe('reservert')
    expect(memberStatus(facts({ accountStatus: 'invited', bouncedAt: '2026-09-01' }))).toBe('bounce')
  })

  it('hidden beats everything — an inactive member is not on this card at all', () => {
    expect(
      memberStatus(facts({ accountStatus: 'inactive', suppressed: true, bouncedAt: '2026-09-01' })),
    ).toBeNull()
  })

  it('every status has a colour and a message key, and nothing else does', () => {
    // Assert over the SET both ways (standing question 3): a fifth status
    // cannot be added without both, and neither map may carry a word the
    // vocabulary does not have.
    expect(Object.keys(STATUS_BG).sort()).toEqual([...MEMBER_STATUSES].sort())
    expect(Object.keys(STATUS_KEY).sort()).toEqual([...MEMBER_STATUSES].sort())
  })

  it('and every message key exists in BOTH languages', () => {
    for (const lang of ['no', 'en']) {
      const messages = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')) as {
        admin: Record<string, string>
      }
      for (const key of Object.values(STATUS_KEY)) {
        expect(messages.admin[key], `${lang}.json admin.${key}`).toBeTruthy()
      }
    }
  })

  it('NO NEW STATUS COLUMN — the schema still knows only the three account states', () => {
    // The clause's own words, asserted against the migration that would have to
    // change for it to stop being true. This is the half a mapping test cannot
    // see: Q61 is satisfied not by what this file computes but by what the
    // database does NOT store.
    const m0002 = readFileSync('supabase/migrations/20260902000002_tenancy.sql', 'utf8')
    const check = m0002.match(/status\s+text[^,]*check\s*\(([^)]*)\)/i)?.[1] ?? ''
    expect(check, 'the account-status CHECK, unchanged').toMatch(/invited/)
    expect(check).toMatch(/active/)
    expect(check).toMatch(/inactive/)
    for (const word of MEMBER_STATUSES) {
      expect(check.toLowerCase(), `«${word}» must never become a stored value`).not.toContain(word)
    }
  })
})
