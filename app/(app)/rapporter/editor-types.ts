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

export type ComposedSection = {
  key: string
  source: 'live' | 'snapshot'
  snapshot_id: string | null
  scope: { group: string | null; rounds: string[] }
  rows: ComposedRow[] | null
  cells: ComposedCell[] | null
}

export type ComposedDocument = {
  error?: string
  report_id?: string
  title?: string
  k?: number
  role?: string | null
  via?: 'member' | 'share'
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
