import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  `live_sessions.step` IS GONE (`M:0098`, DEVIATIONS D136/D139), and these
  assertions keep it gone for the right reason.

  It labelled a position between questions — the seed said «Spørsmål 2 av 2» —
  that the product has no way to be in: the stage renders `barsQuestion`, which
  `page.tsx` computes as `firstScale?.text ?? null`, and no control anywhere
  moves between questions. Q61 refuses storing what can be derived; this was
  worse, storing something that does not exist. A derived value duplicated can
  at least disagree about something real.

  **The column returns WITH a writer if presenter navigation is ever built**, in
  the same migration, which is what the standing question asks and what this
  column never had. So the last test here is the trigger: it fails the day
  navigation arrives, and that failure is the reminder to bring `step` back
  properly rather than a defect.
*/
const PAGE = 'app/(app)/undersokelser/[id]/live/page.tsx'
const STAGE = 'app/(app)/undersokelser/[id]/live/LiveStage.tsx'
const ACTIONS = 'app/(app)/undersokelser/[id]/live/actions.ts'
const SEED = 'scripts/seed-demo.ts'
const page = readFileSync(PAGE, 'utf8')
const stage = readFileSync(STAGE, 'utf8')
const actions = readFileSync(ACTIONS, 'utf8')
const seed = readFileSync(SEED, 'utf8')

describe('live_sessions.step is dropped and stays dropped', () => {
  it('the page no longer selects it', () => {
    expect(page).not.toMatch(/select\([^)]*\bstep\b/)
  })

  it('the stage neither types nor renders it', () => {
    expect(stage).not.toMatch(/session\?\.step|step:\s*string/)
  })

  it('no live action writes it', () => {
    expect(actions).not.toMatch(/\bstep\b\s*:/)
  })

  it('THE SEED NO LONGER REACHES A STATE THE CODE CANNOT CREATE', () => {
    // D139's shape. A seeded value is indistinguishable from a working one on
    // screen, so a demo carrying «Spørsmål 2 av 2» showed a reviewer presenter
    // navigation that does not exist — worse than a seed that misses a state,
    // because a missing state looks like a gap and a fabricated one looks like
    // a feature.
    expect(seed).not.toMatch(/step:\s*'Spørsmål/)
  })

  it('the stage still shows the first scale question, server-chosen', () => {
    // The premise the drop rests on. If this changes, re-read D136 before
    // assuming the label can come back.
    expect(page).toMatch(/barsQuestion=\{firstScale\?\.text \?\? null\}/)
  })

  it('THE TRIGGER — no presenter navigation exists yet', () => {
    // Fails the day someone adds it. That is not a defect: it is the moment
    // `step` becomes buildable, and it comes back WITH its writer.
    expect(stage).not.toMatch(/onAdvance|nextQuestion|setQuestionIndex|questionIndex/)
  })
})
