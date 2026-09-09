import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import noMessages from '../../messages/no.json'
import enMessages from '../../messages/en.json'

/**
 * V2-8 — Bruksområder. **Q56 CONFIRMED: strike the links.**
 *
 * ── WHY THIS FILE IS ABOUT NUMBERS AND NOT ABOUT LAYOUT ────────────────────
 *
 * The bundle hard-codes a question count per use case, and **all nine were
 * wrong** against the seeded packs: `psykososial` claimed 38 where the pack has
 * 7, `aktsomhet` 27 where it has 6, `trakassering` 16 where it has 5. On a
 * PUBLIC page that is D73 — «no public page claims a capability the product
 * does not have» — and CLAUDE.md's «never fabricate data in the UI», nine times
 * over, in the form the rule warns about: a number indistinguishable from a
 * real one.
 *
 * The page derives them instead. These tests hold the derivation honest.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

/** Mirrors `app/(marketing)/bruksomrader/page.tsx`'s PACK map. */
const PACK: Record<string, string | null> = {
  puls: 'ukentlig-puls',
  medarbeider: null,
  psykososial: 'psykososial-kartlegging',
  trakassering: 'trakassering-ytringsklima',
  likestilling: 'likestilling-deltid',
  aktsomhet: 'leverandor-apenhetsloven',
  onboarding: 'oppstartssjekk',
  kunde: 'csat',
  exit: 'sluttsamtale',
}

describe('(V2-8) Bruksområder states nothing the product cannot back', () => {
  it('every pack the page cites exists — a rename fails here, not silently on the page', () => {
    const named = Object.values(PACK).filter((p): p is string => p !== null)
    const found = new Set(
      psql(
        `select key from public.template_packs where org_id is null
          and key in (${named.map((p) => `'${p}'`).join(',')})`,
      ).map((r) => r[0]!),
    )
    expect(named.filter((p) => !found.has(p)), 'these packs are cited and do not exist').toEqual([])
  })

  it('NO question count is written into the copy — the numbers come from the packs', () => {
    // The failure this prevents is the one the bundle shipped: a count in a
    // string, true on the day it was typed and wrong ever after.
    const uc = (noMessages as Record<string, Record<string, string>>).usecases!
    const withCounts = Object.entries(uc).filter(
      ([k, v]) => k !== 'questions' && /\b\d{1,3}\s*(spørsmål|questions)\b/i.test(v),
    )
    expect(withCounts.map(([k]) => k), 'a question count in a string').toEqual([])
  })

  it('NO categorical threshold on this public page — Q55’s class, and the DoD names it', () => {
    // «Anonymt, terskel 5» appeared three times and «Vises fra 5 svar» once.
    // The threshold is the organisation's, and a public page stating a number
    // is exactly the copy Q55 corrected in V2-0. The DoD for this phase says it
    // must not come back from the v2 bundle.
    for (const [lang, msgs] of [['no', noMessages], ['en', enMessages]] as const) {
      const uc = (msgs as Record<string, Record<string, string>>).usecases!
      const offenders = Object.entries(uc)
        .filter(([, v]) => /terskel\s*\d|threshold\s*\d|fra\s*\d+\s*svar|from\s*\d+\s*answers/i.test(v))
        // The harassment pack LOCKS its threshold at 8 — a fixed number that is
        // a fact about the pack rather than a promise about the gate, and
        // `template_packs.policy` is where it is checked below.
        .filter(([k]) => !k.startsWith('trakassering'))
      expect(offenders.map(([k]) => k), `${lang}: a fixed threshold on a public page`).toEqual([])
    }
  })

  it('and the ONE fixed threshold it does state is the one the pack locks', () => {
    const locked = psql(
      `select (policy->>'k_threshold') from public.template_packs
        where org_id is null and key = 'trakassering-ytringsklima'`,
    )[0]![0]
    expect(locked, 'the pack locks 8, so «terskel 8» is a fact about the template').toBe('8')
    const uc = (noMessages as Record<string, Record<string, string>>).usecases!
    expect(uc.trakasseringSetupV3).toContain('8')
  })

  it('the two languages carry the same keys — a missing one renders the key itself', () => {
    const no = Object.keys((noMessages as Record<string, Record<string, string>>).usecases!)
    const en = Object.keys((enMessages as Record<string, Record<string, string>>).usecases!)
    expect(no.filter((k) => !en.includes(k)), 'missing in en').toEqual([])
    expect(en.filter((k) => !no.includes(k)), 'extra in en').toEqual([])
  })

  it('no copy on this page still carries a sentence the product does not honour', () => {
    // The same sweep V2-6 ran over the help articles, at the moment this copy
    // ships. Five of these were in the bundle's own text.
    const banned: [string, string][] = [
      ['slås sammen i rapporten', 'suppress_partition suppresses; it does not merge'],
      ['Funn under terskel', 'Q72: the trigger is audience size, not a finding'],
      ['kjønnsdelt', 'there is no gender field anywhere in the schema'],
      ['gjennomgås manuelt', 'no manual free-text review exists; quote_candidates is an editor picking quotes'],
      // Five more, found in the FIX PASS by opening the capture and reading the
      // tip box — not by the sweep that produced the four above, whose pattern
      // did not include «egen rolle» or «HR-systemet».
      // A blunt substring check cannot read negation: my first replacement said
      // «er ikke en egen rolle i HeiTuva» and this line failed on it, correctly
      // by its own rule and wrongly about the sentence. Reworded rather than
      // exempted — a check that learns to ignore «ikke» would be one a future
      // false claim could hide behind.
      ['egen rolle i HeiTuva', 'D106: app.member_role has three values; verneombud signs, it is not an access level'],
      ['godkjenner spørsmålene', 'there is no approval step before a send'],
      ['under Integrasjoner', 'there is no Integrasjoner screen; hr_sync is a disabled flag'],
      ['HR-systemet, så sendes', 'hr_sync is off — nothing is triggered by a start date'],
      ['Startdato i HR-systemet', 'same'],
      ['Sluttdato i HR-systemet', 'same'],
      ['eskalering til innkjøpsansvarlig', 'reminders exist; escalation to a named person does not'],
    ]
    const uc = (noMessages as Record<string, Record<string, string>>).usecases!
    for (const [phrase, why] of banned) {
      const hits = Object.entries(uc).filter(([, v]) => v.includes(phrase)).map(([k]) => k)
      expect(hits, `«${phrase}» — ${why}`).toEqual([])
    }
  })
})
