import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, leserClient, redaktorClient, serviceClient, type Client } from './clients'
import { ORG_OTHER, ORG_PRIMARY } from './personas'

/**
 * DECISIONS Q57 — `organizations.default_k_threshold` gets its FIRST WRITER.
 *
 * The column has existed since M:0034 and been DISPLAYED since Phase 9
 * (`PrivacyPanel.tsx`), but nothing has ever written it: D87 recorded that the
 * server action was deliberately left unwritten because an action with no
 * caller is a lie in the codebase. V2-1 gives it one, which means the 3–10
 * CHECK (`M:0034:19-20`) is exercised from the application side for the first
 * time — so it is tested in Q36's shape: the boundary from BOTH sides, not one.
 *
 * ── WHICH LAYER EACH TEST PROVES ────────────────────────────────────────────
 *
 * Standing question 1: what ELSE could refuse this before the check under test?
 * Here the answer is "quite a lot", and getting it wrong is the V1-1 defect
 * exactly — a guard test that ran as a role RLS had already filtered, and would
 * have passed with the guard deleted.
 *
 * `org_upd` (M:0008:8) is `app.has_role(id, administrator)`. So:
 *
 *   - The CHECK tests run as ADMINISTRATOR. RLS lets the statement through, so
 *     a rejection can only be the constraint. Anything less and we would be
 *     proving RLS twice and the CHECK never.
 *
 *   - The ROLE tests run as redaktør and leser, and RLS FILTERS rather than
 *     errors: PostgREST returns no error and zero rows. That is the "empty
 *     result is not a denial" case Gate 2b names, so these assert THE VALUE DID
 *     NOT MOVE rather than that an error came back. A test asserting `error !==
 *     null` here would fail for the right reason today and pass for the wrong
 *     one the moment anybody adds a returning clause.
 */
describe('Q57 — the organisation default threshold has a writer, and it is bounded', () => {
  let svc: Client
  let orgId: string
  let otherOrgId: string
  let original = 5

  const read = async (id: string) => {
    const { data } = await svc.from('organizations').select('default_k_threshold').eq('id', id).single()
    return data!.default_k_threshold
  }

  beforeAll(async () => {
    svc = serviceClient()
    const { data: orgs } = await svc.from('organizations').select('id, name, default_k_threshold')
    orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
    otherOrgId = orgs!.find((o) => o.name === ORG_OTHER)!.id
    original = orgs!.find((o) => o.name === ORG_PRIMARY)!.default_k_threshold
  })

  // Standing question 4: what does this leave behind when it fails to fail? A
  // threshold left at 10 silently changes what every other suite's fixtures are
  // gated at, and nothing would error.
  afterAll(async () => {
    await svc.from('organizations').update({ default_k_threshold: original }).eq('id', orgId)
  })

  describe('the CHECK, from both sides, as an administrator so only the constraint can refuse', () => {
    it('11 is refused — above Q36’s ceiling', async () => {
      const a = await adminClient()
      const { error } = await a.from('organizations').update({ default_k_threshold: 11 }).eq('id', orgId)
      expect(error, 'the database must refuse 11, not the form').not.toBeNull()
      expect(await read(orgId), 'and the stored value must not have moved').toBe(original)
    })

    it('10 is accepted — the ceiling itself', async () => {
      const a = await adminClient()
      const { error } = await a.from('organizations').update({ default_k_threshold: 10 }).eq('id', orgId)
      expect(error).toBeNull()
      expect(await read(orgId)).toBe(10)
      await svc.from('organizations').update({ default_k_threshold: original }).eq('id', orgId)
    })

    it('2 is refused — below Q17’s floor for natural persons', async () => {
      const a = await adminClient()
      const { error } = await a.from('organizations').update({ default_k_threshold: 2 }).eq('id', orgId)
      expect(error, 'the floor is the CHECK, and no flag opens it').not.toBeNull()
      expect(await read(orgId)).toBe(original)
    })

    it('3 is accepted — the floor itself', async () => {
      const a = await adminClient()
      const { error } = await a.from('organizations').update({ default_k_threshold: 3 }).eq('id', orgId)
      expect(error).toBeNull()
      expect(await read(orgId)).toBe(3)
      await svc.from('organizations').update({ default_k_threshold: original }).eq('id', orgId)
    })
  })

  describe('the role, where RLS filters rather than errors', () => {
    it('a redaktør cannot move it — and the proof is that the value did not move', async () => {
      const r = await redaktorClient()
      const { error } = await r.from('organizations').update({ default_k_threshold: 8 }).eq('id', orgId)
      // Not asserting on `error`: RLS filters an UPDATE, so PostgREST returns
      // no error and no rows. The value is the only honest evidence.
      expect(error).toBeNull()
      expect(await read(orgId), 'a redaktør must not be able to set the organisation default').toBe(original)
    })

    it('a leser cannot move it', async () => {
      const l = await leserClient()
      await l.from('organizations').update({ default_k_threshold: 8 }).eq('id', orgId)
      expect(await read(orgId)).toBe(original)
    })

    it('an administrator of another organisation cannot move it', async () => {
      const a = await adminClient()
      const before = await read(otherOrgId)
      await a.from('organizations').update({ default_k_threshold: 9 }).eq('id', otherOrgId)
      expect(await read(otherOrgId), 'cross-org isolation, on the same column').toBe(before)
    })
  })

  it('the positive control: an administrator of THIS organisation can, so the denials mean something', async () => {
    const a = await adminClient()
    const { error } = await a.from('organizations').update({ default_k_threshold: 8 }).eq('id', orgId)
    expect(error).toBeNull()
    expect(await read(orgId)).toBe(8)
    await svc.from('organizations').update({ default_k_threshold: original }).eq('id', orgId)
  })
})
