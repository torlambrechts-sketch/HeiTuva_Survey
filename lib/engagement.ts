/**
 * The engagement settings a survey carries, and the expected-response-rate
 * estimate the Builder shows for them.
 *
 * These live in `surveys.engage` (jsonb, migration 0003) and Phase 3's
 * respondent flow consumes them — `one_question`, `show_progress`,
 * `reveal_results` and `comments` all change how /s/[token] renders, and
 * `personal`, `deadline` and `thank_you` change what the invitation says. That
 * is why the panel belongs to the Builder rather than to Send: it is part of
 * what the survey *is*, not of one delivery of it.
 *
 * Kept out of the component so the estimate is a pure function of the settings
 * and the question count, and can be unit-tested against the design's own
 * arithmetic rather than eyeballed in a screenshot.
 */

export const AUDIENCES = ['ansatte', 'kunder'] as const
export type Audience = (typeof AUDIENCES)[number]

export const INCENTIVES = ['ingen', 'lotteri', 'alle', 'veldedig'] as const
export type Incentive = (typeof INCENTIVES)[number]

export const COMMENT_SCOPES = ['ingen', 'lav', 'alle'] as const
export type CommentScope = (typeof COMMENT_SCOPES)[number]

/**
 * The six switches, in the design's order (HeiTuva.dc.html:3774-3781).
 * Snake_case because that is what the column's default writes; the design's
 * camelCase is prototype-local.
 */
export const ENGAGE_TOGGLES = [
  'personal',
  'deadline',
  'show_progress',
  'one_question',
  'reveal_results',
  'follow_up',
] as const
export type EngageToggle = (typeof ENGAGE_TOGGLES)[number]

export type Engagement = {
  audience: Audience
  incentive: Incentive
  prize: string
  charity: string
  comments: CommentScope
  thank_you: string
  /**
   * G1 — «Hva skjer nå», the thanks screen's first card (v6:5519-5525).
   *
   * The bundle hard-codes it: «Resultatene legges fram i AMU 14. oktober, og
   * lederne får sine tall samme uke» (v6:10078), a literal naming a committee
   * and a date. Nothing could back that, so it is a per-survey field the
   * editor writes — and the default is EMPTY rather than a plausible sentence,
   * because a survey whose editor has not said what happens next has not said
   * what happens next, and inventing one is the fabricated-value rule.
   *
   * Unlike `tasks.shared_with_respondents`, this needs no publication flag:
   * the field is authored FOR the respondent, in a panel that says so. There
   * is no audience to be surprised by.
   */
  next_steps: string
} & Record<EngageToggle, boolean> & { mobile_first: boolean }

/** Mirrors the column default in migration 20260902000003 exactly. */
export const ENGAGEMENT_DEFAULTS: Engagement = {
  audience: 'ansatte',
  incentive: 'ingen',
  prize: '',
  charity: '',
  comments: 'lav',
  personal: true,
  deadline: true,
  show_progress: true,
  reveal_results: true,
  follow_up: false,
  mobile_first: true,
  one_question: true,
  thank_you: 'Takk! Vi deler hva vi gjør med svarene innen to uker.',
  next_steps: '',
}

const isOneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === 'string' && (list as readonly string[]).includes(v)

/**
 * Read the column into a complete object.
 *
 * Every field falls back to its default rather than to undefined: the column is
 * jsonb written by more than one version of this code, and a missing key must
 * not turn a switch into `undefined` — which renders as off and then saves as
 * off, silently changing the survey.
 */
export function parseEngagement(raw: unknown): Engagement {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const bool = (k: EngageToggle | 'mobile_first') =>
    typeof r[k] === 'boolean' ? (r[k] as boolean) : ENGAGEMENT_DEFAULTS[k]
  const str = (k: 'prize' | 'charity' | 'thank_you' | 'next_steps') =>
    typeof r[k] === 'string' ? (r[k] as string) : ENGAGEMENT_DEFAULTS[k]

  return {
    audience: isOneOf(AUDIENCES, r.audience) ? r.audience : ENGAGEMENT_DEFAULTS.audience,
    incentive: isOneOf(INCENTIVES, r.incentive) ? r.incentive : ENGAGEMENT_DEFAULTS.incentive,
    prize: str('prize'),
    charity: str('charity'),
    comments: isOneOf(COMMENT_SCOPES, r.comments) ? r.comments : ENGAGEMENT_DEFAULTS.comments,
    thank_you: str('thank_you'),
    next_steps: str('next_steps'),
    personal: bool('personal'),
    deadline: bool('deadline'),
    show_progress: bool('show_progress'),
    one_question: bool('one_question'),
    reveal_results: bool('reveal_results'),
    follow_up: bool('follow_up'),
    mobile_first: bool('mobile_first'),
  }
}

/**
 * The design's own arithmetic (HeiTuva.dc.html:3801-3809): a 42 % base, a fixed
 * bonus per choice, a 12-point penalty above eight questions, clamped to
 * 10-92 %.
 *
 * Reproduced rather than re-derived. It is an illustrative estimate, not a
 * model — the point is that it moves when the user changes a setting, which is
 * what makes the panel teach anything.
 */
export function expectedResponseRate(e: Engagement, questionCount: number): number {
  let r = 42
  if (e.personal) r += 7
  if (e.deadline) r += 5
  if (e.show_progress) r += 3
  if (e.one_question) r += 4
  if (e.reveal_results) r += 9
  if (e.incentive === 'lotteri') r += 8
  if (e.incentive === 'alle') r += 11
  if (e.incentive === 'veldedig') r += 4
  if (questionCount > 8) r -= 12
  return Math.max(10, Math.min(92, r))
}

/**
 * The incentive warning (HeiTuva.dc.html:3769). Prizes to employees colour the
 * answers; a charity donation does not, so it is excluded — as is "ingen".
 * Customers may be incentivised freely.
 */
export function incentiveWarns(e: Engagement): boolean {
  return e.audience === 'ansatte' && e.incentive !== 'ingen' && e.incentive !== 'veldedig'
}

export const showsPrizeField = (e: Engagement) =>
  e.incentive === 'lotteri' || e.incentive === 'alle'
export const showsCharityField = (e: Engagement) => e.incentive === 'veldedig'
