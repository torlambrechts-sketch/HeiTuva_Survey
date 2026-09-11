import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { writesValidatedColumn } from '../db/factories'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * C2 — the Builder control for `surveys.feedback_mode`.
 *
 * `M:0099` created the column and wrote, in its own comment, that the honest
 * answer to «who writes this column?» was NOTHING except the seed, and that
 * this phase's action would be the writer. These tests are the receipt.
 *
 * CLAUDE.md's standing question has fired FOUR times, and in three of them the
 * column existed and was READ everywhere — `run_mode` read by the Live page and
 * the context bar, `created_by` read by an audit, `organizations.timezone` read
 * by all three `next_run_at` sites. «Is it there» is never the question.
 */
const ACTIONS = readFileSync('app/(app)/undersokelser/[id]/bygg/actions.ts', 'utf8')
const PANEL = readFileSync('app/(app)/undersokelser/[id]/bygg/RunModePanel.tsx', 'utf8')

describe('C2 — feedback_mode has a writer, and it is a real one', () => {
  it('1. setFeedbackMode writes the column, through the Zod boundary, not as a literal', () => {
    // D155's helper rather than a regex over a spelling: what is asserted is the
    // PROPERTY — this action's own body names the column, something was parsed
    // and checked first, and the value is not hard-coded.
    const r = writesValidatedColumn(ACTIONS, 'setFeedbackMode', 'feedback_mode')
    expect(r.writes, 'setFeedbackMode does not write feedback_mode').toBe(true)
    expect(r.validated, 'the value never passed a Zod boundary').toBe(true)
    expect(r.literal, 'the column is written as a constant, which is not a writer').toBe(false)
  })

  it('2. and it is NOT satisfied by some other action writing the column', () => {
    // The helper is scoped to the named function's body. Proven here rather than
    // trusted, by asking for an action that does not write it.
    const other = writesValidatedColumn(ACTIONS, 'setRunMode', 'feedback_mode')
    expect(other.writes).toBe(false)
  })

  it('3. a leser cannot write it', () => {
    const from = ACTIONS.indexOf('export async function setFeedbackMode')
    const body = ACTIONS.slice(from, from + 1200)
    expect(body).toMatch(/viewer\.role === 'leser'/)
    expect(body).toMatch(/forbidden/)
  })

  it('4. Q114 — there is NO pack lock, and no guard pretending to be one', () => {
    // The decision is «no lock»: the product's other locks govern what the
    // employer may SEE, and this governs whether the employer may REPLY. A guard
    // added here later would be a decision, not a tidy-up, so its absence is
    // asserted rather than assumed.
    const from = ACTIONS.indexOf('export async function setFeedbackMode')
    const body = ACTIONS.slice(from, from + 1200)
    expect(body).not.toMatch(/policy_locked|packLocks|template_pack_key|statutory/i)
  })
})

describe('C2 — the four cards render four real states', () => {
  it('5. all four modes are drawn, in the bundle’s order', () => {
    const order = ['off', 'anonymous', 'named', 'optional']
    const positions = order.map((k) => PANEL.indexOf(`key: '${k}'`))
    expect(positions.every((p) => p > -1), `a mode card is missing: ${order}`).toBe(true)
    expect([...positions].sort((a, b) => a - b), 'the cards are out of the bundle’s order').toEqual(
      positions,
    )
  })

  it('6. an unknown stored value falls back to anonymous, and `off` is NOT that fallback', () => {
    // The failure this prevents: a survey stored `off` rendering as `anonymous`
    // because the control has no reading for it. That would show every existing
    // survey — all of which C1 backfilled to `off` — as having comments switched
    // ON, which is the opposite of the decision the backfill exists to carry out.
    expect(PANEL).toMatch(/feedbackMode === 'off'/)
    expect(PANeL_HAS_OFF_IN_UNION(PANEL), 'the off case is not preserved').toBe(true)
  })

  it('7. the radio moves back when the server refuses', () => {
    // An optimistic control that stays moved after a refusal is worse than one
    // that does not move: it reports a setting the database does not have.
    const from = PANEL.indexOf('function pickFeedback')
    const body = PANEL.slice(from, from + 900)
    expect(body).toMatch(/const previous = feedback/)
    expect(body).toMatch(/setFeedback\(previous\)/)
  })
})

function PANeL_HAS_OFF_IN_UNION(src: string): boolean {
  const from = src.indexOf('const [feedback, setFeedback]')
  return /'off'[\s\S]{0,120}\? feedbackMode/.test(src.slice(from, from + 400))
}

describe('C2 — the copy is corrected against the running product, not copied', () => {
  const nb = (no as { builder: Record<string, string> }).builder
  const eb = (en as { builder: Record<string, string> }).builder

  it('8. «neste innlogging» appears nowhere — a respondent does not log in', () => {
    // The bundle's own anonymous-mode description says the respondent sees the
    // reply «ved neste innlogging». She holds a link and has no account; Q111
    // is the whole reason the token gained a read capability instead.
    for (const [lang, dict] of [['no', nb], ['en', eb]] as const) {
      for (const [k, v] of Object.entries(dict)) {
        if (!k.startsWith('feedback')) continue
        expect(v, `${lang}.builder.${k} promises a login`).not.toMatch(
          /innlogging|logg(er)? inn|log in|sign in/i,
        )
      }
    }
  })

  it('9. «et valg per kommentar» appears nowhere — the choice is per submission', () => {
    // Q113, and D156: the bundle's own implementation stores one choice per
    // SUBMISSION too, so this corrects copy rather than overriding behaviour.
    expect(nb.feedbackOptionalDesc).not.toMatch(/per kommentar/i)
    expect(eb.feedbackOptionalDesc).not.toMatch(/per comment/i)
    expect(nb.feedbackOptionalDesc, 'the Norwegian does not say the choice covers everything')
      .toMatch(/hele svaret/i)
  })

  it('10. every key exists in BOTH languages', () => {
    const keys = Object.keys(nb).filter((k) => k.startsWith('feedback'))
    expect(keys.length, 'no feedback keys at all').toBeGreaterThan(8)
    expect(keys.filter((k) => !(k in eb)), 'missing English').toEqual([])
  })
})
