import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { anonymitySheet, SHEET_KEYS } from '../../lib/respondent/anonymity-sheet'
import type { Retention } from '../../lib/surveys/retention'

/**
 * F1-2 — «Slik behandles svaret ditt» (`rlAnonRows`, v6:10070).
 *
 * Six rows, every one a CLAIM about the running product, on the one surface
 * read by a person who was promised anonymity. So each is tested against what
 * the product actually does, and the retention row is tested against Q187:
 * the bundle hard-codes «24 måneder» and it is false three ways.
 */
const MONTHS = (n: number): Retention => ({ kept: 'months', months: n })
const FOREVER: Retention = { kept: 'forever' }

const rows = (over: Partial<Parameters<typeof anonymitySheet>[0]> = {}) =>
  anonymitySheet(
    {
      anonymity: 'anonymous',
      kThreshold: 5,
      respondentKind: 'person',
      retention: MONTHS(12),
      ...over,
    },
    'no',
  )

const valueOf = (r: ReturnType<typeof rows>, label: string) =>
  r.find((x) => x.labelKey === label)!

describe('F1-2 — the respondent’s anonymity sheet', () => {
  it('is six rows, in the drawing’s order', () => {
    expect(rows().map((r) => r.labelKey)).toEqual([
      'sheetStoredLabel',
      'sheetWhoSeesLabel',
      'sheetThresholdLabel',
      'sheetRemindersLabel',
      'sheetFreeTextLabel',
      'sheetRetentionLabel',
    ])
  })

  it('Q187 — the retention row is INTERPOLATED, never a fixed number', () => {
    expect(valueOf(rows({ retention: MONTHS(6) }), 'sheetRetentionLabel')).toEqual({
      labelKey: 'sheetRetentionLabel',
      valueKey: 'sheetRetentionMonths',
      values: { n: 6 },
    })
    // And 24 is not privileged: it is one value among four, not the sentence.
    expect(valueOf(rows({ retention: MONTHS(24) }), 'sheetRetentionLabel').values).toEqual({ n: 24 })
  })

  it('Q187 — «never» is its own claim, and carries no duration at all', () => {
    const r = valueOf(rows({ retention: FOREVER }), 'sheetRetentionLabel')
    expect(r.valueKey).toBe('sheetRetentionForever')
    expect(r.values).toBeUndefined()
  })

  it('an organisation respondent is never promised a threshold', () => {
    /* `app.k_for` returns 0 for `respondent_kind = 'organisation'` — attributed
       under åpenhetsloven, so there is no threshold to promise. A sheet that
       said «minst fem» there would be describing a gate that is not applied. */
    const r = rows({ respondentKind: 'organisation' })
    expect(valueOf(r, 'sheetThresholdLabel').valueKey).toBe('sheetThresholdNone')
    expect(valueOf(r, 'sheetStoredLabel').valueKey).toBe('sheetStoredOrg')
    expect(valueOf(r, 'sheetWhoSeesLabel').valueKey).toBe('sheetWhoSeesOrg')
    expect(valueOf(r, 'sheetFreeTextLabel').valueKey).toBe('sheetFreeTextOrg')
  })

  it('«valgfritt» is its own row set — it is neither anonymous nor named', () => {
    /* The bundle branches `pol.anon === "anonymous"` only, so a respondent on an
       OPTIONAL survey is told «Svarene dine og navnet ditt» before she has
       chosen. That is the defect `anonymityPromise` already refuses one screen
       up, and it is refused here for the same reason. */
    const r = rows({ anonymity: 'optional' })
    expect(valueOf(r, 'sheetStoredLabel').valueKey).toBe('sheetStoredOptional')
    expect(valueOf(r, 'sheetWhoSeesLabel').valueKey).toBe('sheetWhoSeesOptional')
  })

  it('the threshold is spelled as a word, in the respondent’s language', () => {
    expect(anonymitySheet(
      { anonymity: 'anonymous', kThreshold: 8, respondentKind: 'person', retention: FOREVER },
      'en',
    ).find((x) => x.labelKey === 'sheetThresholdLabel')!.values).toEqual({ kWord: 'eight' })
  })

  it('every key the sheet can return resolves in BOTH languages', () => {
    /* Derived from the registry rather than listed here, so a seventh row or a
       fourth anonymity mode cannot arrive without its copy. A missing key
       renders as a raw key on a respondent's screen. */
    for (const lang of ['no', 'en']) {
      const m = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')).respondent as Record<
        string,
        string
      >
      for (const k of SHEET_KEYS) {
        expect(m[k], `${lang}.respondent.${k}`).toBeTruthy()
      }
    }
  })

  it('no shipped sheet string hard-codes a retention period', () => {
    /* The property, not the instance: «24» was the bundle's, and the next one
       would be «12». Nothing in these sentences may assert a duration the
       organisation did not set. */
    for (const lang of ['no', 'en']) {
      const m = JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')).respondent as Record<
        string,
        string
      >
      for (const k of SHEET_KEYS) {
        const v = m[k]!.replace(/\{[^}]*\}/g, '')
        expect(v, `${lang}.respondent.${k} asserts a fixed period`).not.toMatch(
          /\d+\s*(måned|month)/i,
        )
      }
    }
  })
})
