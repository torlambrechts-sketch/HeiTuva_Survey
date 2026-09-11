import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  KJØREMODUS SAYS WHAT WILL HAPPEN, NOT WHAT IS FORBIDDEN.

  The note under the cards used to be `builder.quizGuard`:

    «Quiz krever navngitte svar for å kunne gi poeng, og kan ikke brukes på
     lovpålagte maler. Begge deler avvises av databasen, ikke bare av skjermen.»

  Two restrictions in one sentence, handed to an editor who had asked for
  neither — and a third clause written for the people who built it. `QuizPanel`
  rendered the same sentence UNCONDITIONALLY, which is the sharpest version:
  by the time that panel is on screen the survey is provably named and provably
  not on a statutory pack, so the text described two conditions that could not
  fail.

  What changed, and what deliberately did not:

  - `app.guard_quiz_policy` is UNTOUCHED. Both clauses still refuse in the
    database, because a score is a fact about a person and a statutory
    kartlegging has no correct answers.
  - The UI stops reporting the first clause as an obstacle and CARRIES IT OUT:
    picking Quiz moves the survey to `named` in the same statement, so the
    trigger sees a finished row and never fires. A guard that stops firing
    because the screen does its job is what a guard should look like.
  - The pack lock stays a refusal. It has no next step but «use another survey»,
    and pretending otherwise would be worse than saying so.
*/
const PANEL = 'app/(app)/undersokelser/[id]/bygg/RunModePanel.tsx'
const QUIZ = 'app/(app)/undersokelser/[id]/bygg/QuizPanel.tsx'
const ACTIONS = 'app/(app)/undersokelser/[id]/bygg/actions.ts'

const decomment = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

const panel = decomment(readFileSync(PANEL, 'utf8'))
const quiz = decomment(readFileSync(QUIZ, 'utf8'))
const actions = decomment(readFileSync(ACTIONS, 'utf8'))
const no = JSON.parse(readFileSync('messages/no.json', 'utf8')).builder as Record<string, string>
const en = JSON.parse(readFileSync('messages/en.json', 'utf8')).builder as Record<string, string>

describe('the note under Kjøremodus', () => {
  it('is at most one sentence, chosen by which reason applies', () => {
    // A ternary chain ending in null: every branch names one reason, and the
    // last one is «say nothing».
    expect(panel).toContain('const standing =')
    expect(panel).toContain('? s.quizPackLocked')
    expect(panel).toContain('? s.quizWillName')
    expect(panel).toMatch(/:\s*null\s*$/m)
  })

  it('says nothing at all once the survey IS a quiz', () => {
    // Both conditions provably hold by then. This is the state QuizPanel used
    // to fill with a permanent description of two rules that could not fail.
    expect(panel).toContain("mode === 'quiz'")
    expect(quiz).not.toContain('s.guard')
    expect(quiz).not.toContain('guard: string')
  })

  it('never says both reasons, because the key that said both is gone', () => {
    expect(no.quizGuard).toBeUndefined()
    expect(en.quizGuard).toBeUndefined()
    for (const src of [panel, quiz, actions]) expect(src).not.toContain('quizGuard')
  })

  it('does not tell a person which layer refused them', () => {
    // True, and written for us. An editor needs the next step, not the
    // architecture.
    const all = Object.values(no).join(' ') + Object.values(en).join(' ')
    expect(all).not.toMatch(/avvises av databasen|rejected by the database|ikke bare av skjermen/i)
  })
})

describe('picking Quiz carries out the consequence', () => {
  it('moves anonymity in the SAME statement, so the trigger sees a finished row', () => {
    // Two updates would hand the trigger an intermediate state its own first
    // clause refuses.
    expect(actions).toMatch(/runMode === 'quiz'\s*\?\s*\{ run_mode: runMode, anonymity: 'named' \}/)
  })

  it('reports the switch rather than making it silently', () => {
    // Changing how a survey collects answers behind someone's back would be a
    // worse defect than the one this fixes.
    expect(actions).toContain('switchedToNamed')
    expect(panel).toContain('if (r.switchedToNamed)')
    expect(panel).toContain('s.quizSwitchedToNamed')
    expect(no.quizSwitchedToNamed).toContain('Med navn')
  })

  it('decides «did it change» on the server, from the row', () => {
    expect(actions).toMatch(/select\('anonymity'\)/)
    expect(actions).toMatch(/current!\.anonymity !== 'named'/)
  })

  it('leaves the database rule exactly as it was', () => {
    // The fix is in the screen. Asserted against the migration so a later
    // «simplification» of the guard fails here.
    const guard = readFileSync('supabase/migrations/20260909000085_quiz.sql', 'utf8')
    expect(guard).toContain('quiz_requires_named')
    expect(guard).toContain('quiz_not_on_statutory_pack')
  })

  it('keeps the pack lock a refusal, with its own named error', () => {
    expect(actions).toContain("error: 'quizPackLocked'")
    expect(actions).toContain('quiz_not_on_statutory_pack')
    expect(no.quizPackLocked).toBeTruthy()
    expect(en.quizPackLocked).toBeTruthy()
  })
})

describe('nothing restrictive greets a person who has asked for nothing', () => {
  it('no longer pre-empts the Live rule on a named survey', () => {
    // `anonymity !== 'anonymous' && mode !== 'live'` rendered «Live krever
    // anonyme svar» permanently, on a survey whose editor had not gone near
    // Live. It is a refusal message now, and only that.
    expect(panel).not.toContain("anonymity !== 'anonymous' && mode !== 'live'")
    expect(panel).toContain("r.error === 'namedSurvey'")
  })

  it('keeps the refusal chip and the standing sentence visually distinct', () => {
    // --ac3 is the warning chip. A sentence about the mode you are considering
    // must not wear it.
    expect(panel).toMatch(/note \? \([\s\S]{0,400}var\(--ac3\)/)
    expect(panel).toMatch(/\) : standing \? \(/)
  })
})
