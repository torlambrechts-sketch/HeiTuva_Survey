import type { Database } from '@/types/database'

/**
 * The 13 question types, as data.
 *
 * CLAUDE.md: "One renderer per question type keyed off the registry. Adding a
 * pack/duty/language is a migration or a row, not a component." The types
 * themselves are the `app.question_type` enum (migration 0001), and each type's
 * config shape is documented on `survey_questions.config`. This module is the
 * TypeScript face of that enum: every per-type decision the Builder, the
 * preview and (in phase 3) the respondent renderer make is a field here, not a
 * conditional in a component.
 *
 * `QuestionType` is derived from the generated database types, so adding a
 * value to the enum without adding it here is a compile error rather than a
 * silently unrenderable question.
 */
export type QuestionType = Database['public']['Tables']['survey_questions']['Row']['type']

export type QuestionTypeGroup = 'skala' | 'valg' | 'utsagn' | 'apne'

/** Default labels for the two word-scale types, verbatim from the bundle. */
export const LIKERT_LABELS = [
  'Helt uenig',
  'Litt uenig',
  'Verken eller',
  'Litt enig',
  'Helt enig',
] as const
export const MOOD_LABELS = ['Dårlig', 'Litt dårlig', 'Nøytral', 'Bra', 'Veldig bra'] as const

/** The bundle's starting options for any type that has a plain option list. */
const DEFAULT_OPTIONS = ['Alternativ A', 'Alternativ B', 'Alternativ C']

export type QuestionSpec = {
  /** Group in both the type select's optgroups and the Add panel. */
  group: QuestionTypeGroup
  /**
   * Which editors and advanced controls this type shows. Read these instead of
   * comparing type strings — a new type then only needs a row here.
   */
  optionList: boolean
  statements: boolean
  imageOptions: boolean
  formFields: boolean
  /** Numeric answer: offers low-score follow-up, and reads as a scale in results. */
  numeric: boolean
  /** Editable points + low/high labels (the `isScaleNum` strip). */
  numericScale: boolean
  /** Five editable word labels (the `isWordScale` grid). */
  wordScale: boolean
  /** Low/high label pair without a points selector. */
  endLabels: boolean
  /** Multi-select and randomise chips in advanced mode. */
  choiceOptions: boolean
  /**
   * Can collect a name or an email, so it breaks anonymity on an anonymous
   * survey. Only `field` does; the warning is a property of the type, not a
   * string match on the question text.
   */
  breaksAnonymity: boolean
  /** Config for a freshly added question of this type. */
  defaultConfig: Record<string, unknown>
}

/**
 * Keyed by the enum value. `satisfies` rather than a type annotation so the
 * keys are checked for exhaustiveness against QuestionType while each entry
 * keeps its literal type.
 */
export const QUESTION_TYPES = {
  scale: {
    group: 'skala',
    optionList: false, statements: false, imageOptions: false, formFields: false,
    numeric: true, numericScale: true, wordScale: false, endLabels: false,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: { points: 5, low_label: '', high_label: '' },
  },
  likert: {
    group: 'skala',
    optionList: false, statements: false, imageOptions: false, formFields: false,
    numeric: true, numericScale: false, wordScale: true, endLabels: false,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: { labels: [...LIKERT_LABELS] },
  },
  smiley: {
    group: 'skala',
    optionList: false, statements: false, imageOptions: false, formFields: false,
    numeric: true, numericScale: false, wordScale: true, endLabels: false,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: { labels: [...MOOD_LABELS] },
  },
  enps: {
    group: 'skala',
    optionList: false, statements: false, imageOptions: false, formFields: false,
    numeric: true, numericScale: false, wordScale: false, endLabels: false,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: {},
  },
  slider: {
    group: 'skala',
    optionList: false, statements: false, imageOptions: false, formFields: false,
    numeric: true, numericScale: false, wordScale: false, endLabels: true,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: { min: 0, max: 100, low_label: 'Ingenting', high_label: 'All tiden' },
  },
  choice: {
    group: 'valg',
    optionList: true, statements: false, imageOptions: false, formFields: false,
    numeric: false, numericScale: false, wordScale: false, endLabels: false,
    choiceOptions: true, breaksAnonymity: false,
    defaultConfig: { options: [...DEFAULT_OPTIONS], multi: false, randomize: false },
  },
  dropdown: {
    group: 'valg',
    optionList: true, statements: false, imageOptions: false, formFields: false,
    numeric: false, numericScale: false, wordScale: false, endLabels: false,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: { options: ['Produkt', 'Design', 'Utvikling', 'Ledelse', 'Annet'] },
  },
  image: {
    group: 'valg',
    optionList: false, statements: false, imageOptions: true, formFields: false,
    numeric: false, numericScale: false, wordScale: false, endLabels: false,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: { options: [...DEFAULT_OPTIONS] },
  },
  yesno: {
    group: 'valg',
    optionList: false, statements: false, imageOptions: false, formFields: false,
    numeric: false, numericScale: false, wordScale: false, endLabels: false,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: {},
  },
  ranking: {
    group: 'valg',
    optionList: true, statements: false, imageOptions: false, formFields: false,
    numeric: false, numericScale: false, wordScale: false, endLabels: false,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: {
      options: ['Fleksitid', 'Hjemmekontor', 'Kompetansebudsjett', 'Ekstra fridager'],
    },
  },
  matrix: {
    group: 'utsagn',
    optionList: false, statements: true, imageOptions: false, formFields: false,
    numeric: true, numericScale: false, wordScale: false, endLabels: false,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: {
      statements: ['Jeg får tydelige mål', 'Jeg har tid nok', 'Jeg får hjelp når jeg trenger det'],
    },
  },
  text: {
    group: 'apne',
    optionList: false, statements: false, imageOptions: false, formFields: false,
    numeric: false, numericScale: false, wordScale: false, endLabels: false,
    choiceOptions: false, breaksAnonymity: false,
    defaultConfig: {},
  },
  field: {
    group: 'apne',
    optionList: false, statements: false, imageOptions: false, formFields: true,
    numeric: false, numericScale: false, wordScale: false, endLabels: false,
    choiceOptions: false, breaksAnonymity: true,
    defaultConfig: {
      fields: [
        ['Navn', 'text'],
        ['E-post', 'email'],
        ['Dato', 'date'],
      ],
    },
  },
} satisfies Record<QuestionType, QuestionSpec>

export const QUESTION_TYPE_KEYS = Object.keys(QUESTION_TYPES) as QuestionType[]

export function specOf(type: QuestionType): QuestionSpec {
  return QUESTION_TYPES[type]
}

/**
 * Order of the type select's optgroups and the Add panel's sections. The
 * bundle's own order — not alphabetical, and not the enum's order.
 */
export const TYPE_GROUP_ORDER: QuestionTypeGroup[] = ['skala', 'valg', 'utsagn', 'apne']

/**
 * The per-question `<select>` lists all 13 types; the Add panel lists 9,
 * because the bundle collapses the five scale styles into a single "Skala"
 * entry whose description says the style is chosen afterwards
 * (HeiTuva.dc.html:3969). Two different lists over one registry, so neither is
 * a hand-maintained copy.
 */
export const ADD_PANEL_TYPES: QuestionType[] = [
  'scale',
  'choice',
  'dropdown',
  'image',
  'yesno',
  'ranking',
  'matrix',
  'text',
  'field',
]

/**
 * Tints cycle within each group, matching the bundle's `[ii % 5]` over a
 * group's items rather than over the flat list.
 */
export const ADD_PANEL_TINTS = [
  'var(--ac)',
  'var(--ac2)',
  'var(--ac3)',
  'var(--sbg)',
  'var(--sf2)',
] as const

/** Default question text for a newly added question, by type. */
export const NEW_QUESTION_TEXT: Record<QuestionType, string> = {
  scale: 'Nytt skalaspørsmål',
  likert: 'Nytt enig–uenig-utsagn',
  smiley: 'Hvordan har uken vært?',
  enps: 'Hvor sannsynlig er det at du vil anbefale oss som arbeidsplass?',
  slider: 'Hvor stor andel av tiden går til møter?',
  choice: 'Nytt flervalgsspørsmål',
  dropdown: 'Hvilken avdeling tilhører du?',
  image: 'Hvilket alternativ foretrekker du?',
  yesno: 'Nytt ja / nei-spørsmål',
  ranking: 'Sett i rekkefølge etter hva som betyr mest',
  matrix: 'Hvor enig er du i disse utsagnene?',
  text: 'Nytt åpent spørsmål',
  field: 'Kontaktopplysninger',
}

/**
 * Estimated minutes for a question count, from the bundle: 0.6 min each, never
 * below 1. Used by the length note and the preview meta line, which must agree.
 */
export function estimatedMinutes(questionCount: number): number {
  return Math.max(1, Math.round(questionCount * 0.6))
}
