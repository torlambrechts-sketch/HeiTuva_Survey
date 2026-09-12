/**
 * The integration catalogue the bundle draws, and what is true of each row.
 *
 * ── WHY THE OTHER THIRTEEN ARE «IKKE TILGJENGELIG» AND NOT «IKKE TILKOBLET» ──
 *
 * The bundle lists fourteen connectors and marks four of them «Tilkoblet» from a
 * literal in its own fixture. Three of those four — an HR system, Teams and
 * Brønnøysund — do not exist in any form; the fourth, Entra, exists as of I1-2.
 *
 * The instruction says: do not build a connection status that is not read from a
 * connection. It does not say to delete the catalogue, and deleting it would
 * lose what the screen is FOR — the customer's question is «what can this thing
 * talk to», and the honest answer includes «not yet».
 *
 * But «Ikke tilkoblet» beside a «Koble til» button is a promise: it says you
 * could connect this today. **«Ikke tilgjengelig», with the control disabled, is
 * the true state** — and it is the same treatment V2-3a gave Målgrupper's
 * unavailable cards and D160 gave «Lag oppgave». Logged as D163.
 *
 * The API-nøkkel and Webhooks cards the bundle draws beside this list are NOT
 * built at all: Q89 decided the public API and webhooks are not built, and the
 * bundle renders a fabricated key (`ht_live_9f2c··············a41`) and a
 * fabricated rotation date («Sist rotert 12. mars 2026») for a capability that
 * does not exist. Rendering them disabled would still advertise them.
 */
export type ConnectorRow = {
  key: string
  /** `true` only for a connector this product has actually built. */
  built: boolean
  level: 'lovpalagt' | 'niva1' | 'niva2' | 'niva3'
}

export type ConnectorGroup = { key: string; rows: ConnectorRow[] }

/**
 * KEYS ONLY. Every user-facing string — the group title, the connector name, its
 * description and its «Henter» line — lives in `messages/{no,en}.json` under
 * `integrations.*`, because this is copy and copy is never hard-coded.
 *
 * `verify:i18n` caught the first version of this file rendering Norwegian on the
 * English page, which is Q129's shape exactly: a registry of Norwegian strings
 * rendered straight to screen. The gate named `admin.mgFieldStillingsprosent`
 * — a message from a DIFFERENT screen whose value happened to collide with the
 * word in my hard-coded row — which is row 12 of CLAUDE.md's table working
 * exactly as described: a detector that identifies a defect by matching known
 * strings can only report the defects that collide with one.
 */
export const CATALOGUE: ConnectorGroup[] = [
  { key: 'users', rows: [
    { key: 'entra', built: true, level: 'niva1' },
    { key: 'google', built: false, level: 'niva1' },
  ] },
  { key: 'hr', rows: [
    { key: 'hrsystem', built: false, level: 'niva1' },
    { key: 'payroll', built: false, level: 'lovpalagt' },
    { key: 'absence', built: false, level: 'niva2' },
  ] },
  { key: 'messaging', rows: [
    { key: 'teams', built: false, level: 'niva1' },
    { key: 'slack', built: false, level: 'niva1' },
    { key: 'calendar', built: false, level: 'niva3' },
  ] },
  { key: 'signing', rows: [
    { key: 'bankid', built: false, level: 'lovpalagt' },
    { key: 'archive', built: false, level: 'niva2' },
  ] },
  { key: 'supplier', rows: [
    { key: 'brreg', built: false, level: 'niva3' },
    { key: 'sanctions', built: false, level: 'niva3' },
    { key: 'crm', built: false, level: 'niva3' },
    { key: 'bi', built: false, level: 'niva2' },
  ] },
]

export type ConnectionRow = {
  configured: boolean | null
  token_prefix: string | null
  created_at: string | null
  revoked_at: string | null
  last_used_at: string | null
  last_error: string | null
  last_error_at: string | null
  consecutive_errors: number | null
  members_from_directory?: number | null
}

export type EntraState = {
  status: 'connected' | 'needs_setup' | 'failing' | 'absent'
  prefix: string | null
  createdAt: string | null
  lastUsedAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  errors: number
}

/**
 * THE FOUR STATES, AND WHY «FAILING» IS ONE OF THEM.
 *
 * The bundle has three — Tilkoblet, Trenger oppsett, Ikke tilkoblet — and none
 * of them can say «this connector has been erroring since Tuesday». A connector
 * that stops syncing looks identical to a customer with no staff changes, and
 * the first sign would be a survey that reaches nobody. That is the failure I1-2
 * is built to make loud, so it needs a state of its own (D163).
 */
export function connectorState(row: ConnectionRow | null): EntraState {
  const base = {
    prefix: row?.token_prefix ?? null,
    createdAt: row?.created_at ?? null,
    lastUsedAt: row?.last_used_at ?? null,
    lastError: row?.last_error ?? null,
    lastErrorAt: row?.last_error_at ?? null,
    errors: Number(row?.consecutive_errors ?? 0),
  }
  if (!row?.configured || row.revoked_at) return { ...base, status: 'absent' }
  if (base.errors > 0) return { ...base, status: 'failing' }
  // A token that exists and has never been used is a token the customer has
  // pasted nowhere yet. «Tilkoblet» would be a claim about the OTHER end of a
  // connection this product has never heard from.
  if (!base.lastUsedAt) return { ...base, status: 'needs_setup' }
  return { ...base, status: 'connected' }
}

/** How many connectors are ACTUALLY live. The bundle counted a literal. */
export function activeCount(entra: EntraState): number {
  return entra.status === 'connected' ? 1 : 0
}
