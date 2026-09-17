import { describe, expect, it } from 'vitest'
import { qualityFlags, type QualityRule } from '@/lib/questions/quality'
import {
  ADD_PANEL_TYPES,
  QUESTION_TYPES,
  QUESTION_TYPE_KEYS,
  estimatedMinutes,
  specOf,
} from '@/lib/questions/registry'

/**
 * The seeded rows, verbatim from supabase/seed.sql. Copied rather than read
 * from the database on purpose: this suite pins the evaluator against the
 * design's own heuristics (HeiTuva.dc.html:2495-2502), so it must fail if the
 * evaluator drifts even when the seed changes with it.
 */
const RULES: QualityRule[] = [
  {
    key: 'double_barreled',
    pattern: '\\m(og|eller)\\M',
    rule: { kind: 'regex_min_words', min_words: 7 },
    message: 'Ser ut som to spørsmål i ett — del det opp',
  },
  {
    key: 'leading_words',
    pattern: null,
    rule: {
      kind: 'leading_words',
      words: ['fornøyd', 'enig i at', 'selvsagt', 'åpenbart', 'endelig', 'flott', 'utmerket', 'dårlige'],
    },
    message: 'Ledende ordvalg — prøv en nøytral formulering',
  },
  { key: 'too_long', pattern: null, rule: { kind: 'max_words', max: 20 }, message: 'Over 20 ord — kort det ned' },
  { key: 'negation', pattern: '\\m(ikke|aldri)\\M', rule: { kind: 'regex' }, message: 'Negasjon gjør spørsmålet vanskelig å svare på' },
]

const keys = (text: string) => qualityFlags(text, RULES).map((f) => f.key)

describe('qualityFlags', () => {
  it('raises nothing for a clean question', () => {
    expect(keys('Hvordan opplever du arbeidsdagen din?')).toEqual([])
  })

  it('raises nothing for empty or whitespace text', () => {
    // The readiness check owns "this question has no text"; flagging it here as
    // well would put two complaints on one problem.
    expect(keys('')).toEqual([])
    expect(keys('   ')).toEqual([])
  })

  describe('double_barreled', () => {
    it('fires on a conjunction once the sentence is long enough', () => {
      // Seven words, the design's inclusive threshold (`split(" ").length > 6`).
      expect(keys('Er du fornøyd og trives du her')).toContain('double_barreled')
    })

    it('stays quiet on a short conjunction', () => {
      expect(keys('Trives du og hvorfor')).not.toContain('double_barreled')
    })

    it('needs a whole word, not a substring', () => {
      // "ogsa" and "elleve" contain og/elle but are not the conjunctions.
      expect(keys('Vi har ogsa elleve gode grunner til dette her')).not.toContain('double_barreled')
    })
  })

  describe('leading_words', () => {
    it('fires on a leading phrase', () => {
      expect(keys('Er du enig i at ledelsen gjør en god jobb?')).toContain('leading_words')
    })

    it('is case-insensitive', () => {
      expect(keys('SELVSAGT er dette bra?')).toContain('leading_words')
    })
  })

  describe('too_long', () => {
    it('fires above twenty words and not at exactly twenty', () => {
      const twenty = Array.from({ length: 20 }, (_, i) => `ord${i}`).join(' ')
      expect(keys(twenty)).not.toContain('too_long')
      expect(keys(`${twenty} ord20`)).toContain('too_long')
    })
  })

  describe('negation', () => {
    it('fires on ikke and aldri', () => {
      expect(keys('Synes du ikke dette er greit?')).toContain('negation')
      expect(keys('Skjer dette aldri?')).toContain('negation')
    })

    it('does not fire on a word merely containing the pattern', () => {
      expect(keys('Er ikkefaget relevant?')).not.toContain('negation')
    })
  })

  it('reports several flags in the order the rules are given', () => {
    // Long, double-barreled, leading and negated all at once — the display
    // order must come from the data, not from evaluation order.
    const bad =
      'Er du enig i at vi ikke burde endre noe og at alt fungerer helt utmerket slik som det er nå i dag'
    expect(keys(bad)).toEqual(['double_barreled', 'leading_words', 'too_long', 'negation'])
  })

  it('skips a rule kind it does not understand', () => {
    const future: QualityRule[] = [
      { key: 'from_the_future', pattern: null, rule: { kind: 'sentiment_model' }, message: 'x' },
      ...RULES,
    ]
    // An older deploy meeting a newer seed must degrade, not throw.
    expect(qualityFlags('Synes du ikke dette er greit?', future).map((f) => f.key)).toEqual(['negation'])
  })

  it('survives a malformed pattern', () => {
    const broken: QualityRule[] = [
      { key: 'broken', pattern: '(unclosed', rule: { kind: 'regex' }, message: 'x' },
    ]
    expect(() => qualityFlags('noe tekst', broken)).not.toThrow()
    expect(qualityFlags('noe tekst', broken)).toEqual([])
  })
})

describe('question type registry', () => {
  it('covers all 13 types', () => {
    expect(QUESTION_TYPE_KEYS).toHaveLength(13)
  })

  it('marks exactly `field` as anonymity-breaking', () => {
    // Security invariant: the warning is a property of the type, never a string
    // match on question text.
    const breaking = QUESTION_TYPE_KEYS.filter((t) => specOf(t).breaksAnonymity)
    expect(breaking).toEqual(['field'])
  })

  it('gives every type exactly one editor shape', () => {
    // Two option editors on one card would render duplicate lists.
    for (const type of QUESTION_TYPE_KEYS) {
      const s = specOf(type)
      const editors = [s.optionList, s.statements, s.imageOptions, s.formFields].filter(Boolean)
      expect(editors.length, `${type} has ${editors.length} editors`).toBeLessThanOrEqual(1)
    }
  })

  it('gives every type at most one scale treatment', () => {
    for (const type of QUESTION_TYPE_KEYS) {
      const s = specOf(type)
      const scales = [s.numericScale, s.wordScale, s.endLabels].filter(Boolean)
      expect(scales.length, `${type} has ${scales.length} scale strips`).toBeLessThanOrEqual(1)
    }
  })

  it('only offers a scale treatment on a numeric type', () => {
    for (const type of QUESTION_TYPE_KEYS) {
      const s = specOf(type)
      if (s.numericScale || s.wordScale || s.endLabels) expect(s.numeric, type).toBe(true)
    }
  })

  it('seeds default options for every type whose editor lists options', () => {
    for (const type of QUESTION_TYPE_KEYS) {
      const s = specOf(type)
      if (!s.optionList && !s.imageOptions) continue
      const opts = (s.defaultConfig as { options?: unknown[] }).options
      expect(Array.isArray(opts) && opts.length > 0, `${type} has no default options`).toBe(true)
    }
  })

  it('gives the word-scale types exactly five labels', () => {
    for (const type of QUESTION_TYPE_KEYS) {
      if (!specOf(type).wordScale) continue
      const labels = (specOf(type).defaultConfig as { labels?: unknown[] }).labels
      expect(labels, type).toHaveLength(5)
    }
  })

  it('lists 9 add-panel entries, all real types, collapsing the scale styles', () => {
    // The bundle's Add panel shows one "Skala" entry and defers the style
    // choice to the type select (HeiTuva.dc.html:3969).
    expect(ADD_PANEL_TYPES).toHaveLength(9)
    for (const t of ADD_PANEL_TYPES) expect(QUESTION_TYPES).toHaveProperty(t)
    const scaleStyles = ADD_PANEL_TYPES.filter((t) => specOf(t).group === 'skala')
    expect(scaleStyles).toEqual(['scale'])
  })

  it('estimates minutes the way the preview meta line does', () => {
    /* The question rate is UNCHANGED at 0.6 — it has shipped since Phase 2 and
       v7's `previewMeta` (v7:10259) agrees. These four are the original
       assertions, restated against the named argument. */
    expect(estimatedMinutes({ questions: 0 })).toBe(1)
    expect(estimatedMinutes({ questions: 1 })).toBe(1)
    expect(estimatedMinutes({ questions: 5 })).toBe(3)
    expect(estimatedMinutes({ questions: 10 })).toBe(6)
  })

  it('V7-4: a CONTENT BLOCK adds to the length, at half a question', () => {
    /* The defect this closes: the function took a question count and nothing
       else, which was the whole of a survey until M:0127. A flow with three
       questions and four blocks reported the length of three questions.

       0.3 is `previewMeta`'s rate (v7:10259). `bMinutes` (v7:10208) says
       0.4/0.25 for the same quantity, and the two cannot both be right — the
       one adopted is the one whose QUESTION rate matches what the product
       already ships, which is how the bundle's disagreement with itself was
       settled rather than split. See Q240. */
    expect(estimatedMinutes({ questions: 3, blocks: 4 })).toBe(3) // 1.8 + 1.2
    expect(estimatedMinutes({ questions: 10, blocks: 0 })).toBe(6)
    expect(estimatedMinutes({ questions: 10, blocks: 4 })).toBe(7) // 6 + 1.2
    // Blocks alone still take time, and the floor of one minute holds.
    expect(estimatedMinutes({ questions: 0, blocks: 1 })).toBe(1)
    expect(estimatedMinutes({ questions: 0, blocks: 12 })).toBe(4)
    // `blocks` is OPTIONAL, so the two pre-V7 call shapes agree exactly.
    expect(estimatedMinutes({ questions: 7 })).toBe(estimatedMinutes({ questions: 7, blocks: 0 }))
  })

  it('V7-4: it refuses the rate the bundle contradicts itself with', () => {
    /* `bMinutes`' 0.4/0.25 would give a DIFFERENT answer for the same flow, and
       the point of pinning it is that a future reader copying the other v7 line
       fails here rather than shipping a second estimate. */
    const bMinutesRate = (q: number, b: number) => Math.max(1, Math.round(q * 0.4 + b * 0.25))
    expect(estimatedMinutes({ questions: 10, blocks: 4 })).not.toBe(bMinutesRate(10, 4))
  })
})
