import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  `live_sessions.step` — WHY THE WRITER WAS NOT BUILT, pinned so the reason
  expires loudly instead of quietly.

  The column is `text`, nullable, rendered by the live stage as the small
  uppercase label above the question (`LiveStage.tsx:209`, bundle V2:1841
  `{{ liveStage.step }}`). The demo seed sets it to **«Spørsmål 2 av 2»**.

  THAT VALUE DESCRIBES A PRODUCT THAT DOES NOT EXIST. The stage shows
  `barsQuestion`, and `page.tsx` computes it as `firstScale?.text ?? null` — the
  FIRST scale question, chosen on the server. There is no presenter control that
  moves between questions: the bundle's only stage buttons are reveal and
  back-to-build, and the code has no advance. A live session can never be on
  question 2 of 2, so nothing can honestly write that string.

  So «build the writer» and «no new screen beyond what the bundle draws» are in
  conflict here, and the conflict is the finding: **the writer cannot exist
  until the navigation it would record exists**, and that navigation is a
  feature nobody has drawn or decided. Inventing it would be exactly the
  restyling CLAUDE.md forbids, and writing a plausible label from the server on
  every render would be fabricating data in the UI.

  Recorded as DEVIATIONS D136. These assertions hold the premise: the day
  someone adds presenter navigation, the first test fails and points here, which
  is the moment the writer becomes buildable and `step` becomes honest.
*/
const PAGE = 'app/(app)/undersokelser/[id]/live/page.tsx'
const STAGE = 'app/(app)/undersokelser/[id]/live/LiveStage.tsx'
const ACTIONS = 'app/(app)/undersokelser/[id]/live/actions.ts'
const page = readFileSync(PAGE, 'utf8')
const stage = readFileSync(STAGE, 'utf8')
const actions = readFileSync(ACTIONS, 'utf8')

describe('live_sessions.step — the premise of not building its writer', () => {
  it('the stage shows the FIRST scale question, server-chosen, with no navigation', () => {
    expect(page).toMatch(/barsQuestion=\{firstScale\?\.text \?\? null\}/)
  })

  it('no presenter control changes which question is shown', () => {
    // If this fails, navigation arrived — and `step` can now be written from it.
    expect(stage).not.toMatch(/onAdvance|nextQuestion|setQuestionIndex|questionIndex/)
  })

  it('no server action writes step, and none pretends to', () => {
    expect(actions).not.toMatch(/\bstep\b\s*:/)
  })

  it('step is still rendered, so the column is read and not dead', () => {
    // The gap is «no writer», not «unused»: the label renders whenever set,
    // which is why a seeded value looks like a working feature in a demo.
    expect(stage).toMatch(/session\?\.step/)
  })

  it('the demo seed sets a value the product cannot reach', () => {
    const seed = readFileSync('scripts/seed-demo.ts', 'utf8')
    expect(seed).toMatch(/step:\s*'Spørsmål 2 av 2'/)
    // D102's shape, inverted: usually the seed reaches only states the code can
    // create. Here it reaches one the code CANNOT — a demo that shows a
    // reviewer a navigation feature that does not exist.
  })
})
