import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  methodCounts,
  methodNotes,
  toJsRegex,
  type MethodQuestion,
  type MethodRule,
} from '../../lib/questions/method'

/**
 * V6-3 — Metodikk ADVISES (Q178). These are the evaluator's properties; the
 * seeded rows are checked against the database in tests/db/method-rules.test.ts,
 * because a claim about what ships has to be read from what ships.
 */
const rule = (over: Partial<MethodRule>): MethodRule => ({
  key: 'k',
  severity: 'advarsel',
  kind: 'type_in',
  config: {},
  title: 't',
  why: 'w',
  fix: 'f',
  ...over,
})
const q = (over: Partial<MethodQuestion>): MethodQuestion => ({
  type: 'scale',
  text: 'Hvordan går det?',
  position: 5,
  ...over,
})

describe('V6-3 — the methodology check advises and never blocks', () => {
  it('EXPORTS NOTHING A CALLER COULD GATE SENDING ON — Q178, structurally', () => {
    /*
      The bundle computes `goSendBlocked = !lint.canPublish` (v6:9857). Tor:
      «a tool that refuses to send what it just let you build, with no override,
      turns a methodological opinion into a technical bar.»

      Asserted over the SOURCE rather than trusted: there is no canPublish, no
      blocked flag and no boolean summary. A caller cannot accidentally build a
      bar out of this module because there is nothing here that would serve as
      one. Comments are stripped first — this file's own doc comment names
      `canPublish` in order to refuse it, which is the refusal-in-a-comment
      shape.
    */
    const src = readFileSync('lib/questions/method.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/canPublish|goSendBlocked|blocked|canSend/i)
    expect(src).not.toMatch(/blokkert/i)
    // The severity union admits exactly two values, and neither is a blocker.
    expect(src).toMatch(/'advarsel' \| 'forslag'/)
  })

  it('flags a type the rule names, and only that type', () => {
    const rules = [rule({ key: 'matrix_mobile', kind: 'type_in', config: { types: ['matrix'] } })]
    expect(methodNotes([q({ type: 'matrix', position: 0 })], rules)).toHaveLength(1)
    for (const t of ['scale', 'text', 'choice', 'ranking']) {
      expect(methodNotes([q({ type: t })], rules), t).toHaveLength(0)
    }
  })

  it('Q180 — a locked policy exempts the order rule, and only that rule', () => {
    /*
      In a statutory pack the question ORDER is part of what makes it statutory,
      so a lint that warns against a lovpålagt template is a lint that is wrong.
      The exemption is read from the ROW (`exempt_policy_locked`), not decided
      by the evaluator, so a second order-sensitive rule inherits it by saying
      so — and a rule that does NOT say so keeps firing on a locked survey.
    */
    const sensitive = rule({
      key: 'sensitive_early',
      kind: 'sensitive_position',
      config: { max_position: 2, pattern: 'varsl|trakasser', exempt_policy_locked: true },
    })
    const strict = rule({
      key: 'no_exemption',
      kind: 'sensitive_position',
      config: { max_position: 2, pattern: 'varsl|trakasser' },
    })
    const first = [q({ text: 'Har du varslet om noe?', position: 0 })]

    expect(methodNotes(first, [sensitive])).toHaveLength(1)
    expect(methodNotes(first, [sensitive], { policyLocked: true })).toHaveLength(0)
    // The exemption belongs to the row, not to the kind.
    expect(methodNotes(first, [strict], { policyLocked: true })).toHaveLength(1)
  })

  it('the order rule fires only near the start', () => {
    const r = rule({
      kind: 'sensitive_position',
      config: { max_position: 2, pattern: 'trakasser' },
    })
    expect(methodNotes([q({ text: 'Om trakassering', position: 0 })], [r])).toHaveLength(1)
    expect(methodNotes([q({ text: 'Om trakassering', position: 1 })], [r])).toHaveLength(1)
    expect(methodNotes([q({ text: 'Om trakassering', position: 2 })], [r])).toHaveLength(0)
  })

  it('the two-questions-in-one rule needs BOTH the word and the length', () => {
    const r = rule({
      kind: 'text_regex_min_words',
      config: { pattern: '(?<![\\p{L}\\d])(og|eller)(?![\\p{L}\\d])', min_words: 7 },
    })
    // Long enough AND carries «og».
    expect(
      methodNotes([q({ text: 'Er du fornøyd med lønn og arbeidstid i avdelingen din?' })], [r]),
    ).toHaveLength(1)
    // Carries «og» but is short.
    expect(methodNotes([q({ text: 'Lønn og tid?' })], [r])).toHaveLength(0)
    // Long but carries neither word.
    expect(
      methodNotes([q({ text: 'Hvor fornøyd er du med arbeidstiden din for tiden nå?' })], [r]),
    ).toHaveLength(0)
  })

  it('the Norwegian boundary holds — «og» inside a word is not «og»', () => {
    /*
      D113/D116, one level over: JavaScript's `\b` is ASCII-only, so a Norwegian
      pattern must use an explicit letter class. «bolig» ends in «og» and must
      not match; «håndtering og lønn» must.
    */
    const r = rule({
      kind: 'text_regex_min_words',
      config: { pattern: '(?<![\\p{L}\\d])(og|eller)(?![\\p{L}\\d])', min_words: 3 },
    })
    expect(methodNotes([q({ text: 'Er boligen din grei nok?' })], [r])).toHaveLength(0)
    expect(methodNotes([q({ text: 'Håndtering og lønn i år' })], [r])).toHaveLength(1)
  })

  it('scale and free-text suggestions read the question, not the type name alone', () => {
    const scaleRule = rule({ key: 's', severity: 'forslag', kind: 'scale_unlabelled' })
    expect(methodNotes([q({ type: 'scale', config: {} })], [scaleRule])).toHaveLength(1)
    expect(
      methodNotes([q({ type: 'scale', config: { labels: ['Lav', 'Høy'] } })], [scaleRule]),
    ).toHaveLength(0)

    const textRule = rule({ key: 't', severity: 'forslag', kind: 'text_no_followup' })
    expect(methodNotes([q({ type: 'text' })], [textRule])).toHaveLength(1)
    expect(methodNotes([q({ type: 'text', followUpOnLow: true })], [textRule])).toHaveLength(0)
  })

  it('an unknown kind is SKIPPED rather than thrown', () => {
    // A later migration may add a kind this deploy does not know. It must not
    // take the panel down.
    expect(() =>
      methodNotes([q({})], [rule({ kind: 'something_from_the_future' })]),
    ).not.toThrow()
    expect(methodNotes([q({})], [rule({ kind: 'something_from_the_future' })])).toEqual([])
  })

  it('an uncompilable pattern disables its rule rather than throwing', () => {
    // The swallow exists because this runs on every keystroke. The db suite
    // asserts no SEEDED pattern ever lands here, which is the half that matters.
    expect(toJsRegex('(')).toBeNull()
    expect(() => methodNotes([q({})], [rule({ kind: 'text_regex', config: { pattern: '(' } })])).not.toThrow()
  })

  it('counts are per severity, and there is no third bucket', () => {
    const notes = methodNotes(
      [q({ type: 'matrix', position: 0 }), q({ type: 'text', position: 1 })],
      [
        rule({ key: 'a', kind: 'type_in', config: { types: ['matrix'] } }),
        rule({ key: 'b', severity: 'forslag', kind: 'text_no_followup' }),
      ],
    )
    expect(methodCounts(notes)).toEqual({ advarsel: 1, forslag: 1 })
  })

  it('a note says WHICH question it is about', () => {
    const notes = methodNotes(
      [q({ type: 'scale', position: 3 }), q({ type: 'matrix', position: 7 })],
      [rule({ kind: 'type_in', config: { types: ['matrix'] } })],
    )
    expect(notes.map((n) => n.position)).toEqual([7])
  })
})
