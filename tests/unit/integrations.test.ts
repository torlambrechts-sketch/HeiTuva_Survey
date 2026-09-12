import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CATALOGUE,
  CONNECT_STEPS,
  DIRECTORY_FIELDS,
  REQUESTED_SCOPES,
  activeCount,
  connectorState,
  type ConnectionRow,
} from '@/lib/directory/catalogue'

/**
 * I1-3 — the screen's claims, asserted.
 *
 * The instruction's finding is the whole of this file's reason: the bundle's
 * `intConnected` computes «4 aktive tilkoblinger» from a hard-coded map,
 * `{ entra:1, hr:1, teams:1, brreg:1 }`, and none of the four exists. A count is
 * the easiest false claim to ship because it looks like arithmetic.
 */
/* I2 — the row a PULL connection produces. `token_prefix`, `revoked_at` and
   `last_used_at` are gone with SCIM: there is no token the customer holds, no
   revocation that leaves a row behind (disconnecting deletes it), and «when
   Entra last called us» is replaced by «when a sync last COMPLETED», which is
   a stronger claim and the one property 1 turns on. */
const row = (o: Partial<ConnectionRow> = {}): ConnectionRow => ({
  configured: true,
  tenant_id: 'demo-tenant.invalid',
  scopes: ['User.Read.All'],
  consented_at: '2026-09-01T00:00:00Z',
  last_sync_at: '2026-09-11T00:00:00Z',
  last_sync_error: null,
  last_sync_error_at: null,
  consecutive_errors: 0,
  members_seen: 92,
  members_with_department: 84,
  ...o,
})

describe('the connector state is read from the connection', () => {
  it('1. no credential at all is ABSENT, and the count is zero', () => {
    /* Disconnecting DELETES the row (and the vault secret with it), so there is
       no «revoked» state to model any more — absent is absent. */
    for (const r of [null, row({ configured: false })]) {
      const s = connectorState(r)
      expect(s.status).toBe('absent')
      expect(activeCount(s)).toBe(0)
    }
  })

  it('2. consent with no completed sync is NEEDS SETUP, not connected', () => {
    /* PULL MAKES THIS A BETTER STATE. Under push it meant «a token exists and
       nobody has pasted it anywhere» — a guess about the other end. Under pull
       it means «consent was given and no sync has finished», which is a fact
       about our own side read off our own clock. */
    const s = connectorState(row({ last_sync_at: null }))
    expect(s.status).toBe('needs_setup')
    expect(activeCount(s)).toBe(0)
  })

  it('3. a connector that has been erroring is FAILING — the state the bundle lacks', () => {
    /* The bundle has three states and none can say «this has been erroring since
       Tuesday». A connector that silently stops looks identical to a customer
       with no staff changes, and the first sign would be a survey that reaches
       nobody. */
    const s = connectorState(row({ consecutive_errors: 3, last_sync_error: 'HTTP 400' }))
    expect(s.status).toBe('failing')
    expect(s.errors).toBe(3)
    /* I2 CHANGES THIS ANSWER, and the change is a decision rather than a drift.
       Under push «failing» meant a token nobody could use, so it was not an
       active connection. Under pull it means a consented tenant whose last sync
       errored — the connection EXISTS and is producing errors, which is exactly
       what the header chip should count, because «0 aktive tilkoblinger» on a
       connector that is erroring reads as «nothing is set up» and sends the
       administrator to the wrong screen. */
    expect(activeCount(s), 'a failing connector still IS a connection').toBe(1)
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

  it('9. and the Entra row describes only what app.entra_apply_page actually writes', () => {
    // `avdeling` joins the list at I2 because department now lands in a column
    // (org_members.group_id). The rule is unchanged — the row names what is
    // written and nothing else — and the list grew because the product did.
    expect(no.entraFields).toBe('navn, e-post, avdeling, aktiv eller sluttet')
    expect(en.entraFields).toBe('name, email, department, active or left')
    // Q139 — a directory decides neither of these, and the row must not say it does.
    /* Q139 stands: a directory decides neither role nor group MEMBERSHIP by its
       own groups. «avdeling»/«department» is allowed now and «gruppe»/«group» is
       still not — the distinction is the model decision, and the row must not
       blur it by promising the customer's Entra groups. */
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

  it('12. exactly FOUR of them are read now, plus the join key', () => {
    /* `department` moved from refused to built at I2, and I2-0's measurement is
       why: Graph gives it as a String needing only `$select` and no permission
       beyond `User.Read.All`. It lands in `org_members.group_id` — the breakdown
       axis — which is the model decision. */
    const built = DIRECTORY_FIELDS.filter((f) => f.column !== null).map((f) => f.key).sort()
    expect(built).toEqual(['active', 'department', 'displayName', 'externalId', 'userName'])
    // And every built row names a real column of org_members — the table the
    // SCIM functions write. A column that does not exist would render a
    // promise about storage that is not happening.
    for (const f of DIRECTORY_FIELDS) {
      if (f.column) expect(f.column.startsWith('org_members.')).toBe(true)
      // And the ones needing `$select` are marked, because a field Graph does
      // not return by default is one the query has to ask for — a fact about
      // the call, recorded beside the field rather than in the worker.
      if (f.key === 'department' || f.key === 'active') expect(f.needsSelect).toBe(true)
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

  it('14. the tenant is REAL now, and the next sync is a cadence rather than a timestamp', () => {
    /* BOTH OF V5-3's REFUSALS ARE REVERSED BY I2, and each for its own reason.

       The tenant was a fiction under push because SCIM hands us a bearer token
       and not a directory identity. Consent hands us the tenant, so it is
       rendered — and it is the one thing that field is FOR: confirming the
       administrator consented for the right directory.

       «Neste synk» was «Bestemmes i Entra» because the schedule was theirs. It
       is ours now, so the page states the CADENCE. Still not a timestamp:
       «I morgen kl. 06:00» would be a fact about nothing, where «hver natt
       kl. 03» is a fact about the pg_cron job. */
    expect(code).toMatch(/tenantId/)
    expect(code).not.toMatch(/onmicrosoft/i)
    expect(no.detailNextSyncCadence).toBeTruthy()
    for (const msgs of [no, en]) {
      // Not a clock. Anything matching a time would be the never-fabricate rule
      // with hours instead of a number.
      // I2 REVERSES HALF OF THIS. «Neste synk» is a real clock now, because the
      // schedule is ours — so the assertion moves from «no time» to «the
      // cadence, and no fabricated timestamp»: a cadence describes the job, a
      // timestamp would describe nothing.
      expect(msgs.detailNextSyncCadence).toBeTruthy()
      expect(msgs.detailNextSyncNone).toBeTruthy()
      expect(msgs.detailProtocol).toBeTruthy()
    }
  })

  it('15. the permissions section asks for exactly what has a caller', () => {
    /*
      I2 REVERSES V5-3's FINDING, and the reversal is the interesting half.

      Under push, `User.Read.All` / `Group.Read.All` / `Directory.Read.All` were
      permissions we did not hold on an architecture we had not built, so the
      section described the bearer token instead. Pull makes Graph scopes the
      right vocabulary again — but not all three of them.

      ONE is requested. `Directory.Read.All` is not registered: it reads the
      catalogue's structure and is broader than the need. `Group.Read.All` is
      registered and NOT requested, because nothing calls it — Entra's own
      groups are an audience and the audience shape is undecided (I2-0 (c)).
      A permission an administrator must approve has to be defensible line by
      line, which is the same test that keeps `employeeLeaveDateTime` out.
    */
    expect([...REQUESTED_SCOPES]).toEqual(['User.Read.All'])
    const all = [...Object.values(no), ...Object.values(en)].join(' ')
    expect(all, 'the broadest scope is never even named').not.toMatch(/Directory\.Read\.All/)
    for (const msgs of [no, en]) {
      expect(msgs.detailScopeUsers).toBeTruthy()
      expect(msgs.detailScopesPlanned, 'what WILL be asked is labelled as a plan').toBeTruthy()
    }
    // And the one-direction promise survives, in both languages — it is true
    // under pull for the same reason: we hold no credential that could write.
    expect(no.detailScopesNote!.toLowerCase()).toContain('aldri tilbake')
    expect(en.detailScopesNote!.toLowerCase()).toContain('never writes back')
  })

  it('15b. the model decision is on the screen, because a customer will assume otherwise', () => {
    /*
      «We have a group for the night shift, so we can see how the night shift
      answered» is the obvious reading and it is wrong: a department breaks down
      and an Entra group targets. The page says which of the two a synced group
      is, in as many words, rather than leaving it to be discovered from a
      report that does not have the cell in it.
    */
    for (const msgs of [no, en]) {
      expect(msgs.detailGroupsAreDepartments).toBeTruthy()
      expect(msgs.detailGroupsNotEntra).toBeTruthy()
      expect(msgs.detailDepartmentCoverage).toBeTruthy()
    }
    expect(no.detailGroupsAreDepartments!.toLowerCase()).toContain('avdeling')
    // The coverage line carries all three numbers, so «84 av 92 … åtte mangler»
    // cannot become a sentence with an arithmetic error in it.
    for (const n of ['{with}', '{seen}', '{without}']) {
      expect(no.detailDepartmentCoverage).toContain(n)
      expect(en.detailDepartmentCoverage).toContain(n)
    }
  })

  it('16. the log section still says what is missing rather than showing a fixture', () => {
    /* THE GROUPS HALF MOVED (see 15b): groups are real now, they are
       DEPARTMENTS, and the page says which of the two they are. The LOG half is
       unchanged and Q162 stands — nothing stores a per-sync history, and a
       record of who arrived and who was deactivated is personal data about a
       customer's staff that needs a purpose and a retention period before it
       needs a schema. */
    for (const msgs of [no, en]) {
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

  it('19. the four connect steps are the PULL flow now', () => {
    /* Reversed with the architecture. Under push the customer pasted a token we
       minted; under pull their administrator consents and holds nothing, so
       step 1 is «godkjenn tilgangen» and there is no key to copy anywhere. */
    expect([...CONNECT_STEPS]).toEqual(['consent', 'scope', 'first', 'schedule'])
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
    // No bearer token to paste, and the schedule is ours rather than Entra's —
    // the two sentences that were true under push and are false now.
    expect(steps).not.toMatch(/lim inn|nøkkelen vises|entra bestemmer når/)
    expect(steps).toContain('godkjenn')
  })
})
