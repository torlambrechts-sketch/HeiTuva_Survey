import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CATALOGUE,
  CONNECT_STEPS,
  DIRECTORY_FIELDS,
  TOKEN_CAPABILITIES,
  activeCount,
  connectorState,
  type ConnectionRow,
} from '@/lib/scim/catalogue'

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
    /* RESTATED IN V5-3, and the restatement is the finding rather than a
       widening.

       The first form joined every `integrations.*` value and forbade five words
       outright. That was right while the namespace only DESCRIBED connectors.
       V5-3's detail page names two of those fields ON PURPOSE, in order to
       refuse them: `field_employeeLeaveDateTime` is «Sluttdato», and the row
       beside it says «Leses ikke. Et felt i katalogen beskriver en person; det
       avgjør ikke hva produktet gjør med henne.»

       So the property is not «the word never appears». It is **the word appears
       only where the page also says it is not read** — which is the honest
       version of what the test was always checking. The exemption is derived
       from `DIRECTORY_FIELDS`, not from a list of keys I typed: a field moved
       from refused to built loses its exemption automatically, and would then
       have to be true of the schema. */
    const refusedKeys = new Set(
      DIRECTORY_FIELDS.filter((f) => f.refusal !== null).map((f) => `field_${f.key}`),
    )
    // Non-vacuity: the exemption must actually cover something, or this test has
    // silently become the old one.
    expect(refusedKeys.size).toBeGreaterThan(0)

    const exempt = (k: string) => refusedKeys.has(k) || k.startsWith('detailRefusal_')
    const checked = [...Object.entries(no), ...Object.entries(en)]
      .filter(([k]) => !exempt(k))
      .map(([, v]) => v)
      .join(' ')
      .toLowerCase()

    /* `kjønn`/`gender` stay absolutely forbidden and are NOT exemptible: they
       belong to the bundle's `lonn` entry, which Q88 keeps out of the product
       entirely, and «Kjønnsdelt rapport etter ldl. § 26» is the claim V2-8's
       sweep already found false against the schema. */
    for (const forbidden of ['kjønn', 'gender', 'sluttdato', 'ledernivå', 'stillingsprosent']) {
      expect(checked, `«${forbidden}» describes a field that exists nowhere in the schema`)
        .not.toContain(forbidden)
    }

    // And the two that are exempt must genuinely carry the refusal beside them,
    // or the exemption is a hole rather than a rule.
    for (const msgs of [no, en]) {
      for (const f of DIRECTORY_FIELDS.filter((x) => x.refusal !== null)) {
        expect(msgs[`detailRefusal_${f.refusal}`], `a refusal must exist for ${f.key}`)
          .toBeTruthy()
      }
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

describe('V5-3 — the Entra detail page says only what a real connection can say', () => {
  const no = JSON.parse(readFileSync('messages/no.json', 'utf8')).integrations as Record<string, string>
  const en = JSON.parse(readFileSync('messages/en.json', 'utf8')).integrations as Record<string, string>
  const page = readFileSync('app/(app)/administrasjon/integrasjoner/entra/page.tsx', 'utf8')
  /** Comments stripped, for the reason `tests/unit/worklist-rows.test.ts` spells
   *  out: a file that documents its own refusals contains the words it refuses,
   *  so a grep over the file measures the prose and not the code. */
  const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('11. every one of the bundle\'s eight fields is accounted for, built or refused', () => {
    /* «Ingenting utover dette leses fra katalogen» (v5:3840) is the promise the
       page makes. It is only checkable if the list is COMPLETE — a row quietly
       dropped is the same defect as a row quietly implemented — so all eight of
       the bundle's attributes must be present, each with a column or a reason. */
    const drawn = [
      'displayName',
      'mail',
      'department',
      'jobTitle',
      'manager',
      'accountEnabled',
      'employeeHireDate',
      'employeeLeaveDateTime',
    ]
    // Two of the bundle's names are ours under the SCIM spelling: `mail` is
    // `userName`/`emails` and `accountEnabled` is `active`. Mapped explicitly
    // rather than matched loosely, so a missing row cannot pass as a rename.
    const alias: Record<string, string> = { mail: 'userName', accountEnabled: 'active' }
    const keys = new Set(DIRECTORY_FIELDS.map((f) => f.key))
    for (const d of drawn) {
      expect(keys.has(alias[d] ?? d), `v5 draws ${d} and the registry must answer for it`).toBe(true)
    }
  })

  it('12. exactly three of them are read, plus the join key', () => {
    const built = DIRECTORY_FIELDS.filter((f) => f.column !== null).map((f) => f.key).sort()
    expect(built).toEqual(['active', 'displayName', 'externalId', 'userName'])
    // And every built row names a real column of org_members — the table the
    // SCIM functions write. A column that does not exist would render a
    // promise about storage that is not happening.
    for (const f of DIRECTORY_FIELDS) {
      if (f.column) expect(f.column.startsWith('org_members.')).toBe(true)
      // The invariant that makes the page checkable: a column XOR a refusal.
      expect((f.column === null) !== (f.refusal === null)).toBe(true)
    }
  })

  it('13. manager, hire date and leaving date share ONE refusal, because it is one reason', () => {
    /* Tor's decision, verbatim: «Refuse all three with one reason, because it is
       one reason: a directory field DESCRIBES a person; it does not decide what
       the product does to her.» Asserted as identity of the refusal key, so
       three separate near-identical sentences cannot drift apart. */
    const three = ['manager', 'employeeHireDate', 'employeeLeaveDateTime']
    const refusals = new Set(
      DIRECTORY_FIELDS.filter((f) => three.includes(f.key)).map((f) => f.refusal),
    )
    expect(refusals.size).toBe(1)
    expect([...refusals][0]).toBe('not_a_trigger')
    for (const msgs of [no, en]) {
      expect(msgs.detailRefusal_not_a_trigger).toBeTruthy()
    }
    // The sentence says what the reason IS, in both languages.
    expect(no.detailRefusal_not_a_trigger!.toLowerCase()).toContain('beskriver en person')
    expect(en.detailRefusal_not_a_trigger!.toLowerCase()).toContain('describes a person')
  })

  it('14. NO TENANT AND NO NEXT-SYNC TIME ARE RENDERED', () => {
    /* The two fabrications in the header. v5:3826 renders
       `nordiskstudio.onmicrosoft.com` and v5:3833 renders «I morgen kl. 06:00».
       We store no tenant — SCIM hands us a bearer token, not a directory
       identity — and SCIM is PUSH, so the schedule lives in Entra. */
    expect(code).not.toMatch(/onmicrosoft|tenant/i)
    expect(no.detailNextSyncUnknown).toBe('Bestemmes i Entra')
    for (const msgs of [no, en]) {
      // Not a clock. Anything matching a time would be the never-fabricate rule
      // with hours instead of a number.
      expect(msgs.detailNextSyncUnknown).not.toMatch(/\d{1,2}[:.]\d{2}/)
      expect(msgs.detailProtocol).toBeTruthy()
    }
  })

  it('15. the permissions section describes THIS token, not Microsoft Graph scopes', () => {
    /* v5:3855 lists `User.Read.All`, `Group.Read.All` and
       `Directory.Read.All` — permissions for HeiTuva to READ Graph. Measured:
       there is no Graph client anywhere in the repository, so those are
       permissions we do not hold, on an architecture we did not build. */
    for (const c of TOKEN_CAPABILITIES) {
      for (const msgs of [no, en]) {
        expect(msgs[`detailCapKey_${c}`], `${c} needs a key label`).toBeTruthy()
        expect(msgs[`detailCapLabel_${c}`], `${c} needs a description`).toBeTruthy()
      }
    }
    const all = [...Object.values(no), ...Object.values(en)].join(' ')
    expect(all).not.toMatch(/User\.Read\.All|Group\.Read\.All|Directory\.Read\.All/)
    // And the one-direction promise survives, in both languages.
    expect(no.detailScopesNote!.toLowerCase()).toContain('aldri tilbake')
    expect(en.detailScopesNote!.toLowerCase()).toContain('never writes back')
  })

  it('16. the groups and log sections say what is missing rather than showing a fixture', () => {
    /* The endpoint declares ONE resource type — `User` — so no group ever
       arrives; and nothing stores a per-sync history, so «Synklogg» is the
       latest outcome. Both sections say so in their own words. */
    for (const msgs of [no, en]) {
      expect(msgs.detailGroupsNone).toBeTruthy()
      expect(msgs.detailLogNoHistory).toBeTruthy()
    }
    // The reason a log table is not built is the retention question, and it is
    // stated to the reader rather than left as an absence.
    expect(no.detailLogNoHistory!.toLowerCase()).toContain('lagringstid')
    expect(en.detailLogNoHistory!.toLowerCase()).toContain('retention period')
    // And the route's own source must not carry a hard-coded group or log row.
    expect(code).not.toMatch(/Produktteamet|4 nye, 1 deaktivert/)
  })

  it('17. `lonn` is not a route — Q88, confirmed out', () => {
    /* The second `intDetail` entry reads `gender` and `salaryBand`. Q88 decided
       sykefravær is not a product feature and lønn is the same class. Asserted
       as the absence of a route, because a page that exists is a feature
       whatever its content. */
    const routes = readFileSync('app/(app)/administrasjon/integrasjoner/entra/page.tsx', 'utf8')
    expect(routes).toBeTruthy()
    expect(() => readFileSync('app/(app)/administrasjon/integrasjoner/lonn/page.tsx', 'utf8'))
      .toThrow()
  })

  it('18. only the built connector links to a detail page', () => {
    /* A link from a row whose status is «Ikke tilgjengelig» would open a page
       describing a connection that cannot exist. The link is inside the `live`
       branch, and `built` is true for exactly one row. */
    const panel = readFileSync('app/(app)/administrasjon/IntegrationsPanel.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    expect(panel).toMatch(/integrasjoner\/entra/)
    expect(CATALOGUE.flatMap((g) => g.rows).filter((r) => r.built).map((r) => r.key))
      .toEqual(['entra'])
  })

  it('19. the four connect steps are the push flow, not the pull flow', () => {
    expect([...CONNECT_STEPS]).toEqual(['token', 'app', 'scope', 'start'])
    for (const s of CONNECT_STEPS) {
      for (const msgs of [no, en]) {
        expect(msgs[`detailStep_${s}`], `${s} needs a title`).toBeTruthy()
        expect(msgs[`detailStepDesc_${s}`], `${s} needs a description`).toBeTruthy()
      }
    }
    /* The bundle's step 2 is «Gi samtykke — administrator godkjenner de tre
       lesetillatelsene» and step 4 is «Kjør første synk». There is no consent
       screen and no run button: Entra starts provisioning and Entra decides
       when. */
    const steps = CONNECT_STEPS.map((s) => `${no[`detailStep_${s}`]} ${no[`detailStepDesc_${s}`]}`)
      .join(' ')
      .toLowerCase()
    expect(steps).not.toMatch(/samtykke|kjør første synk/)
    expect(steps).toContain('entra bestemmer')
  })
})
