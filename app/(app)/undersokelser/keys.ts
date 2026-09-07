import type { Database } from '@/types/database'

/**
 * Undersøkelser's vocabulary and message keys.
 *
 * Kept out of the `'use client'` components on purpose: every export of a
 * client module becomes a client reference, and a server component mapping over
 * one of these lists then fails at runtime. Same reason as
 * administrasjon/keys.ts.
 */

export type SurveyStatus = Database['public']['Tables']['surveys']['Row']['status']
export type ShareScope = Database['public']['Tables']['surveys']['Row']['results_scope']

/** The three filter chips, in the design's order (HeiTuva.dc.html:3008). */
export const FILTERS = ['alle', 'aktiv', 'utkast'] as const
export type Filter = (typeof FILTERS)[number]
export const FILTER_KEY: Record<Filter, string> = {
  alle: 'filterAll',
  aktiv: 'filterActive',
  utkast: 'filterDraft',
}

/** The filter chips name statuses in Norwegian; `alle` matches everything. */
export const FILTER_STATUS: Record<Filter, SurveyStatus | null> = {
  alle: null,
  aktiv: 'aktiv',
  utkast: 'utkast',
}

/** Sort options, in the design's order (HeiTuva.dc.html:752). */
export const SORTS = ['nyeste', 'status', 'svar', 'navn'] as const
export type Sort = (typeof SORTS)[number]
export const SORT_KEY: Record<Sort, string> = {
  nyeste: 'sortNewest',
  status: 'sortStatus',
  svar: 'sortResponse',
  navn: 'sortName',
}

/**
 * Status pill colours, verbatim from the design's map (HeiTuva.dc.html:3431).
 * These three are literal hexes in the bundle rather than theme tokens — the
 * only place in the app that is true, so they are quoted here rather than
 * invented as new tokens.
 */
export const STATUS_COLORS: Record<SurveyStatus, { bg: string; fg: string }> = {
  aktiv: { bg: '#E4F2E0', fg: '#2F5D2A' },
  utkast: { bg: 'var(--sf2)', fg: 'var(--mut)' },
  lukket: { bg: '#F3E7DE', fg: '#8A4B22' },
}

/** The design's destructive-action colour in the row menu (HeiTuva.dc.html:797). */
export const DELETE_FG = '#8A4B22'

/**
 * "Hvem ser resultatene". The design's three options
 * (HeiTuva.dc.html:3423) mapped onto the `app.share_scope` enum, which uses
 * Norwegian names for the same three levels.
 */
export const SHARE_SCOPES: ShareScope[] = ['ledelse', 'ledere_eget_team', 'alle_ansatte']
export const SCOPE_KEY: Record<ShareScope, { label: string; desc: string; short: string }> = {
  ledelse: { label: 'scopeHrLabel', desc: 'scopeHrDesc', short: 'scopeHrShort' },
  ledere_eget_team: { label: 'scopeLeadLabel', desc: 'scopeLeadDesc', short: 'scopeLeadShort' },
  alle_ansatte: { label: 'scopeAllLabel', desc: 'scopeAllDesc', short: 'scopeAllShort' },
}

/**
 * The primary button per status (HeiTuva.dc.html:3432). A draft continues into
 * the Builder; an active survey goes to its answers; a closed one to its
 * report.
 */
export const PRIMARY_ACTION: Record<SurveyStatus, { key: string; path: string }> = {
  utkast: { key: 'primaryDraft', path: 'bygg' },
  aktiv: { key: 'primaryActive', path: 'resultater' },
  lukket: { key: 'primaryClosed', path: 'rapport' },
}

/** Response percentage, clamped, against the expected respondent count. */
export function responsePct(responses: number, target: number | null): number {
  if (!target || target <= 0) return 0
  return Math.min(100, Math.round((responses / target) * 100))
}

/**
 * The wizard's purpose list. The design offers six of the standard packs
 * rather than all seventeen (HeiTuva.dc.html:3504) — a first survey needs a
 * short, opinionated menu, not the whole Bibliotek.
 *
 * Keys, so the list survives a pack being retitled. A key missing from
 * `template_packs` is simply not offered.
 */
export const WIZARD_PACK_KEYS = [
  'ukentlig-puls',
  'psykososial-kartlegging',
  'csat',
  'oppstartssjekk',
  'likestilling-deltid',
  'nps-kunde',
] as const

/**
 * The cadences the wizard offers — six in the v1 bundle (NEW:4220), three in
 * the first one (OLD:3531).
 *
 * A SUBSET of `lib/send/registry.ts`'s eight, and deliberately: the wizard is
 * the four-step path for someone who has not thought about frequency yet, so it
 * offers the common ones and «Tilpasset» for everything else. `biweekly` and
 * `biennial` are reachable on the Send screen, which is where a customer who
 * knows they want «annethvert år» is. The bundle's own list is what decides
 * which six; this is not a judgement call re-made here.
 *
 * `annual` where the bundle says `yearly` — the schema's value, the bundle's
 * label (DECISIONS Q20).
 */
export const WIZARD_CADENCES = ['once', 'weekly', 'monthly', 'quarterly', 'annual', 'custom'] as const
export type WizardCadence = (typeof WIZARD_CADENCES)[number]
export const CADENCE_KEY: Record<WizardCadence, { chip: string; sentence: string }> = {
  once: { chip: 'cadenceOnce', sentence: 'cadenceOnceLower' },
  weekly: { chip: 'cadenceWeekly', sentence: 'cadenceWeeklyLower' },
  monthly: { chip: 'cadenceMonthly', sentence: 'cadenceMonthlyLower' },
  quarterly: { chip: 'cadenceQuarterly', sentence: 'cadenceQuarterlyLower' },
  annual: { chip: 'cadenceAnnual', sentence: 'cadenceAnnualLower' },
  custom: { chip: 'cadenceCustom', sentence: 'cadenceCustomLower' },
}

/** The wizard's four steps, in order (HeiTuva.dc.html:3494). */
export const WIZARD_STEPS = ['stepPurpose', 'stepQuestions', 'stepRecipients', 'stepCadence'] as const

/** The count slider's range (HeiTuva.dc.html:78). */
export const WIZARD_COUNT_MIN = 2
export const WIZARD_COUNT_MAX = 7
