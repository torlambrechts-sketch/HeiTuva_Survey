/**
 * The composed document, exactly as `compose_report` returns it.
 *
 * Nothing in the editor derives a number that is not in here. The RPC decides
 * what may be shown — per-cell gate, complementary suppression, cross-section
 * residual — and the client's only job is to render its answer. A component
 * that recomputed an average or a total from parts would be a second gate with
 * different rules, which is how the first one stops being the gate.
 */
export type ComposedRow = {
  group_id: string | null
  label: string | null
  n: number | null
  avg: number | null
  suppressed: boolean
}

export type ComposedCell = {
  question_id: string
  type?: string
  text?: string
  n: number | null
  avg: number | null
  insufficient_data?: boolean
  distribution?: { value: string; count: number }[]
}

/**
 * Whatever the section's own composer returned. Each section type has its own
 * shape — trend has rounds, themes has themes, participation has counts — and
 * they are not interchangeable. Before this existed every non-partition section
 * rendered the same question list, so "Utvalgte sitater" showed scale averages.
 */
/**
 * One offered quote, as `quote_candidates` returns it: an opaque answer id and
 * the text. No author, no group, no timestamp, no `response_id` — two ids
 * cannot be joined back into one person's answers.
 */
export type QuotePick = {
  answer_id: string
  question_id: string
  text: string
}

export type SectionExtra = {
  findings?: { key?: string; text?: string; tone?: string; value?: number }[]
  points?: { round_id: string; round_no: number; n?: number | null; avg?: number | null }[]
  themes?: { label: string; count: number; contributors?: number }[]
  drivers?: { question_id: string; text: string; avg?: number | null; rank?: string }[]
  invited?: number
  responded?: number
  completion?: number | null
  /** The quotes section, resolved from stored ids under the k-gate at render. */
  quotes?: { answer_id: string; text: string }[]
  /** False when nothing is picked and the design's first-three fallback ran. */
  picked?: boolean
  /** Picks the gate refused this render. Said out loud, not silently dropped. */
  withheld?: number
}

export type ComposedSection = {
  key: string
  source: 'live' | 'snapshot'
  snapshot_id: string | null
  /** No composer yet. Says so instead of borrowing another section's numbers. */
  pending?: boolean
  scope: { group: string | null; rounds: string[] }
  rows: ComposedRow[] | null
  cells: ComposedCell[] | null
  extra?: SectionExtra | null
}

export type ComposedDocument = {
  error?: string
  /** Set when the document came from a published report's frozen snapshot. */
  frozen_at?: string
  snapshot_id?: string
  report_id?: string
  title?: string
  k?: number
  role?: string | null
  via?: 'member' | 'share'
  share_scope?: 'ledelse' | 'ledere_eget_team' | 'alle_ansatte'
  org_name?: string
  scope?: { surveys: string[]; rounds: string[]; group: string | null }
  sections?: ComposedSection[]
  suppressed_groups?: string[]
}

export type EditorReport = {
  id: string
  title: string
  status: string
  baseTemplate: string | null
  sections: string[]
  filters: {
    surveys: string[]
    rounds: string[]
    group: string | null
    sectionGroups?: Record<string, string | null>
  }
  shareScope: 'ledelse' | 'ledere_eget_team' | 'alle_ansatte'
  cadence: 'none' | 'weekly' | 'monthly' | 'round'
}

export type EditorOptions = {
  /** Every section the registry knows, in registry order — the Innhold list. */
  sectionTypes: { key: string; label: string; description: string; supportsGroupFilter: boolean }[]
  groups: { id: string; name: string }[]
  surveys: { id: string; title: string; status: string; responses: number }[]
  orgName: string
}
