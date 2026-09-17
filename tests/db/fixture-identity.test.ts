import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createOrg, dropOrg, findUserByEmail } from './factories'
import { PERSONAS } from './personas'
import { serviceClient, type Client } from './clients'

/**
 * V7-4 — A FIXTURE MAY NOT RENAME A SHARED AUTH USER.
 *
 * ── THE DEFECT THIS CLOSES, AND HOW IT PRESENTED ───────────────────────────
 *
 * `verify:visual` failed `veiviser-formal.png` by 1317 pixels. The whole
 * difference was the shell's avatar: «TB» in the committed baseline, «A» in the
 * run. Nothing in that phase touched the avatar, the shell, or the seed.
 *
 * The cause was a TEST. `findOrCreateUser` resolves by ADDRESS, so a fixture org
 * naming `PERSONAS.administrator.email` reuses the demo administrator's auth
 * user and their single `profiles` row — and `createOrg` upserted
 * `display_name: m.name ?? m.email` unconditionally. `tests/db/blocks.test.ts`
 * adds that persona as a member and gives no name, because the test is about
 * `send_round`'s authority and not about anybody's name. So it renamed the demo
 * administrator to `admin@nordiskstudio.test`, and `dropOrg` deletes the
 * organisation and leaves the profile — **the rename outlived the fixture.**
 *
 * ── WHY THIS IS D102'S CLASS FROM THE OTHER SIDE ───────────────────────────
 *
 * D102 and the four instances beside it are «who WRITES this column?», answered
 * «nothing does». This is the same question answered «a test does» — which is
 * worse in one specific way: the fixture write is invisible to every gate that
 * reads the column, because it happens in a suite that passed. The visual gate
 * then reported a defect in a screen nobody had changed, and a phase spent its
 * fix pass on a picture.
 *
 * ── WHAT IS ASSERTED, AND WHY THREE TESTS RATHER THAN ONE ──────────────────
 *
 * The property is not «blocks.test.ts should pass a name» — that closes one
 * caller and leaves the shape. It is that the factory's address fallback is for
 * CREATION only. So: a named member sets the name (1), an unnamed member leaves
 * an existing name alone (2), and an unnamed member with no profile at all still
 * gets one (3) — because the fix must not quietly remove the behaviour callers
 * without a persona rely on.
 */
const svc: Client = serviceClient()
const TAG = `fx-${randomUUID().slice(0, 8)}`
const ORG_NAMED = `Fixture navn ${TAG}`
const ORG_UNNAMED = `Fixture uten navn ${TAG}`
const ORG_FRESH = `Fixture ny bruker ${TAG}`
const FRESH = `fixture-${TAG}@example.test`

const nameOf = async (email: string) => {
  const userId = await findUserByEmail(svc, email)
  if (!userId) return null
  const { data } = await svc
    .from('profiles')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle()
  return data?.display_name ?? null
}

beforeAll(async () => {
  /* The precondition is SET rather than assumed, so the test does not depend on
     whether `seed:demo` ran in this session — and the value it sets is the
     seed's own, so running this suite is idempotent for the demo fixture. */
  const userId = await findUserByEmail(svc, PERSONAS.administrator.email)
  if (userId) {
    await svc
      .from('profiles')
      .upsert({ user_id: userId, display_name: PERSONAS.administrator.name, lang: 'no' })
  }
}, 60_000)

afterAll(async () => {
  for (const org of [ORG_NAMED, ORG_UNNAMED, ORG_FRESH]) await dropOrg(org, svc)
  const userId = await findUserByEmail(svc, PERSONAS.administrator.email)
  if (userId) {
    await svc
      .from('profiles')
      .upsert({ user_id: userId, display_name: PERSONAS.administrator.name, lang: 'no' })
  }
}, 60_000)

describe('V7-4 — createOrg and the shared profiles row', () => {
  it('1. a member the caller NAMES gets that name', async () => {
    await createOrg(ORG_NAMED, [
      { email: PERSONAS.administrator.email, role: 'administrator', name: 'Tuva Berg' },
    ])
    expect(await nameOf(PERSONAS.administrator.email)).toBe('Tuva Berg')
  }, 60_000)

  it('2. AN UNNAMED MEMBER LEAVES AN EXISTING PROFILE ALONE — the defect', async () => {
    /* This is the assertion that was false. Before the fix the address landed in
       `display_name`, the avatar read «A», and `verify:visual` failed on a
       screen the phase had not touched. */
    await createOrg(ORG_UNNAMED, [
      { email: PERSONAS.administrator.email, role: 'administrator' },
    ])
    expect(await nameOf(PERSONAS.administrator.email)).toBe(PERSONAS.administrator.name)
  }, 60_000)

  it('3. an unnamed member with NO profile still gets one — the fallback survives', async () => {
    /* The fix narrows the fallback to creation; it must not delete it. A caller
       that invents an address and never names it still needs a profiles row, or
       the locale resolution in `requireViewer` has nothing to read. */
    expect(await nameOf(FRESH)).toBeNull()
    await createOrg(ORG_FRESH, [{ email: FRESH, role: 'administrator' }])
    expect(await nameOf(FRESH)).toBe(FRESH)
  }, 60_000)
})
