import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import no from '../../messages/no.json'
import en from '../../messages/en.json'
import { retentionOf } from '../../lib/surveys/retention'

/**
 * Q187. The sentence a respondent reads about her own data, measured against
 * what `app.apply_retention()` actually does.
 */
describe('Q187 — retention is interpolated, and «never» is a state', () => {
  it('reports the organisation’s own number, not a constant', () => {
    for (const months of [6, 12, 24]) {
      expect(retentionOf({ retention_months: months, privacy: { auto_delete: true } })).toEqual({
        kept: 'months',
        months,
      })
    }
  })

  it('0 means NEVER, and never is not a duration', () => {
    // `app.apply_retention` deletes only `where retention_months > 0`.
    const r = retentionOf({ retention_months: 0, privacy: { auto_delete: true } })
    expect(r).toEqual({ kept: 'forever' })
    expect(r).not.toHaveProperty('months')
  })

  it('auto_delete off means NEVER, whatever the number says', () => {
    // The second half of the function's predicate, and the one a caller reading
    // only `retention_months` would miss — the row would say «24 måneder» about
    // a database that deletes nothing.
    expect(retentionOf({ retention_months: 24, privacy: { auto_delete: false } })).toEqual({
      kept: 'forever',
    })
  })

  it('an ABSENT auto_delete means on — matching coalesce(…, true), not inverting it', () => {
    expect(retentionOf({ retention_months: 12, privacy: {} })).toEqual({
      kept: 'months',
      months: 12,
    })
    expect(retentionOf({ retention_months: 12, privacy: null })).toEqual({
      kept: 'months',
      months: 12,
    })
  })

  it('a null column is never, not a default of 12', () => {
    // The column is NOT NULL, so this is unreachable through the schema — but a
    // caller that invents 12 here would be fabricating a promise, which is
    // worse than saying «kept until deleted».
    expect(retentionOf({ retention_months: null, privacy: {} })).toEqual({ kept: 'forever' })
  })
})

describe('Q187 — the screen that renders it may not hard-code a duration', () => {
  const page = readFileSync('app/(app)/undersokelser/[id]/personvern/page.tsx', 'utf8')
  const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('no number reaches the page — the duration is interpolated', () => {
    // Comments stripped: this page's own header names «24 måneder» in order to
    // refuse it, which is the refusal-in-a-comment shape.
    expect(code).not.toMatch(/24\s*måneder|\b24\b/)
    expect(code).toMatch(/retentionOf\(/)
    expect(code).toMatch(/retention\.kept === 'months'/)
  })

  it('the «never» case has its own sentence in both languages, with no number', () => {
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const p = (set as { surveyPrivacy: Record<string, string> }).surveyPrivacy
      expect(p.retentionForever, lang).toBeTruthy()
      expect(p.retentionForever, `${lang} states a duration for «never»`).not.toMatch(/\d/)
      // And the months sentence carries a placeholder rather than a constant.
      expect(p.retentionMonths, lang).toContain('{n}')
      expect(p.retentionMonths, `${lang} hard-codes a number`).not.toMatch(/\d/)
    }
  })

  it('«servere i Norge» is NOT built — it is narrower than the truth', () => {
    // V6-1's sweep: production is eu-central-1 (Frankfurt), and the shipped
    // faq2A already says «Oslo og Frankfurt». A second, narrower copy of a
    // claim about where personal data lives is a false claim.
    expect(code).not.toMatch(/Norge/)
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const p = (set as { surveyPrivacy: Record<string, string> }).surveyPrivacy
      expect(Object.values(p).join(' '), lang).not.toMatch(/servere i Norge|servers in Norway/)
    }
  })
})
