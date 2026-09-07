/**
 * The shapes the Phase 4 RPCs return.
 *
 * These are hand-written rather than inferred because every one of the RPCs
 * returns `jsonb`, which the generated types flatten to `Json`. Writing the
 * union out here is what makes the k gate visible in TypeScript: a cell is
 * EITHER a number or a refusal, and there is no third state where `avg` is
 * present but meaningless. Code that reads `cell.avg` without narrowing does
 * not compile, which is the point — CLAUDE.md's "never fabricate data in the
 * UI" is easiest to obey when the type will not let you.
 */

/** Present on every payload whose RPC refused the caller outright. */
export type Refusal = { error: string }

export const isRefusal = (v: unknown): v is Refusal =>
  typeof v === 'object' && v !== null && typeof (v as Refusal).error === 'string'

/** A value the k gate withheld. It carries NO count — see migration 0013. */
export type Gated = { insufficient_data: true }

export const isGated = (v: unknown): v is Gated =>
  typeof v === 'object' && v !== null && (v as Gated).insufficient_data === true

// --- get_heatmap -------------------------------------------------------------
export type HeatCol = { question_id: string; survey_id: string; text: string; type: string }
export type HeatCell = { question_id: string } & ({ n: number; avg: number } | Gated)
export type HeatRow = { group_id: string; label: string; cells: HeatCell[] }
export type Heatmap = { k: number; org_id: string; cols: HeatCol[]; rows: HeatRow[] }

// --- get_trends --------------------------------------------------------------
export type TrendPoint = {
  round_id: string
  round_no: number
  opens_at: string | null
  closes_at: string | null
  status: string
  /**
   * DECISIONS Q49 (V1-6). `n` sits OUTSIDE the union, which is what makes a
   * trend point different from every other cell in this file: how many people
   * took part is participation, and participation survives the threshold
   * (Q28 — the line is the subject of the number, not its size). `avg` is
   * derived from what those people said, so `avg` is what the union gates.
   *
   * It is the count of RESPONSES to the round, not of people who answered a
   * scale question — one meaning of `n` across `results_summary`,
   * `overview_activity` and here (M:0053). The gate still reads the other
   * count, which is emitted nowhere.
   */
  n: number
} & ({ avg: number } | Gated)
export type Trends = { k: number; survey_id: string; points: TrendPoint[] }

// --- get_themes --------------------------------------------------------------
export type Theme = { key: string; label: string; mentions: number; contributors: number }
export type Themes = {
  k: number
  survey_id: string
  themes: Theme[]
  contributors?: number
  insufficient_data?: true
}

// --- get_benchmarks ----------------------------------------------------------
/** How to draw the bar: a 1–5 mean, an eNPS score (−100…100), or a 0–1 rate. */
export type BenchScale = 'score_5' | 'enps' | 'rate' | 'raw'
export type BenchRow = {
  metric_key: string
  scale: BenchScale
  bench: number
  source: string
  /** Participation metrics carry these; result metrics do not. */
  invited?: number
  responded?: number
} & ({ mine: number | null; n?: number } | Gated)
export type Benchmarks = { k: number; survey_id: string; industry: string; rows: BenchRow[] }

// --- results_summary ---------------------------------------------------------
export type TeamRow = { group_id: string; label: string } & ({ n: number; avg: number } | Gated)
export type PrevRound = { round_id: string; round_no: number } & ({ n: number; avg: number } | Gated)

/**
 * An insight is a FACT, never a sentence: the RPC returns a key, a tone and the
 * subject's id, and the Norwegian is composed by next-intl in the component.
 * Two reasons, and both matter. CLAUDE.md forbids user-facing text outside
 * next-intl; and prose assembled in SQL is prose no per-cell assertion can
 * audit, which is exactly how a gated team's score would reach the screen.
 */
export type Insight = {
  key: 'low_question' | 'split_question' | 'strong_question' | 'low_response_rate'
  tone: 'warn' | 'good' | 'note'
  question_id?: string
  value: number
}
export type ResultsSummary = {
  k: number
  survey_id: string
  round_id: string | null
  group_id: string | null
  n: number
  invited: number
  responded: number
  completion: number | null
  avg: number | null
  teams: TeamRow[]
  prev: PrevRound | null
  delta: number | null
  insights: Insight[]
}

// --- aggregate_results -------------------------------------------------------
export type Distribution = { value: string; count: number }
export type QuestionResult = {
  question_id: string
  type: string
  text: string
} & (
  | { n: number; distribution: Distribution[]; avg: number | null; insufficient_data?: undefined }
  | ({ n: null } & Gated)
)
export type Aggregate = {
  survey_id: string
  group: string | null
  k: number
  questions: QuestionResult[]
}

// --- get_quotes --------------------------------------------------------------
export type Quotes =
  | { n: number; theme: string | null; quotes: { text: string }[] }
  | ({ n: null; k: number } & Gated)

// --- dashboard_summary -------------------------------------------------------
export type Driver = {
  question_id: string
  survey_id: string
  text: string
  type: string
  n: number
  avg: number
}
export type DashboardSummary = {
  k: number
  org_id: string
  surveys: { id: string; title: string; status: string }[]
  n: number
  invited: number
  responded: number
  completion: number | null
  avg: number | null
  drivers: Driver[]
}

// --- attributed_results ------------------------------------------------------
/**
 * The UNGATED path (Q17 §5, migration 0034). There is no `Gated` anywhere in
 * this shape and that is deliberate: `app.k_for` returns 0 for an organisation
 * survey, so every row is shown with the respondent's name. The gate that
 * matters here is WHO may call it — administrator and redaktør only (Q43) —
 * not which cells come back.
 */
export type AttributedStatus = 'svart' | 'paaminnet' | 'ikke_svart'

export type AttributedAnswer = {
  question_id: string
  value: unknown
  comment: string | null
}

export type AttributedRow = {
  invitation_id: string
  name: string | null
  email: string | null
  round_id: string
  status: AttributedStatus
  responded_at: string | null
  answers: AttributedAnswer[] | null
}

export type AttributedQuestion = { id: string; type: string; text: string }

export type Attributed = {
  survey_id: string
  title: string
  respondent_kind: string
  /** Always 0 — the magic value that means "no threshold", not "threshold zero". */
  k: 0
  invited: number
  responded: number
  /** Answers with no invitation behind them. Should be 0 on an attributed survey. */
  unattributed: number
  questions: AttributedQuestion[]
  rows: AttributedRow[]
}
