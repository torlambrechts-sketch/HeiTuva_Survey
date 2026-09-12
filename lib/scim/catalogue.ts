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

/* ═══════════════════════════════════════════════════════════════════════════
   V5-3 — the Entra detail page (v5:3819-3902), as SHAPES.

   ── THE PAGE IS DRAWN FOR A PULL INTEGRATION AND WHAT EXISTS IS A PUSH ONE ─

   That single fact decides four of the six sections, so it is worth stating
   before the registries rather than beside each one.

   The bundle's model is HeiTuva reaching into Microsoft Graph on a schedule:
   «Sist synkronisert i dag kl. 06:00», «Neste synk i morgen kl. 06:00», three
   Graph READ scopes (`User.Read.All`, `Group.Read.All`,
   `Directory.Read.All`), and a step «Kjør første synk» that takes «ett til to
   minutter for 500 brukere».

   What I1-2 built is SCIM 2.0: **Entra pushes to us.** Measured, not assumed —
   `grep -rln 'graph.microsoft.com\|User.Read.All\|client_credentials' app lib
   supabase scripts` returns NOTHING. There is no Graph client, no client id, no
   consent flow and no scheduler. The credential is a bearer token the customer
   pastes into Entra so that Entra may write to `/api/scim/v2/Users`.

   So:
     * «Neste synk» has no answer HERE and cannot have one. Entra's provisioning
       cycle is configured in Entra (and runs roughly every 40 minutes); this
       product is not told when the next one is. Rendering a time would be the
       never-fabricate rule with a clock instead of a number.
     * «Tillatelser» describes permissions we do not hold. The section is built,
       because the question «what may this thing see» is the right question — but
       it answers it about the token that exists, in the direction it actually
       runs. «HeiTuva skriver aldri tilbake til katalogen» stays, and it is now
       true for a stronger reason than the bundle's: we hold no credential that
       could write to Entra at all.
     * «Grupper i synk» has no source. `ResourceTypes` declares ONE resource —
       `User` — and every path that is not `Users` returns 404, so no group ever
       arrives. `groups.source` and `groups.synced_at` exist (V2-3a added them
       for exactly this) and are NULL on every row: the columns anticipate the
       feature and nothing writes them.
     * «Synklogg» has no history. `scim_credentials` holds the LATEST outcome —
       `last_used_at`, `last_error`, `last_error_at`, `consecutive_errors` — and
       nothing writes a row per sync; no `scim_*` function touches
       `audit_events` (checked against `pg_proc`, all nine of them). So the
       section renders the latest outcome as a status and says one row is all
       there is. **A log TABLE is not built**, and that is a decision rather than
       an omission: a per-sync record of who arrived and who was deactivated is
       personal data about staff changes, which needs a purpose and a retention
       period before it needs a schema.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * What the directory sends and what we do with it.
 *
 * KEYS ONLY — every label and description is a message, for the reason
 * `CATALOGUE` states above it (`verify:i18n` caught the first version of this
 * file rendering Norwegian on the English page).
 *
 * «Ingenting utover dette leses fra katalogen» (v5:3840) is the promise this
 * page makes, and **it must be true of what is built rather than of what is
 * drawn**. So every one of the bundle's eight rows is here, each either with
 * the column it lands in or with the reason it does not — because a row quietly
 * dropped from the list is the same defect as a row quietly implemented.
 */
export type DirectoryField = {
  /** The attribute as the customer sees it in the Entra portal. */
  key: string
  /** The column it lands in — `null` when nothing reads it. */
  column: string | null
  /** Why it is not read. `null` exactly when `column` is set. */
  refusal: 'not_built' | 'self_entered' | 'not_a_trigger' | null
}

/**
 * THREE OF THE BUNDLE'S EIGHT ARE BUILT, plus `externalId`, which the bundle
 * does not draw and which is the join key rather than a fact about the person.
 *
 * **`manager`, `employeeHireDate` and `employeeLeaveDateTime` share ONE refusal
 * and share it on purpose** (Tor, V5-2's decision message): *a directory field
 * DESCRIBES a person; it does not decide what the product does to her.*
 *
 *   * `manager` «Gir leder tilgang til egen enhet» is Q139 under a different
 *     field name — authority derived from a directory attribute.
 *   * `employeeHireDate` «Utløser oppstartssjekk» and `employeeLeaveDateTime`
 *     «Utløser exit-undersøkelse» are a NEW SEND PATH with an external trigger:
 *     a change in the customer's directory would send a survey to a human with
 *     no editor acting, which bypasses every place in this product where
 *     somebody decides WHETHER to ask.
 *
 * The other two are refused for their own reasons, and neither is «no column»:
 *   * `department` «Blir til gruppe i HeiTuva» — the columns for it EXIST
 *     (`groups.source`, `groups.synced_at`, V2-3a) and are null on every row,
 *     and the endpoint serves no `/Groups` resource. Not built, and honestly so.
 *   * `jobTitle` «Brukes i ARP-kartlegging» — `profiles.job_title` exists and is
 *     **the person's own description of herself**, entered on Profil. Writing it
 *     from a directory would overwrite what she wrote about her own job, which
 *     is a worse outcome than not having the field.
 */
export const DIRECTORY_FIELDS: DirectoryField[] = [
  { key: 'displayName', column: 'org_members.name', refusal: null },
  { key: 'userName', column: 'org_members.email', refusal: null },
  { key: 'active', column: 'org_members.status', refusal: null },
  { key: 'externalId', column: 'org_members.external_id', refusal: null },
  { key: 'department', column: null, refusal: 'not_built' },
  { key: 'jobTitle', column: null, refusal: 'self_entered' },
  { key: 'manager', column: null, refusal: 'not_a_trigger' },
  { key: 'employeeHireDate', column: null, refusal: 'not_a_trigger' },
  { key: 'employeeLeaveDateTime', column: null, refusal: 'not_a_trigger' },
]

/** The four steps, rewritten for the direction the integration actually runs.
 *  The bundle's «Gi samtykke — administrator godkjenner de tre
 *  lesetillatelsene» and «Kjør første synk» both describe the pull flow; there
 *  is no consent screen and no run button, because Entra starts provisioning
 *  and Entra decides when. */
export const CONNECT_STEPS = ['token', 'app', 'scope', 'start'] as const

/** What the token can do, in the direction it runs. Not Graph scopes. */
export const TOKEN_CAPABILITIES = ['read', 'write', 'never'] as const
