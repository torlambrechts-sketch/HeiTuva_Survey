/**
 * T7 · v8:881-897 — WHAT «LIVE-INNSTILLINGER» ACTUALLY IS FOR US.
 *
 * v8 draws ten switches (`liveToggles`, v8:10252-10262) over a state object
 * `st.liveOn || DEFAULT_LIVE`. Tor's rule for this phase is explicit: **no
 * toggle without a value it actually writes.** Measured against the product,
 * that rule removes every one of the ten:
 *
 *   `surveys` has no live-options column — the jsonb it does have is `engage`,
 *   whose fifteen keys are the engagement settings and name none of these.
 *   `live_sessions` has eleven columns and the only boolean is `revealed`,
 *   which is the CURRENT reveal state of a running session, not a setting on
 *   the survey. There is no per-survey live storage anywhere.
 *
 * So the card ships with **no switches at all**, and what it carries instead is
 * the thing the ten labels are actually evidence of: which of these the live
 * stage does, and which of them do not exist. Two states, and they are not the
 * same absence —
 *
 *   `always`  the stage does this in every session and there is no switch to
 *             turn it off. Saying «off» would be a switch with no off state.
 *   `absent`  not built. Named rather than dropped, for the reason
 *             `help_articles.requires_flag` states and `QuizPanel` already
 *             applies: a reader must be able to tell *not built* from *not
 *             there*.
 *
 * ── WHY THIS IS A REGISTRY AND NOT TEN LINES OF JSX ────────────────────────
 *
 * `live/page.tsx` already carries a table of the same measurement, written by
 * V2-9 for the stage. Two prose tables about one set of facts is F3's
 * four-implementations shape waiting to happen — they agree today and nothing
 * makes them. Each entry here names a `file:symbol` a reader can open, and
 * `tests/unit/live-features.test.ts` OPENS it, so a claim that stops being
 * true fails a test rather than sitting in a comment.
 *
 * An `absent` entry carries the evidence that it is absent where one exists —
 * the stage's own unavailable copy — and `null` where the feature is simply
 * nowhere, which is itself checked: the test asserts the key appears in no
 * source file under `app/` or `lib/`.
 */
export type LiveFeatureState = 'always' | 'absent'

export type LiveFeature = {
  /** v8's own key, v8:10252-10262 — the order is the drawing's. */
  key: string
  state: LiveFeatureState
  /** `path:symbol`, or null when nothing in the product names this at all. */
  evidence: string | null
  /**
   * The `builder` message key, SPELLED OUT rather than concatenated from
   * `key`. A key assembled at render time that misses renders as a raw key on
   * a shipped screen — the defect Tor found nine of behind seventeen green
   * gates — and `tests/unit/live-features.test.ts` resolves every one of
   * these against both locales.
   */
  labelKey: string
  /** Only an `always` entry has one; see `LivePanel` for why. */
  descKey: string | null
}

export const LIVE_FEATURES: readonly LiveFeature[] = [
  {
    key: 'fullscreen',
    labelKey: 'liveFullscreen',
    descKey: null,
    state: 'absent',
    // The stage already says so in words; Q81/Q82 do not arise because no
    // bundle draws a projected surface. See `live/page.tsx`'s table.
    evidence: 'app/(app)/undersokelser/[id]/live/LiveStage.tsx:fullscreenUnavailable',
  },
  {
    key: 'qr',
    labelKey: 'liveQr',
    descKey: 'liveQrDesc',
    state: 'always',
    evidence: 'app/(app)/undersokelser/[id]/live/LiveStage.tsx:qrSvg',
  },
  {
    key: 'counter',
    labelKey: 'liveCounter',
    descKey: 'liveCounterDesc',
    state: 'always',
    evidence: 'app/(app)/undersokelser/[id]/live/LiveStage.tsx:counterHidden',
  },
  {
    key: 'manualReveal',
    labelKey: 'liveManualReveal',
    descKey: 'liveManualRevealDesc',
    state: 'always',
    // `live_sessions.revealed` is written by this action and by nothing else,
    // and there is no automatic path — the presenter's press IS the reveal.
    evidence: 'app/(app)/undersokelser/[id]/live/actions.ts:setRevealed',
  },
  {
    key: 'liveChart',
    labelKey: 'liveLiveChart',
    descKey: 'liveLiveChartDesc',
    state: 'always',
    evidence: 'app/(app)/undersokelser/[id]/live/LiveStage.tsx:barsGated',
  },
  {
    key: 'cloud',
    labelKey: 'liveCloud',
    descKey: 'liveCloudDesc',
    state: 'always',
    evidence: 'app/(app)/undersokelser/[id]/live/LiveStage.tsx:cloudTitle',
  },
  { key: 'countdown', state: 'absent', evidence: null, labelKey: 'liveCountdown', descKey: null },
  {
    key: 'questions',
    labelKey: 'liveQuestions',
    descKey: null,
    state: 'absent',
    // Q80, confirmed defaulted — `audienceQuestions` is already off in the
    // bundle and ships unimplemented. `live/page.tsx` carries the row.
    evidence: 'app/(app)/undersokelser/[id]/live/page.tsx:Deltakerspørsmål',
  },
  { key: 'temp', state: 'absent', evidence: null, labelKey: 'liveTemp', descKey: null },
  {
    key: 'closing',
    labelKey: 'liveClosing',
    descKey: null,
    state: 'absent',
    // `closingLines` are announcements a presenter writes. Nothing in the
    // schema holds them.
    evidence: 'app/(app)/undersokelser/[id]/live/page.tsx:Kunngjøringsskjerm',
  },
]

/** The drawing's order, kept, so the card reads as v8's list does. */
export const liveFeaturesIn = (state: LiveFeatureState): readonly LiveFeature[] =>
  LIVE_FEATURES.filter((f) => f.state === state)
