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

/**
 * One row of the list, as the PAGE assembles it.
 *
 * F4 — moved here from `SurveyRow.tsx`, which is deleted: the single row the
 * app had is replaced by three views (`SurveyTable`, `SurveyCards`,
 * `SurveyDetail`), all reading `lib/surveys/list-row.ts`. The shape survives
 * because the page still assembles it once and hands the pieces on; only the
 * component that rendered it is gone, and its menu moved to `RowMenu.tsx`
 * rather than being dropped with it.
 */
export type SurveyListItem = {
  id: string
  title: string
  audience: string | null
  status: SurveyStatus
  scope: ShareScope
  target: number | null
  questionCount: number
  responseCount: number
  editorCount: number
  createdAt: string
  updatedAt: string
  /** Q17 — the share panel's «bare der minst {k} har svart» line. */
  kThreshold: number
  respondentKind: 'person' | 'organisation'
  /** Whether the series is paused, so the menu knows which verb to offer. */
  schedulePaused: boolean
}
export type ShareScope = Database['public']['Tables']['surveys']['Row']['results_scope']

/**
 * The status filters, in the drawing's order — **FOUR since F3** (v6:8634:
 * `Alle · Aktive · Utkast · Lukket`).
 *
 * «Lukket» was missing, and it is the fourth row of CLAUDE.md's table: three
 * was a count of the chips that existed when the line was written, not a
 * property of the status set. `surveys.status` has had `lukket` since Phase 0
 * and the list could not be filtered to it.
 *
 * They render in the SHELL now, not in the page — v6 draws them in the subnav
 * strip and `AppSubnav` builds its pills from this registry, so a fifth status
 * arrives with its label wired or not at all.
 */
export const FILTERS = ['alle', 'aktiv', 'utkast', 'lukket'] as const
export type Filter = (typeof FILTERS)[number]
export const FILTER_KEY: Record<Filter, string> = {
  alle: 'filterAll',
  aktiv: 'filterActive',
  utkast: 'filterDraft',
  lukket: 'filterClosed',
}

/** The filter chips name statuses in Norwegian; `alle` matches everything. */
export const FILTER_STATUS: Record<Filter, SurveyStatus | null> = {
  alle: null,
  aktiv: 'aktiv',
  utkast: 'utkast',
  lukket: 'lukket',
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

/* F3 — `responsePct` LIVED HERE AND HAD NO CALLER, while two comments cited
   it as «the treatment every row gets». Measured:
   `grep -rn responsePct . --include=*.ts --include=*.tsx` returned its own
   definition and two mentions of it in prose, and nothing else.

   That is the same shape as F1 one level down — a rule believed to have one
   definition, having two live ones (this and `pctOf` in page.tsx) and a third
   nobody called. The row rate is `rowRate` in `lib/surveys/participation.ts`
   now, beside `rateOf`, so the row and the headline above it cannot round or
   cap differently. */

/**
 * RETIRED by DECISIONS Q44 (V1-5). The wizard offered six hand-picked pack
 * keys; it now offers the first six packs of the USE CASE chosen in step 0
 * (NEW:4195-4197), read from `use_cases` and `template_packs` in
 * `undersokelser/ny/page.tsx`.
 *
 * The list is gone rather than kept unused, because the failure it had is the
 * one this project keeps removing: a hand-maintained menu beside a table that
 * grows. Five packs were added in the same phase that retired it, and none of
 * them could have appeared in the wizard.
 */

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
