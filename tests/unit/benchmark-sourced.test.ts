import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isSourced } from '@/lib/benchmarks/sourced'

/**
 * Q134 — a benchmark nobody stands behind is not shown.
 *
 * The instance: seed.sql shipped invented industry figures whose own source
 * string said «erstatt med kildeført referanse», and the results screen
 * rendered both the bar and that sentence to the customer.
 */
describe('Q134 — an unsourced benchmark is refused', () => {
  it('refuses the exact string that shipped, and the shapes around it', () => {
    expect(isSourced('Seed — erstatt med kildeført referanse')).toBe(false)
    expect(isSourced('seed')).toBe(false)
    expect(isSourced('TBD')).toBe(false)
    expect(isSourced('placeholder value')).toBe(false)
    expect(isSourced('replace with a real source')).toBe(false)
    expect(isSourced('')).toBe(false)
    expect(isSourced(null)).toBe(false)
    expect(isSourced(undefined)).toBe(false)
  })

  it('accepts something an actual citation looks like', () => {
    expect(isSourced('SSB, Levekårsundersøkelsen 2025')).toBe(true)
    expect(isSourced('Arbeidstilsynet, Faktabok om arbeidsmiljø 2024, tabell 3.2')).toBe(true)
  })

  it('and the seed no longer ships numbers at all — the durable half', () => {
    /* The predicate can only refuse a source that DECLARES itself provisional;
       a confidently-worded invented citation passes it. So the half that
       actually holds is that no invented figure is shipped, asserted here
       against the file rather than against the running database, because the
       file is what every new deployment starts from. */
    const seed = readFileSync('supabase/seed.sql', 'utf8')
    expect(seed).not.toMatch(/insert\s+into\s+public\.benchmarks/i)
    expect(seed).toContain('Benchmarks: NONE ARE SEEDED')
  })
})
