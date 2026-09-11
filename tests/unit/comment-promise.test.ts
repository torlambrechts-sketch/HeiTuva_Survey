import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * C3 — Q112's sentence, and the two things it must not be.
 *
 * «Anonymt» and «ingen kan lese det du skrev alene» are TWO promises. The
 * survey's anonymity banner makes the first while implying the second; a comment
 * keeps the first and loses the second, because a thread is one person by
 * construction and there is no aggregate to hide in.
 *
 * So a banner reading «anonymt» over the comment box would be technically true
 * and materially misleading, which is the worst kind of true — and REUSE is the
 * cheap failure here, not omission. These tests are aimed at reuse.
 */
const R_NO = (no as { respondent: Record<string, string> }).respondent
const R_EN = (en as { respondent: Record<string, string> }).respondent
const RESPONDENT = readFileSync('app/s/[token]/Respondent.tsx', 'utf8')
const COMMENT = readFileSync('app/s/[token]/QuestionComment.tsx', 'utf8')
const ACTIONS = readFileSync('app/s/[token]/actions.ts', 'utf8')

describe('C3 — the promise is its own sentence', () => {
  it('1. it exists, in both languages, and says the thing Q112 requires', () => {
    expect(R_NO.qcPromise).toBe(
      'Kommentaren leses som den står. Den kobles ikke til navnet ditt, men den vises ikke sammen med andres svar.',
    )
    expect(R_EN.qcPromise?.length ?? 0).toBeGreaterThan(40)
  })

  it('2. it is NOT the anonymity banner — asserted against every banner string', () => {
    // The anonymity promise is generated from the survey's settings by
    // `anonymityPromise`, so the strings it can produce are the ones to compare
    // against. Any of them EQUAL to the comment promise is the failure.
    const banners = Object.entries(R_NO).filter(([k]) => /^anon|^promise|^optional/i.test(k))
    expect(banners.length, 'no banner strings found — this test is checking nothing').toBeGreaterThan(0)
    for (const [k, v] of banners) {
      expect(v, `${k} is the same string as the comment promise`).not.toBe(R_NO.qcPromise)
    }
  })

  it('3. and it does NOT claim the k-gate, which is the clause that would be false', () => {
    // The banner's «Resultater vises først når minst fem har svart» is exactly
    // the guarantee a comment does not get. Q112 is a deliberate downgrade, so
    // the sentence must not carry a number or a «først når».
    for (const [lang, v] of [['no', R_NO.qcPromise], ['en', R_EN.qcPromise]] as const) {
      expect(v, `${lang} comment promise implies a threshold`).not.toMatch(
        /\b(fem|five|5|minst|at least|først når)\b/i,
      )
    }
  })

  it('4. the reply line is MODE-DERIVED, not a constant', () => {
    // The bundle renders «Lederen kan svare uten å se hvem som skrev»
    // unconditionally, including on a survey whose own mode description is
    // «Navnet følger kommentaren» (C0 sweep 3.1). That is a false promise on the
    // screen where the respondent decides whether to write.
    expect(COMMENT).toMatch(/anonymous \? s\.replyAnonymous : s\.replyNamed/)
    expect(R_NO.qcReplyNamed, 'the named branch does not say the name follows').toMatch(/[Nn]avnet/)
  })

  it('5. no respondent-facing comment string promises a login', () => {
    for (const [lang, dict] of [['no', R_NO], ['en', R_EN]] as const) {
      for (const [k, v] of Object.entries(dict)) {
        if (!/^(qc|fb)/.test(k)) continue
        expect(v, `${lang}.respondent.${k} promises a login`).not.toMatch(
          /innlogging|logg(er)? inn|log in|sign in/i,
        )
      }
    }
  })
})

describe('C3 — Q113: one choice, one control', () => {
  it('6. there is no per-comment anonymity toggle in the comment control', () => {
    // The database takes no per-comment input, so a toggle here would be a
    // control over something nothing reads — worse than no control at all.
    expect(COMMENT).not.toMatch(/setAnon|onToggleAnon|anonChips|chooseAnon/)
  })

  it('7. and the submit action carries no per-comment anonymity field', () => {
    const from = ACTIONS.indexOf('comments: z')
    expect(from, 'the comments field is gone').toBeGreaterThan(-1)
    const block = ACTIONS.slice(from, from + 500)
    expect(block).not.toMatch(/anon|named|withName/i)
  })

  it('8. the one choice drives BOTH axes from one variable', () => {
    expect(RESPONDENT).toMatch(/const choiceGoverns =\s*anonymity === 'optional' \|\| feedbackMode === 'optional'/)
    // and the chips render off that, not off `anonymity` alone
    expect(RESPONDENT).toMatch(/\{choiceGoverns \? \(/)
  })
})

describe('C3 — the two boxes on one card are told apart', () => {
  it('9. the vault field gets its own line when both are on screen', () => {
    expect(RESPONDENT).toMatch(/showComment && feedbackMode !== 'off'/)
    expect(R_NO.commentVaultNote).toMatch(/sammen med andres/)
  })

  it('10. and that line is not the comment promise either', () => {
    expect(R_NO.commentVaultNote).not.toBe(R_NO.qcPromise)
    expect(R_EN.commentVaultNote).not.toBe(R_EN.qcPromise)
  })
})

describe('C3 — nothing is rendered when the mode is off', () => {
  it('11. every comment surface is gated on feedbackMode !== off', () => {
    // Three of them: the per-question control, the vault note, and the
    // end-of-survey box. Counted rather than sampled.
    const gates = RESPONDENT.match(/feedbackMode !== 'off'/g) ?? []
    expect(gates.length, 'a comment surface renders regardless of the mode').toBe(3)
  })

  it('12. the sent confirmation is not rendered unless something was sent', () => {
    // «never fabricate data in the UI»: a confirmation of a thing that did not
    // happen is indistinguishable from a real one in a screenshot.
    expect(RESPONDENT).toMatch(/commentSent=\{Boolean\(comments\[SURVEY_LEVEL\]\)\}/)
    expect(RESPONDENT).toMatch(/\{commentSent \? \(/)
  })
})
