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

    // DECISIONS Q91 moved the floor from 3 to 2. The boundary moves with it, and
    // this pair is why the tests were written from BOTH ends in the first place:
    // a one-sided test would still be green and would now be testing nothing.
    it('1 is refused — 1 is not a threshold, it is publication', async () => {
      const a = await adminClient()
      const { error } = await a.from('organizations').update({ default_k_threshold: 1 }).eq('id', orgId)
      expect(error, 'the floor is the CHECK, and no flag opens it').not.toBeNull()
      expect(await read(orgId)).toBe(original)
    })

    it('2 is accepted — the floor itself, since Q91', async () => {
      const a = await adminClient()
      const { error } = await a.from('organizations').update({ default_k_threshold: 2 }).eq('id', orgId)
      expect(error).toBeNull()
      expect(await read(orgId)).toBe(2)
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

/**
 * DECISIONS Q90 — the organisation default is a FLOOR, not merely a seed.
 *
 * The derivation, because it is the reason this exists rather than a
 * preference: `privacy.redaktor_may_lower` has been in the schema since M:0034
 * and is MEANINGLESS WITHOUT A FLOOR TO LOWER BENEATH. The global floor is a
 * CHECK at 3, and a CHECK cannot be granted or withheld by permission — so
 * "lower" had no referent unless the organisation's value binds.
 *
 * These test the flag in BOTH directions, which is the point: off, the floor
 * holds against everyone including an administrator; on, it opens.
 */
describe('Q90 — the organisation default binds, and the flag is its only exception', () => {
  let svc: Client
  let orgId: string
  let surveyId: string
  let originalK = 5
  let originalPrivacy: Record<string, boolean> = {}

  const setFlag = async (on: boolean) => {
    await svc
      .from('organizations')
      .update({ privacy: { ...originalPrivacy, redaktor_may_lower: on } })
      .eq('id', orgId)
  }
  const surveyK = async () => {
    const { data } = await svc.from('surveys').select('k_threshold').eq('id', surveyId).single()
    return data!.k_threshold
  }

  beforeAll(async () => {
    svc = serviceClient()
    const { data: org } = await svc
      .from('organizations')
      .select('id, default_k_threshold, privacy')
      .eq('name', ORG_PRIMARY)
      .single()
    orgId = org!.id
    originalK = org!.default_k_threshold
    originalPrivacy = (org!.privacy as Record<string, boolean> | null) ?? {}

    // The organisation's floor is 8; the survey starts there. Not policy_locked,
    // because a locked survey is refused by an EARLIER rule and the test would
    // then prove that rule instead of this one — standing question 1.
    await svc.from('organizations').update({ default_k_threshold: 8 }).eq('id', orgId)
    const { data: s } = await svc
      .from('surveys')
      .insert({ org_id: orgId, title: `Q90 floor ${Date.now()}`, status: 'utkast', anonymity: 'anonymous', respondent_kind: 'person', k_threshold: 8 })
      .select('id')
      .single()
    surveyId = s!.id
  })

  afterAll(async () => {
    await svc.from('surveys').delete().eq('id', surveyId)
    await svc.from('organizations').update({ default_k_threshold: originalK, privacy: originalPrivacy }).eq('id', orgId)
  })

  it('with the flag OFF, an ADMINISTRATOR cannot go below the organisation floor', async () => {
    await setFlag(false)
    const a = await adminClient()
    const { error } = await a.from('surveys').update({ k_threshold: 5 }).eq('id', surveyId)
    expect(error, 'the floor binds the administrator too — a setting one person can undercut is not a setting').not.toBeNull()
    expect(error!.message).toMatch(/below_org_floor/)
    expect(await surveyK()).toBe(8)
  })

  it('with the flag OFF, raising ABOVE the floor is still allowed', async () => {
    await setFlag(false)
    const a = await adminClient()
    const { error } = await a.from('surveys').update({ k_threshold: 10 }).eq('id', surveyId)
    expect(error, 'a floor constrains downwards only').toBeNull()
    expect(await surveyK()).toBe(10)
    await svc.from('surveys').update({ k_threshold: 8 }).eq('id', surveyId)
  })

  it('with the flag ON, the same administrator CAN go below it — the flag is the exception', async () => {
    await setFlag(true)
    const a = await adminClient()
    const { error } = await a.from('surveys').update({ k_threshold: 5 }).eq('id', surveyId)
    expect(error).toBeNull()
    expect(await surveyK()).toBe(5)
    await svc.from('surveys').update({ k_threshold: 8 }).eq('id', surveyId)
  })

  it('the flag does not open the CHECK floor — a permission cannot grant past a constraint', async () => {
    await setFlag(true)
    const a = await adminClient()
    const { error } = await a.from('surveys').update({ k_threshold: 1 }).eq('id', surveyId)
    expect(error, 'Q91 floor 2 is a CHECK and no flag reaches it').not.toBeNull()
    expect(await surveyK()).toBe(8)
  })

  it('with the flag ON, 2 IS reachable — Q91’s new floor, per survey', async () => {
    await setFlag(true)
    const a = await adminClient()
    const { error } = await a.from('surveys').update({ k_threshold: 2 }).eq('id', surveyId)
    expect(error).toBeNull()
    expect(await surveyK()).toBe(2)
    await svc.from('surveys').update({ k_threshold: 8 }).eq('id', surveyId)
  })

  it('a statutory pack lands on the STRICTER of pack and organisation (Q58 greatest)', async () => {
    // trakassering-ytringsklima carries 8; this organisation's floor is 10 here.
    await svc.from('organizations').update({ default_k_threshold: 10 }).eq('id', orgId)
    const { data: s } = await svc
      .from('surveys')
      .insert({ org_id: orgId, title: `Q58 greatest ${Date.now()}`, status: 'utkast', template_pack_key: 'trakassering-ytringsklima' })
      .select('id, k_threshold, anonymity, policy_locked')
      .single()
    expect(s!.k_threshold, 'greatest(pack 8, org 10) — the pack floor must not LOWER the organisation').toBe(10)
    expect(s!.anonymity, 'Q58: the pack locks anonymity, deliberately').toBe('anonymous')
    expect(s!.policy_locked).toBe(true)
    await svc.from('surveys').delete().eq('id', s!.id)
    await svc.from('organizations').update({ default_k_threshold: 8 }).eq('id', orgId)
  })

  it('an organisation survey is untouched by the floor — k_for is 0 there by design', async () => {
    const { data: s } = await svc
      .from('surveys')
      .insert({ org_id: orgId, title: `Q90 org ${Date.now()}`, status: 'utkast', anonymity: 'named', respondent_kind: 'organisation', k_threshold: 0 })
      .select('id, k_threshold')
      .single()
    expect(s!.k_threshold, 'the floor is person-only; gating an attributed survey is the opposite of Q17').toBe(0)
    await svc.from('surveys').delete().eq('id', s!.id)
  })
})

/**
 * DECISIONS Q91 — 2 is reachable, and STATUTORY LOCKS ARE UNTOUCHED BY IT.
 *
 * This is the pair that matters. A floor moving down is only safe if the
 * surfaces that must never move are proven not to have moved, and "the lock
 * still works" is exactly the claim a phase is most tempted to assert rather
 * than measure. So: refused on a statutory-pack survey, WITH a positive control
 * on a non-statutory one so the refusal cannot be an accident of the fixture.
 */
describe('Q91 — 2 is reachable, except where a statutory pack locks the policy', () => {
  let svc: Client
  let orgId: string
  let originalK = 5
  let originalPrivacy: Record<string, boolean> = {}

  beforeAll(async () => {
    svc = serviceClient()
    const { data: org } = await svc
      .from('organizations')
      .select('id, default_k_threshold, privacy')
      .eq('name', ORG_PRIMARY)
      .single()
    orgId = org!.id
    originalK = org!.default_k_threshold
    originalPrivacy = (org!.privacy as Record<string, boolean> | null) ?? {}
    // The organisation permits going under its own default, so the ONLY thing
    // that can refuse below is the statutory lock — standing question 1.
    await svc
      .from('organizations')
      .update({ default_k_threshold: 5, privacy: { ...originalPrivacy, redaktor_may_lower: true } })
      .eq('id', orgId)
  })

  afterAll(async () => {
    await svc
      .from('organizations')
      .update({ default_k_threshold: originalK, privacy: originalPrivacy })
      .eq('id', orgId)
  })

  it('an administrator CANNOT set 2 on a statutory-pack survey', async () => {
    const { data: s } = await svc
      .from('surveys')
      .insert({ org_id: orgId, title: `Q91 statutory ${Date.now()}`, status: 'utkast', template_pack_key: 'psykososial-kartlegging' })
      .select('id, k_threshold, policy_locked')
      .single()
    expect(s!.policy_locked, 'fixture precondition: the pack locked it').toBe(true)

    const a = await adminClient()
    const { error } = await a.from('surveys').update({ k_threshold: 2 }).eq('id', s!.id)
    expect(error, 'the law sets this survey’s policy; no role and no flag reaches it').not.toBeNull()
    expect(error!.message).toMatch(/policy_locked/)

    const { data: after } = await svc.from('surveys').select('k_threshold').eq('id', s!.id).single()
    expect(after!.k_threshold).toBe(s!.k_threshold)
    await svc.from('surveys').delete().eq('id', s!.id)
  })

  it('the positive control: 2 IS accepted on a non-statutory survey in the same organisation', async () => {
    const { data: s } = await svc
      .from('surveys')
      .insert({ org_id: orgId, title: `Q91 ordinary ${Date.now()}`, status: 'utkast', anonymity: 'anonymous', respondent_kind: 'person', k_threshold: 5 })
      .select('id')
      .single()
    const a = await adminClient()
    const { error } = await a.from('surveys').update({ k_threshold: 2 }).eq('id', s!.id)
    expect(error, 'without this the refusal above could be an accident of the fixture').toBeNull()
    const { data: after } = await svc.from('surveys').select('k_threshold').eq('id', s!.id).single()
    expect(after!.k_threshold).toBe(2)
    await svc.from('surveys').delete().eq('id', s!.id)
  })

  it('1 is refused on the ordinary survey too — the CHECK is the last word', async () => {
    const { data: s } = await svc
      .from('surveys')
      .insert({ org_id: orgId, title: `Q91 one ${Date.now()}`, status: 'utkast', anonymity: 'anonymous', respondent_kind: 'person', k_threshold: 5 })
      .select('id')
      .single()
    const a = await adminClient()
    const { error } = await a.from('surveys').update({ k_threshold: 1 }).eq('id', s!.id)
    expect(error).not.toBeNull()
    await svc.from('surveys').delete().eq('id', s!.id)
  })
})
