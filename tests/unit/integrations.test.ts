import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOGUE, activeCount, connectorState, type ConnectionRow } from '@/lib/scim/catalogue'

/**
 * I1-3 — the screen's claims, asserted.
 *
 * The instruction's finding is the whole of this file's reason: the bundle's
 * `intConnected` computes «4 aktive tilkoblinger» from a hard-coded map,
 * `{ entra:1, hr:1, teams:1, brreg:1 }`, and none of the four exists. A count is
 * the easiest false claim to ship because it looks like arithmetic.
 */
const row = (o: Partial<ConnectionRow> = {}): ConnectionRow => ({
  configured: true,
  token_prefix: 'deadbeef1234',
  created_at: '2026-09-01T00:00:00Z',
  revoked_at: null,
  last_used_at: '2026-09-11T00:00:00Z',
  last_error: null,
  last_error_at: null,
  consecutive_errors: 0,
  ...o,
})

describe('the connector state is read from the connection', () => {
  it('1. no credential at all is ABSENT, and the count is zero', () => {
    for (const r of [null, row({ configured: false }), row({ revoked_at: '2026-09-12T00:00:00Z' })]) {
      const s = connectorState(r)
      expect(s.status).toBe('absent')
      expect(activeCount(s)).toBe(0)
    }
  })

  it('2. a token nobody has used yet is NEEDS SETUP, not connected', () => {
    /* «Tilkoblet» on a token the customer has pasted nowhere would be a claim
       about the OTHER end of a connection this product has never heard from —
       which is the bundle's mistake in miniature. */
    const s = connectorState(row({ last_used_at: null }))
    expect(s.status).toBe('needs_setup')
    expect(activeCount(s)).toBe(0)
  })

  it('3. a connector that has been erroring is FAILING — the state the bundle lacks', () => {
    /* The bundle has three states and none can say «this has been erroring since
       Tuesday». A connector that silently stops looks identical to a customer
       with no staff changes, and the first sign would be a survey that reaches
       nobody. */
    const s = connectorState(row({ consecutive_errors: 3, last_error: 'HTTP 400' }))
    expect(s.status).toBe('failing')
    expect(s.errors).toBe(3)
    expect(activeCount(s), 'and a failing connector is not an active connection').toBe(0)
  })

  it('4. a used, unrevoked, error-free credential is the ONE connected state', () => {
    const s = connectorState(row())
    expect(s.status).toBe('connected')
    expect(activeCount(s)).toBe(1)
  })

  it('5. the count can never exceed the number of connectors actually built', () => {
    const built = CATALOGUE.flatMap((g) => g.rows).filter((r) => r.built)
    expect(built.map((r) => r.key), 'exactly one connector is built').toEqual(['entra'])
    expect(activeCount(connectorState(row())), 'so the ceiling is one, not four')
      .toBeLessThanOrEqual(built.length)
  })
})

describe('the catalogue makes no claim the product cannot keep', () => {
  /* The copy moved into next-intl when `verify:i18n` caught the first version
     rendering Norwegian on the English page — so these assertions are now over
     the SHIPPED STRINGS rather than over a registry, which is strictly stronger:
     they test what a customer reads. */
  const no = JSON.parse(readFileSync('messages/no.json', 'utf8')).integrations as Record<string, string>
  const en = JSON.parse(readFileSync('messages/en.json', 'utf8')).integrations as Record<string, string>

  it('6. thirteen of the fourteen are marked unbuilt, and none is pre-connected', () => {
    const rows = CATALOGUE.flatMap((g) => g.rows)
    expect(rows).toHaveLength(14)
    expect(rows.filter((r) => r.built)).toHaveLength(1)
  })

  it('7. every connector and group resolves a name, a description and a «Henter» line, in BOTH languages', () => {
    /* The panel builds keys from the registry key (`entra` + `Name`). That is
       right for a fifteenth connector and wrong if nobody checks it resolves, so
       the concatenation is spelled out here: a missing key renders as a RAW KEY
       on a customer's screen, which is the defect Tor found nine of behind
       seventeen green gates. */
    for (const g of CATALOGUE) {
      const gk = `group${g.key.charAt(0).toUpperCase()}${g.key.slice(1)}`
      for (const [loc, msgs] of [['no', no], ['en', en]] as const) {
        expect(msgs[gk], `${loc}: integrations.${gk}`).toBeTruthy()
      }
      for (const r of g.rows) {
        for (const suffix of ['Name', 'Desc', 'Fields']) {
          for (const [loc, msgs] of [['no', no], ['en', en]] as const) {
            expect(msgs[`${r.key}${suffix}`], `${loc}: integrations.${r.key}${suffix}`).toBeTruthy()
          }
        }
        const lk = `level${r.level.charAt(0).toUpperCase()}${r.level.slice(1)}`
        expect(no[lk], `no: integrations.${lk}`).toBeTruthy()
        expect(en[lk], `en: integrations.${lk}`).toBeTruthy()
      }
    }
  })

  it('8. no shipped line promises a field this schema does not have', () => {
    /* The v4 bundle's rows promised «kjønn» for the HR connector and «sluttdato»
       and «ledernivå» for Entra. There is no gender column anywhere in this
       schema — the same false promise CLAUDE.md records «Kjønnsdelt rapport»
       making on a public page — there is no end-date column, and Q139 decided a
       directory writes neither role nor group. Restoring the bundle's wording
       fails here rather than shipping. */
    const all = [...Object.values(no), ...Object.values(en)].join(' ').toLowerCase()
    for (const forbidden of ['kjønn', 'gender', 'sluttdato', 'ledernivå', 'stillingsprosent']) {
      expect(all, `«${forbidden}» describes a field that exists nowhere in the schema`)
        .not.toContain(forbidden)
    }
  })

  it('9. and the Entra row describes only what scim_upsert_member actually writes', () => {
    expect(no.entraFields).toBe('navn, e-post, aktiv eller sluttet')
    expect(en.entraFields).toBe('name, email, active or left')
    // Q139 — a directory decides neither of these, and the row must not say it does.
    for (const v of [no.entraFields!, en.entraFields!, no.entraDesc!, en.entraDesc!]) {
      expect(v.toLowerCase()).not.toMatch(/gruppe|rolle|stilling|\bgroup\b|\brole\b/)
    }
  })

  it('10. and the data-flow note promises nothing about data we never receive', () => {
    /* The bundle's note said «Lønn hentes aggregert per stillingsgruppe, aldri
       per person» — a reassurance about salary data this product does not touch
       at all. A promise about data you never receive is not a reassurance, it is
       a claim that you receive it. */
    for (const v of [no.dataFlowNote!, en.dataFlowNote!]) {
      expect(v.toLowerCase()).not.toMatch(/lønn|salary|\bpay\b/)
    }
    // And the half that IS true stays, or the note has been emptied rather than corrected.
    expect(no.dataFlowNote!.toLowerCase()).toContain('anonyme')
    expect(en.dataFlowNote!.toLowerCase()).toContain('anonymous')
  })
})
