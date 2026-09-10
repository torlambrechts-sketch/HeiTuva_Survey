import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  QUIZ IS REACHABLE BY A CUSTOMER — the assertions that keep it so.

  Quiz shipped in V2-10 as a complete feature: `M:0085`–`M:0088`, `run_mode`,
  the answer key, `quiz_leaderboard` k-gated by `M:0086`, `app.guard_quiz_policy`
  refusing both a non-named survey and a statutory pack, 26 green tests, quiz
  tiles on `/s/[token]`, the Lagtavle on Resultater, and `QuizPanel` for its two
  settings.

  **Every one of those surfaces is gated on `run_mode = 'quiz'`, and until this
  commit no user could set it.** `RunModePanel` typed `Mode` as
  `'standard' | 'live'`, drew the quiz card `locked: true`, and printed
  «Quiz er ikke bygget ennå» beneath it.

  That sentence was TRUE WHEN WRITTEN — the panel landed before V2-10 built the
  feature, and its own header comment still said «V2-10 builds it and nothing
  behind it exists yet». Nothing bound it to reality afterwards, so it went on
  telling customers something untrue about the product for a whole phase:
  **DEVIATIONS D135, in shipped user-facing copy rather than in a README.** The
  cost is larger there — a customer cannot re-derive it, and a locked card with
  a reason is the most convincing thing a screen can say.

  These tests do not assert that quiz WORKS; 26 tests already do that against
  the database. They assert it can be REACHED, which is the half nothing covered.
*/
const PANEL = 'app/(app)/undersokelser/[id]/bygg/RunModePanel.tsx'
const ACTIONS = 'app/(app)/undersokelser/[id]/bygg/actions.ts'
const SEED = 'scripts/seed-demo.ts'
/* Comments are stripped before asserting. These tests are about what the code
   DOES, and the entries below deliberately quote the old code in prose — an
   assertion that reads prose would pass or fail on how the change was
   explained, which is the same class of error as a gate red about the wrong
   thing (D139). */
const decomment = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const panel = decomment(readFileSync(PANEL, 'utf8'))
const actions = decomment(readFileSync(ACTIONS, 'utf8'))
const seed = readFileSync(SEED, 'utf8')
const no = JSON.parse(readFileSync('messages/no.json', 'utf8'))
const en = JSON.parse(readFileSync('messages/en.json', 'utf8'))

describe('the run-mode card', () => {
  it('quiz is a mode the panel can hold, not a third label', () => {
    expect(panel).toMatch(/type Mode = 'standard' \| 'live' \| 'quiz'/)
  })

  it('the quiz card is NOT locked', () => {
    const card = panel.match(/\{ key: 'quiz',[^}]*\}/)?.[0] ?? ''
    expect(card, 'quiz card not found').not.toBe('')
    expect(card).toMatch(/locked: false/)
  })

  it('«Quiz er ikke bygget ennå» is gone from both languages', () => {
    expect(Object.keys(no.builder)).not.toContain('runModeQuizNote')
    expect(Object.keys(en.builder)).not.toContain('runModeQuizNote')
  })

  it('and nothing renders that key any more', () => {
    expect(panel + actions).not.toMatch(/runModeQuizNote|quizNote/)
  })

  it('the note chip renders only a REAL refusal, never a standing sentence', () => {
    // `note` is set from a refused server action. A chip that always shows text
    // is a claim; a chip that shows text only when something was refused is a
    // message. The old code was `{note ?? s.quizNote}` — always a claim.
    expect(panel).not.toMatch(/note \?\? s\./)
  })

  it('setRunMode accepts quiz, so the card is not clicking into a rejection', () => {
    const enumLine = actions.match(/runMode: z\.enum\(\[[^\]]*\]\)/)?.[0] ?? ''
    expect(enumLine, 'runMode enum not found').not.toBe('')
    expect(enumLine).toContain("'quiz'")
  })
})

describe('the demo seed reaches the quiz state', () => {
  it('creates a survey in quiz mode', () => {
    expect(seed).toMatch(/run_mode:\s*'quiz'/)
  })

  it('and it is NAMED, because a quiz awards points to a person', () => {
    // app.guard_quiz_policy refuses a quiz on an anonymous survey, so a seed
    // that set run_mode without anonymity would fail the migration, loudly.
    const block = seed.slice(Math.max(0, seed.indexOf("run_mode: 'quiz'") - 900),
                             seed.indexOf("run_mode: 'quiz'") + 400)
    expect(block).toMatch(/anonymity:\s*'named'/)
  })

  it('the seeded quiz is NOT on a statutory pack', () => {
    // The second database guard: a duty under the law has no correct answers.
    const block = seed.slice(Math.max(0, seed.indexOf("run_mode: 'quiz'") - 900),
                             seed.indexOf("run_mode: 'quiz'") + 400)
    expect(block).not.toMatch(/Lovpålagt/)
  })
})
