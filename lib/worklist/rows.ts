import { TASK_STEPS, isLate, stepIndex, type TaskStatus } from '@/lib/tasks/lifecycle'

/**
 * THE UNIFIED ROW MODEL — v5:3252-3350, and the reason V5-2 replaces a screen
 * instead of extending one.
 *
 * C4 drew two panels, `showTasks` and `showFeedback`, each with its own list,
 * its own filters and its own empty state. v5 draws ONE list whose rows carry
 * `r.isTask` / `r.isFb` and are sorted and grouped together. Those two shapes
 * do not compose: the buckets, the board columns and the select-all checkbox
 * are all properties of the COMBINED list, and none of them can be computed
 * inside either panel.
 *
 * Everything derivable is derived here, as pure functions over the real
 * columns, so it can be tested without a browser and so the list and its
 * counters cannot disagree about what a bucket means.
 *
 * ── TWO PLACES THE BUNDLE'S OWN MAPPING IS NOT TRUE OF OUR DATA ────────────
 *
 * Recorded as decisions rather than quietly matched, and both are the same
 * mistake in the drawing: FOUR NAMES USED FOR FIVE STATES, with the surplus
 * state pushed into whichever name was closest.
 *
 * 1. **The buckets.** `bucketOf` (v5:6982) reads
 *    `/om 7|i dag|sep/.test(it.due)` — a regex over a FORMATTED STRING, which
 *    is what a prototype with no dates does — and puts an unhandled comment in
 *    «Denne uken». A comment has no deadline: aml. § 4-3 puts no clock on one.
 *    «Denne uken» on a row with no date is a claim about when it is due, and we
 *    do not render values that look like data (CLAUDE.md, never fabricate).
 *    So there is a fifth bucket, **«Uten frist»**, and it holds both the rows
 *    that genuinely have no deadline: an unhandled comment, and a task whose
 *    `due_at` is null. The bundle files the latter under «Senere», which is
 *    also a temporal claim about a row that carries no date — same fix, so both
 *    go to the same place rather than one each.
 *
 * 2. **The board columns.** `inboxColumn` (v5:6199) maps six lifecycle states
 *    onto four columns with `i === 3 ? 2 : 3`, which puts `effektvurdert`
 *    under «Lukket». **That is the one distinction Q69 exists to protect**: a
 *    task whose effect has been assessed is ready to close and is not closed,
 *    and aml. § 3-1 / ldl. § 26 fjerde ledd are about exactly that gap. So
 *    there is a fifth column carrying the lifecycle's own word,
 *    «Effektvurdert» — no invented copy, `taskStepEffektvurdert` already
 *    exists — and the board's grid is
 *    `repeat(auto-fit,minmax(210px,1fr))`, which renders five as readily as
 *    four.
 */

/** What the row is about. `comment` rather than `feedback` because that is the
 *  table's name, and the two words drifting apart is how a reader ends up
 *  looking for the wrong one. */
export type WorklistKind = 'task' | 'comment'

/** The fields the derivations need — deliberately the minimum, so a caller
 *  cannot pass a whole row and have a derivation quietly depend on a field
 *  nobody declared. */
export type WorklistFacts = {
  kind: WorklistKind
  /** Tasks only. */
  status: TaskStatus | null
  dueAt: string | null
  hasLaw: boolean
  mine: boolean
  /** Comments only. */
  handled: boolean
}

export const WORKLIST_BUCKETS = [
  'over-frist',
  'denne-uken',
  'senere',
  'uten-frist',
  'avsluttet',
] as const
export type WorklistBucket = (typeof WORKLIST_BUCKETS)[number]

export const BUCKET_KEY: Record<WorklistBucket, string> = {
  'over-frist': 'wlBucketLate',
  'denne-uken': 'wlBucketWeek',
  senere: 'wlBucketLater',
  'uten-frist': 'wlBucketNoDue',
  avsluttet: 'wlBucketDone',
}

export const BUCKET_TINT: Record<WorklistBucket, string> = {
  // v5:3005 — `b === 0 ? var(--ac3) : b === 3 ? #E4F2E0 : var(--sf2)`. The two
  // added buckets take the neutral tint the bundle gives every middle bucket.
  'over-frist': 'var(--ac3)',
  'denne-uken': 'var(--sf2)',
  senere: 'var(--sf2)',
  'uten-frist': 'var(--sf2)',
  avsluttet: '#E4F2E0',
}

/** «Denne uken» is seven days, counted from the start of today so that a
 *  deadline later today is in it and yesterday's is not — the same boundary
 *  `isLate` uses, and taken from the same place rather than recomputed. */
const DAY = 24 * 60 * 60 * 1000

export function bucketOf(r: WorklistFacts, now: Date = new Date()): WorklistBucket {
  if (r.kind === 'comment') return r.handled ? 'avsluttet' : 'uten-frist'
  if (r.status === 'lukket') return 'avsluttet'
  if (r.dueAt === null) return 'uten-frist'
  if (isLate(r.dueAt, r.status ?? 'foreslatt', now)) return 'over-frist'
  const start = new Date(now.toDateString()).getTime()
  return new Date(r.dueAt).getTime() <= start + 7 * DAY ? 'denne-uken' : 'senere'
}

export const bucketOrder = (b: WorklistBucket): number => WORKLIST_BUCKETS.indexOf(b)

export const WORKLIST_COLUMNS = [
  'nytt',
  'pagar',
  'til-effektvurdering',
  'effektvurdert',
  'avsluttet',
] as const
export type WorklistColumn = (typeof WORKLIST_COLUMNS)[number]

export const COLUMN_KEY: Record<WorklistColumn, string> = {
  nytt: 'wlColNew',
  pagar: 'taskStepPagar',
  'til-effektvurdering': 'wlColAwaitEffect',
  effektvurdert: 'taskStepEffektvurdert',
  avsluttet: 'wlBucketDone',
}

export const COLUMN_TINT: Record<WorklistColumn, string> = {
  // v5:3357 — Nytt/Pågår/Til effektvurdering/Lukket carry ac3, sbg, ac2,
  // #E4F2E0. The added column sits between the last two and takes sf2.
  nytt: 'var(--ac3)',
  pagar: 'var(--sbg)',
  'til-effektvurdering': 'var(--ac2)',
  effektvurdert: 'var(--sf2)',
  avsluttet: '#E4F2E0',
}

export function columnOf(r: WorklistFacts): WorklistColumn {
  if (r.kind === 'comment') return r.handled ? 'avsluttet' : 'nytt'
  switch (r.status) {
    case 'foreslatt':
    case 'besluttet':
      return 'nytt'
    case 'pagar':
      return 'pagar'
    case 'gjennomfort':
      return 'til-effektvurdering'
    case 'effektvurdert':
      return 'effektvurdert'
    case 'lukket':
      return 'avsluttet'
    default:
      // A status the enum gained and this function was not taught. Loud rather
      // than silently filed under «Nytt» — the same reasoning as
      // app.member_blocks_invitation's else branch (M:0108).
      throw new Error(`worklist columnOf: unknown task status ${String(r.status)}`)
  }
}

/** v5:3178-3181 — «Alle · Mine · Over frist · Lovpålagt · Ubehandlet». */
export const WORKLIST_SCOPES = ['alle', 'mine', 'frist', 'lov', 'nye'] as const
export type WorklistScope = (typeof WORKLIST_SCOPES)[number]

export const SCOPE_KEY: Record<WorklistScope, string> = {
  alle: 'taskFilterAlle',
  mine: 'taskFilterMine',
  frist: 'taskFilterFrist',
  lov: 'taskFilterLov',
  nye: 'wlScopeOpen',
}

/**
 * Three of the five scopes are properties only a task has, and the bundle
 * agrees — it sets `mine:false`, `late:false` and `law:""` on every feedback
 * row. So a comment is EXCLUDED by those three rather than passed through:
 * «Mine» listing rows nobody owns would be a filter that does not filter.
 */
export function matchesScope(r: WorklistFacts, scope: WorklistScope): boolean {
  switch (scope) {
    case 'alle':
      return true
    case 'mine':
      return r.kind === 'task' && r.mine
    case 'frist':
      return r.kind === 'task' && isLate(r.dueAt, r.status ?? 'foreslatt')
    case 'lov':
      return r.kind === 'task' && r.hasLaw
    case 'nye':
      return r.kind === 'comment' ? !r.handled : r.status !== 'lukket'
  }
}

/** v5:3173-3176 — «Alle · Oppgaver · Tilbakemeldinger», C4's own rail, kept. */
export const WORKLIST_TYPES = ['alle', 'oppgaver', 'tilbakemeldinger'] as const
export type WorklistType = (typeof WORKLIST_TYPES)[number]

export const TYPE_KEY: Record<WorklistType, string> = {
  alle: 'tfAll',
  oppgaver: 'tfTasks',
  tilbakemeldinger: 'tfFeedback',
}

/**
 * The screen's own heading, which follows the type filter.
 *
 * Tor, 2026-09-13: the surface is «Handlinger», and the heading says which part
 * of it you are looking at — «Handlinger» under «Alt», «Tilbakemeldinger» under
 * «Tilbakemeldinger», «Oppgaver» under «Oppgaver». A heading that stays
 * «Oppgaver» while the list shows comments is the same untruth Q123 refused
 * when v4 wanted to shorten the nav label: it promises less than the page
 * delivers, on the half of the content that is not a task.
 *
 * A `Record<WorklistType, …>` rather than a ternary at the call site, so a
 * fourth type cannot be added without tsc demanding a heading for it — the same
 * reason `TYPE_KEY` above is a record.
 */
export const TYPE_TITLE_KEY: Record<WorklistType, string> = {
  alle: 'wlTitleAll',
  oppgaver: 'wlTitleTasks',
  tilbakemeldinger: 'wlTitleFeedback',
}

export function matchesType(r: WorklistFacts, type: WorklistType): boolean {
  return type === 'alle' ? true : type === 'oppgaver' ? r.kind === 'task' : r.kind === 'comment'
}

/**
 * The progress bar (v5:3256), and the one number in the row that is real.
 *
 * For a task it is the step reached over the six the register defines. For a
 * comment the bundle renders `handled ? 100 : 20` — and **20 is an invented
 * denominator over an unknown numerator**, which is the never-fabricate rule's
 * own example. A comment has no progress, so it gets no bar: `null`, rendered
 * as nothing.
 */
export function progressPercent(r: WorklistFacts): number | null {
  if (r.kind !== 'task' || r.status === null) return null
  return Math.round(((stepIndex(r.status) + 1) / TASK_STEPS.length) * 100)
}

/** v5:3257 — the bar's colour, and it says the same thing the status chip says
 *  rather than a second thing. */
export function progressTint(r: WorklistFacts): string {
  if (r.status === 'lukket') return 'var(--ac2)'
  if (isLate(r.dueAt, r.status ?? 'foreslatt')) return 'var(--ac3)'
  return 'var(--ac)'
}
