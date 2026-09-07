import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, outsiderClient, serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * DECISIONS Q24 — the use-case catalogue is a registry, and every pack maps to
 * one. Q45 — the packs are seeded `category = 'Annet'` with `use_case` set, and
 * `template_packs.category`'s CHECK is NOT widened.
 *
 * WHERE THE CONSTRAINT LIVES. Three things, all in the migration:
 *   1. `use_cases` is a registry table, readable by any signed-in user and by
 *      `anon`, like `benchmarks` and `report_section_types`. Public BY DESIGN,
 *      with the reason recorded in the 5a3 allowlist — a use case has no org
 *      id, no survey id and no number.
 *   2. `template_packs.use_case` is a FOREIGN KEY to it, so a pack cannot name
 *      a use case that does not exist. Not an enum and not a CHECK: adding a
 *      use case must be a row (CLAUDE.md, data-not-code).
 *   3. `category` keeps its four values. Widening the CHECK would make one
 *      column carry both the internal classification and the customer-facing
 *      catalogue, and the moment those diverge one of them is silently wrong.
 *
 * THE ASSERTION THAT MATTERS is that the mapping is TOTAL over the seeded set —
 * every shipped pack has a use case — rather than a spot check on the ones I
 * happened to add. Standing question 3: assert the relation over the SET. A
 * pack with no use case draws a library card with no eyebrow, and the set of
 * packs grows with every seed.
 */
const made: string[] = []
let svc: Client
let admin: Client
let outsider: Client
let anon: Client
let orgId: string

beforeAll(async () => {
  svc = serviceClient()
  ;[admin, outsider] = await Promise.all([adminClient(), outsiderClient()])
  anon = anonClient()
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
})

/** Gate 5a2: do not become what else exists. Keyed by `key` rather than by id
 *  because a row this test tries to CREATE AND FAIL has no id to remember —
 *  the key is chosen before the insert and is therefore always known. */
afterAll(async () => {
  if (made.length) await svc.from('template_packs').delete().in('key', made)
})

describe('(Q24) the use-case registry', () => {
  it('POSITIVE CONTROL: a signed-in member reads all six', async () => {
    // First, because every "public by design" claim below is vacuous over a
    // table nobody can read.
    const { data, error } = await admin.from('use_cases').select('key, label, sort_order')
    expect(error).toBeNull()
    expect(data!.map((u) => u.key).sort()).toEqual(
      ['hr', 'intern', 'kunder', 'leverandor', 'medlem', 'offentlig'].sort(),
    )
  })

  it('is public by design — anon and another organisation read it too', async () => {
    // A registry with no org id is not a leak; the splash and the wizard both
    // need it before a session exists. Asserted rather than assumed, because
    // 5a3 will print it as `--` and an allowlist entry is a claim.
    for (const [who, c] of [
      ['anon', anon],
      ['outsider', outsider],
    ] as const) {
      const { data, error } = await c.from('use_cases').select('key')
      expect(error, `${who} reads the registry`).toBeNull()
      expect(data!.length, `${who} sees all six`).toBe(6)
    }
  })

  it('carries no organisation, survey or number — the allowlist claim, checked', async () => {
    // Named exactly, not matched loosely. The first version was
    // /org|survey|count|n$|threshold/i and it flagged `description`, because
    // that word ends in "n" — a check whose failure teaches nothing about the
    // property it is for. The claim is about IDENTIFIERS and NUMBERS, so the
    // test names them.
    const FORBIDDEN = ['org_id', 'organization_id', 'survey_id', 'user_id', 'k', 'n']
    const { data } = await svc.from('use_cases').select('*').limit(1)
    const cols = Object.keys(data![0]!)
    expect(cols.filter((c) => FORBIDDEN.includes(c) || /_count$|threshold/i.test(c)))
      .toEqual([])

    // And the positive control: the columns it DOES have are the six the
    // decision names, so a future column arrives here rather than silently
    // widening what a public registry carries.
    expect(cols.sort()).toEqual(
      ['description', 'key', 'label', 'preset_key', 'short', 'sort_order', 'tint'].sort(),
    )
  })

  it('every use case points at a SHIPPED preset that exists', async () => {
    // `preset_key` is a foreign key to `dashboard_presets` (V1-4), which is the
    // only dependency V1-5 has on V1-4. A dangling one would give a use-case
    // card a «Dashboard» button that loads nothing.
    const { data: uses } = await svc.from('use_cases').select('key, preset_key')
    const { data: presets } = await svc.from('dashboard_presets').select('key')
    const shipped = new Set(presets!.map((p) => p.key))
    for (const u of uses!) {
      expect(shipped, `use case "${u.key}" points at preset "${u.preset_key}"`)
        .toContain(u.preset_key)
    }
  })
})

describe('(Q45) packs carry a use case, and category keeps its meaning', () => {
  it('THE ONE THAT MATTERS: the mapping is TOTAL over every shipped pack', async () => {
    // Over the SET, not over the packs this phase added. A pack with no use
    // case draws a library card with no eyebrow, and the set grows with every
    // seed — so the assertion has to be about the set, not about a sample.
    const { data: packs } = await svc
      .from('template_packs')
      .select('key, use_case')
      .is('org_id', null)

    expect(packs!.length, 'or this assertion is vacuous').toBeGreaterThan(0)
    const unmapped = packs!.filter((p) => !p.use_case).map((p) => p.key)
    expect(unmapped, 'every shipped pack maps to a use case').toEqual([])
  })

  it('a pack cannot name a use case that does not exist', async () => {
    // A foreign key, not an enum and not a CHECK: adding a use case is a row.
    //
    // Standing question 1: before the column existed this passed because
    // PostgREST refused an unknown COLUMN, not an unknown VALUE — the same
    // shape as V1-4's RETURNING confound. The positive control below is what
    // separates them: a real use case must be accepted through the same call.
    // Tracked BEFORE the assertion, not after. When the FK is present this
    // insert fails and there is nothing to clean; when it is absent — which is
    // the mutation this test exists to catch — it SUCCEEDS and leaks a pack
    // with an unknown use case, which then fails the totality test on every
    // later run. Found exactly that way: four `probe-` rows survived a
    // mutation round and made the restored suite look broken.
    //
    // Gate 5a2's rule, one step earlier than usual: a test must clean up after
    // the outcome it is trying to PREVENT, not only after the one it expects.
    const badKey = `probe-${Date.now()}`
    made.push(badKey)
    const { error } = await svc.from('template_packs').insert({
      org_id: null,
      key: badKey,
      category: 'Annet',
      title: 'Probe',
      audience: 'Probe',
      questions: [],
      use_case: 'ikke-en-bruksomrade',
    } as never)
    expect(error, 'the FK refuses an unknown use case').not.toBeNull()

    const goodKey = `probe-ok-${Date.now()}`
    const { data: ok, error: okErr } = await svc
      .from('template_packs')
      .insert({
        org_id: null,
        key: goodKey,
        category: 'Annet',
        title: 'Probe',
        audience: 'Probe',
        questions: [],
        use_case: 'hr',
      } as never)
      .select('id')
    made.push(goodKey)
    expect(okErr, 'POSITIVE CONTROL: a real use case is accepted').toBeNull()
    void ok
  })

  it('the category CHECK is NOT widened — the four values stand', async () => {
    // Q45's whole point. If someone widens it later to hold use-case names,
    // this fails and they meet the decision rather than a green suite.
    const { data: packs } = await svc
      .from('template_packs')
      .select('category')
      .is('org_id', null)
    const categories = [...new Set(packs!.map((p) => p.category))].sort()
    for (const c of categories) {
      expect(['Annet', 'Ansatte', 'Kunder', 'Lovpålagt'], `category "${c}"`).toContain(c)
    }

    const { error } = await svc.from('template_packs').insert({
      org_id: null,
      key: `probe-cat-${Date.now()}`,
      category: 'Offentlig',
      title: 'Probe',
      audience: 'Probe',
      questions: [],
      use_case: 'offentlig',
    } as never)
    expect(error, 'a use-case name is not a category').not.toBeNull()
  })

  it('the five new packs are seeded, and every one is «Annet»', async () => {
    const NEW_PACKS = [
      'servicedesk-sak',
      'it-verktoy',
      'innbyggerundersokelse',
      'brukerundersokelse-tjeneste',
      'frivillige-arrangement',
    ]
    const { data: packs } = await svc
      .from('template_packs')
      .select('key, category, use_case')
      .is('org_id', null)
      .in('key', NEW_PACKS)

    expect(packs!.map((p) => p.key).sort(), 'all five are seeded').toEqual([...NEW_PACKS].sort())
    for (const p of packs!) {
      expect(p.category, `${p.key} is Annet`).toBe('Annet')
      expect(p.use_case, `${p.key} has a use case`).toBeTruthy()
    }
  })

  it('an organisation may not read another organisation\'s pack — unchanged by the column', async () => {
    // The regression guard: adding a column to a table with existing RLS is
    // exactly where a policy gets rewritten by accident.
    const { data: own } = await svc
      .from('template_packs')
      .insert({
        org_id: orgId,
        key: `egen-${Date.now()}`,
        category: 'Annet',
        title: 'Egen mal',
        audience: 'Egne',
        questions: [],
        use_case: 'hr',
      } as never)
      .select('id, key')
    made.push(own![0]!.key)

    const { data: theirs } = await outsider
      .from('template_packs')
      .select('id')
      .eq('id', own![0]!.id)
    expect(theirs, 'another organisation sees nothing of it').toEqual([])
  })
})
