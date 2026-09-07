import { beforeAll, describe, expect, it } from 'vitest'
import { serviceClient, type Client } from './clients'

/**
 * DECISIONS Q35 — the roles are data, so the data is what gets asserted.
 *
 * The unit tests prove the classifier reads `role` and nothing else. This
 * proves the row it reads actually says so, which is a different failure: the
 * Åpenhetsloven pack is written in TWO places — `supabase/seed.sql` for a fresh
 * reset, and migration 0040 for a database whose packs predate it — and a
 * migration cannot reach rows a later-running seed inserts. So the two can
 * disagree, and the symptom would be a register that has columns on a developer
 * machine and none in production, or the reverse.
 */
let svc: Client
let questions: { text: string; type: string; role?: string; short?: string }[]

beforeAll(async () => {
  svc = serviceClient()
  const { data, error } = await svc
    .from('template_packs')
    .select('questions')
    .is('org_id', null)
    .eq('key', 'leverandor-apenhetsloven')
    .single()
  if (error) throw new Error(`the Åpenhetsloven pack is missing: ${error.message}`)
  questions = data!.questions as typeof questions
})

describe('(Q35) the Åpenhetsloven pack designates its own key questions', () => {
  it('names exactly the four the register draws as columns', () => {
    const roled = questions.filter((q) => q.role)
    expect(roled.map((q) => q.short)).toEqual([
      'Policy',
      'Egen vurdering',
      'Brudd/risiko',
      'Varslingskanal',
    ])
  })

  it('has one breach question and one policy question — the two the filters need', () => {
    // «Har avdekket brudd» and «Mangler policy» each select on exactly one
    // question. Two `brudd` questions would make the filter ambiguous, and zero
    // would make it dead; both are silent failures in the UI.
    expect(questions.filter((q) => q.role === 'brudd')).toHaveLength(1)
    expect(questions.filter((q) => q.role === 'policy')).toHaveLength(1)
  })

  it('uses no role outside the closed set', () => {
    const roles = new Set(questions.map((q) => q.role).filter(Boolean))
    expect([...roles].sort()).toEqual(['brudd', 'key', 'policy'])
  })

  it('leaves the free text and the choice unroled — a role on everything means nothing', () => {
    expect(questions.find((q) => q.type === 'text')?.role).toBeUndefined()
    expect(questions.find((q) => q.type === 'choice')?.role).toBeUndefined()
  })

  it('no OTHER seeded pack carries a role it has no register to render in', async () => {
    // A role on a person survey's question would classify nothing — there is no
    // attributed register to put a column in — so its presence would mean
    // someone copied a pack row without reading it.
    const { data } = await svc
      .from('template_packs')
      .select('key, questions, policy')
      .is('org_id', null)
    const stray = (data ?? []).filter((p) => {
      const qs = (p.questions ?? []) as { role?: string }[]
      const attributed = (p.policy as { respondent_kind?: string } | null)?.respondent_kind === 'organisation'
      return !attributed && qs.some((q) => q.role)
    })
    expect(stray.map((p) => p.key)).toEqual([])
  })
})
