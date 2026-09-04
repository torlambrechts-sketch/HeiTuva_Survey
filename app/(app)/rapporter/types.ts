/** What the duty card needs, assembled once on the server. */
export type DutyStatus = {
  duty_id: string
  content_hash: string
  checks: { key: string; done: boolean }[]
  signers: {
    role_key: string
    label: string
    member_id: string | null
    signed: boolean
    signed_at: string | null
    /** Signed, but no longer over the content the document now carries. */
    stale: boolean
  }[]
  versions: { id: string; label: string; published_at: string; content_hash: string }[]
} | null

export type DutyCardData = {
  definitionKey: string
  title: string
  law: string
  basis: string
  packKey: string
  checks: { key: string; label: string }[]
  signerRoles: { key: string; label: string; role: string }[]
  /** The law's default. `duties.publish` is the organisation's own choice. */
  registryPublish: boolean
  duty: {
    id: string
    ownerMemberId: string | null
    intervalMonths: number
    reminderWeeks: number
    publish: boolean | null
    nextDueAt: string | null
  } | null
  status: DutyStatus
  linked: { id: string; title: string; status: string }[]
  hasReport: boolean
}

export type ReportTemplate = {
  key: string
  tag: string
  title: string
  description: string
  sections: string[]
}

export type SavedReport = {
  id: string
  title: string
  kind: string
  status: string
  base: string | null
  createdAt: string
  /** What "Del" mints the link at — the report's own audience, not a guess. */
  shareScope: 'ledelse' | 'ledere_eget_team' | 'alle_ansatte'
}
