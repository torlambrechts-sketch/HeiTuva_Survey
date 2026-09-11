import type { Database } from '@/types/database'
import type { QuestionType } from '@/lib/questions/registry'
import type { Engagement } from '@/lib/engagement'

export type CommentMode = Database['public']['Tables']['survey_questions']['Row']['comment_mode']

/**
 * A question as the Builder holds it.
 *
 * `id` is the database row's id for a question that has been saved, and a
 * client-generated `new:` id for one that has not. The save action keys off
 * that prefix rather than tracking a separate "dirty" set.
 */
export type DraftQuestion = {
  id: string
  type: QuestionType
  text: string
  help: string
  required: boolean
  commentMode: CommentMode
  followUpOnLow: boolean
  /**
   * V2-10 (Q84). The index of the correct option, for quiz mode. **NULL is a
   * real value here and means «no key»** — see the note in `actions.ts`: a
   * default of 0 would fabricate an answer key on every question.
   */
  answerIndex: number | null
  /** V2-10. Points for a correct answer; the bundle's own default is 100 (V2:6507). */
  points: number
  config: QuestionConfig
}

/**
 * The per-type shape documented on `survey_questions.config`. Every field is
 * optional because which ones apply is the registry's answer, not the type
 * system's — `specOf(type)` says which editor renders.
 */
export type QuestionConfig = {
  points?: number
  low_label?: string
  high_label?: string
  labels?: string[]
  options?: string[]
  statements?: string[]
  fields?: [string, string][]
  multi?: boolean
  randomize?: boolean
  min?: number
  max?: number
}

export type BuilderDraft = {
  title: string
  audience: string
  /** surveys.engage — the engagement panel's settings, saved with the draft. */
  engage: Engagement
  questions: DraftQuestion[]
}

export const NEW_ID_PREFIX = 'new:'
export const isNewQuestion = (id: string) => id.startsWith(NEW_ID_PREFIX)

/** The design warns above eight questions (HeiTuva.dc.html length note). */
export const LONG_SURVEY_THRESHOLD = 8

/**
 * Input types a `field` question can collect (L:2702 seeds
 * name/email/date). Kept here rather than in the component so the editor and
 * Phase 3's respondent renderer read the same list.
 */
export const FIELD_INPUT_TYPES = ['text', 'email', 'date', 'number', 'phone'] as const
export type FieldInputType = (typeof FIELD_INPUT_TYPES)[number]
export const FIELD_TYPE_KEY: Record<FieldInputType, string> = {
  text: 'ftText',
  email: 'ftEmail',
  date: 'ftDate',
  number: 'ftNumber',
  phone: 'ftPhone',
}

export const COMMENT_MODES: CommentMode[] = ['arv', 'pa', 'av']
export const COMMENT_MODE_KEY: Record<CommentMode, string> = {
  arv: 'commentArv',
  pa: 'commentPa',
  av: 'commentAv',
}

/** Message key for each type's label inside the per-question select. */
export const TYPE_OPTION_KEY: Record<QuestionType, string> = {
  scale: 'optScale',
  likert: 'optLikert',
  smiley: 'optSmiley',
  enps: 'optEnps',
  slider: 'optSlider',
  choice: 'optChoice',
  dropdown: 'optDropdown',
  image: 'optImage',
  yesno: 'optYesno',
  ranking: 'optRanking',
  matrix: 'optMatrix',
  text: 'optText',
  field: 'optField',
}

/**
 * The Add panel's label for a type, which is NOT always the select's label.
 * The design's palette row reads "Skala" while the per-question select reads
 * "Skala · tall" — the palette adds one scale question and the card then picks
 * a style, so naming a style in the palette would promise a choice the row does
 * not make (L:3969 vs TYPE_LABEL). Every other type reads the
 * same in both places.
 */
export const ADD_LABEL_KEY: Partial<Record<QuestionType, string>> = { scale: 'addScale' }

export const GROUP_KEY = {
  skala: 'grpSkala',
  valg: 'grpValg',
  utsagn: 'grpUtsagn',
  apne: 'grpApne',
} as const

/**
 * Message key for the Add panel's one-line description per type
 * (L:3969-3972). Keys, not strings: the panel is user-facing copy
 * and `no` is only the source language.
 */
export const ADD_DESC_KEY: Partial<Record<QuestionType, string>> = {
  scale: 'addDescScale',
  choice: 'addDescChoice',
  dropdown: 'addDescDropdown',
  image: 'addDescImage',
  yesno: 'addDescYesno',
  ranking: 'addDescRanking',
  matrix: 'addDescMatrix',
  text: 'addDescText',
  field: 'addDescField',
}
