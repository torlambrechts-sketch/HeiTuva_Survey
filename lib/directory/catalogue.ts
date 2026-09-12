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
  tenant_id: string | null
  scopes: string[] | null
  consented_at: string | null
  last_sync_at: string | null
  last_sync_error: string | null
  last_sync_error_at: string | null
  consecutive_errors: number | null
  members_seen: number | null
  members_with_department: number | null
}

export type EntraState = {
  status: 'connected' | 'needs_setup' | 'failing' | 'absent'
  tenantId: string | null
  scopes: string[]
  consentedAt: string | null
  lastSyncAt: string | null
  lastError: string | null
  lastErrorAt: string | null
  errors: number
  /** The department-coverage numbers from the LAST sync, or null before one. */
  membersSeen: number | null
  membersWithDepartment: number | null
}

/**
 * THE FOUR STATES, AND WHY «FAILING» IS ONE OF THEM.
 *
 * The bundle has three — Tilkoblet, Trenger oppsett, Ikke tilkoblet — and none
 * of them can say «this connector has been erroring since Tuesday». A connector
 * that stops syncing looks identical to a customer with no staff changes, and
 * the first sign would be a survey that reaches nobody. That is the failure the
 * sync is built to make loud, so it needs a state of its own (D163).
 *
 * PULL CHANGES WHAT «needs_setup» MEANS, and it is a better meaning. Under push
 * it was «a token exists and nobody has pasted it anywhere», which was a guess
 * about the other end. Under pull it is **«consent was given and no sync has
 * completed yet»** — a fact about our own side, from our own clock.
 */
export function connectorState(row: ConnectionRow | null): EntraState {
  const base = {
    tenantId: row?.tenant_id ?? null,
    scopes: row?.scopes ?? [],
    consentedAt: row?.consented_at ?? null,
    lastSyncAt: row?.last_sync_at ?? null,
    lastError: row?.last_sync_error ?? null,
    lastErrorAt: row?.last_sync_error_at ?? null,
    errors: Number(row?.consecutive_errors ?? 0),
    membersSeen: row?.members_seen ?? null,
    membersWithDepartment: row?.members_with_department ?? null,
  }
  if (!row?.configured) return { ...base, status: 'absent' }
  if (base.errors > 0) return { ...base, status: 'failing' }
  if (!base.lastSyncAt) return { ...base, status: 'needs_setup' }
  return { ...base, status: 'connected' }
}

/** The count the header chip renders. One connector is built, so this is 0 or 1
 *  and it is READ FROM THE CONNECTION — the bundle's `intConnected` computes 4
 *  from a literal in its own fixture and none of the four exists (D163). */
export function activeCount(entra: EntraState): number {
  return entra.status === 'connected' || entra.status === 'failing' ? 1 : 0
}

/* ═══════════════════════════════════════════════════════════════════════════
   I2-3 — the Entra detail page, CORRECTED FOR PULL.

   V5-3 built this page against a push integration and said so: the drawing
   assumed HeiTuva reaching into Graph on a schedule, and what existed was Entra
   POSTing to us. **I2 made the drawing right.** So four of the six sections that
   rendered their absence now render content, and the ones that still do not are
   fewer and for sharper reasons.

   What changed, section by section, against D166's table:

     * «Neste synk» is A REAL CLOCK now, from the pg_cron schedule, because the
       schedule is ours. It was «Bestemmes i Entra» under push.
     * «Sist synkronisert» is `last_sync_at` — and it means a COMPLETED sync,
       not «Entra called us», because a failed run does not advance it.
     * «Tillatelser» are real Graph scopes again, read back from what the
       administrator actually consented to rather than from what we asked for.
     * The tenant is real and rendered: `entra_connections.tenant_id`, so an
       administrator can confirm they consented for the right directory.
     * «Grupper i synk» is the one the instruction and the build disagree about,
       and the disagreement is the model decision — see DEPARTMENT_IS_THE_AXIS.
     * «Synklogg» is STILL the latest outcome and still not a table. Q162
       stands: a per-sync record of who arrived and who was deactivated is
       personal data about a customer's staff and needs a purpose and a
       retention period before it needs a schema.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * What the directory sends and what we do with it.
 *
 * KEYS ONLY — every label and description is a message, for the reason
 * `CATALOGUE` states above it (`verify:i18n` caught the first version of this
 * file rendering Norwegian on the English page).
 *
 * «Ingenting utover dette leses fra katalogen» is the promise this page makes,
 * and **it must be true of what is built rather than of what is drawn**. So
 * every one of the bundle's eight rows is here, each either with the column it
 * lands in or with the reason it does not — because a row quietly dropped from
 * the list is the same defect as a row quietly implemented.
 */
export type DirectoryField = {
  /** The attribute as the customer sees it in the Entra portal. */
  key: string
  /** Where it lands — `null` when nothing reads it. */
  column: string | null
  /** Why it is not read. `null` exactly when `column` is set. */
  refusal: 'self_entered' | 'not_a_trigger' | null
  /** Graph requires `$select` for this one (it is not returned by default). */
  needsSelect?: true
}

/**
 * FOUR OF THE BUNDLE'S EIGHT ARE READ NOW, up from three under push, plus
 * `externalId`, which the bundle does not draw and which is the join key rather
 * than a fact about the person.
 *
 * **`department` is the one that moved**, and I2-0's measurement is why: Graph
 * gives it as a String, max 64 characters, `$filter`-able, needing only
 * `$select` and NO permission beyond `User.Read.All`. It lands in
 * `org_members.group_id` — see DEPARTMENT_IS_THE_AXIS below.
 *
 * **`manager`, `employeeHireDate` and `employeeLeaveDateTime` share ONE refusal
 * and share it on purpose** (Tor): *a directory field DESCRIBES a person; it
 * does not decide what the product does to her.* Pull does not change that — a
 * directory event sending a survey with no editor acting is a send path with an
 * external trigger whichever direction the data moves.
 *
 * `employeeLeaveDateTime` now has a SECOND, INDEPENDENT reason, measured from
 * Graph's own reference at I2-0: reading it requires
 * `User-LifeCycleInfo.Read.All` — a THIRD permission the customer's
 * administrator would have to approve — and in delegated scenarios a Lifecycle
 * Workflows Administrator or Global Reader role. A permission an administrator
 * must approve has to be defensible line by line, and this one would be
 * approved for a feature we have refused to build.
 *
 * And `manager` is wrong in KIND, not only in policy: it is not a property of
 * the user object at all. Graph models it as a `directoryObject` RELATIONSHIP
 * read through `$expand`. The bundle lists it beside eight scalar fields as
 * though it were a ninth.
 */
export const DIRECTORY_FIELDS: DirectoryField[] = [
  { key: 'displayName', column: 'org_members.name', refusal: null },
  { key: 'userName', column: 'org_members.email', refusal: null },
  { key: 'active', column: 'org_members.status', refusal: null, needsSelect: true },
  { key: 'externalId', column: 'org_members.external_id', refusal: null },
  { key: 'department', column: 'org_members.group_id', refusal: null, needsSelect: true },
  { key: 'jobTitle', column: null, refusal: 'self_entered' },
  { key: 'manager', column: null, refusal: 'not_a_trigger' },
  { key: 'employeeHireDate', column: null, refusal: 'not_a_trigger' },
  { key: 'employeeLeaveDateTime', column: null, refusal: 'not_a_trigger' },
]

/**
 * THE MODEL DECISION, AS A CONSTANT THE SCREEN RENDERS RATHER THAN A COMMENT
 * NOBODY READS.
 *
 * Tor's decision (I2): department breaks down, Entra groups target. A customer
 * WILL assume otherwise — «we have a group for the night shift, so we can see
 * how the night shift answered» is the obvious reading — so the page says which
 * of the two a synced group is, in as many words.
 *
 * **What syncs today is DEPARTMENTS, as breakdown groups.** Entra's own groups
 * are not read at all, and that is not an omission: they are an AUDIENCE, the
 * audience shape is `segments`, and segments cannot carry an explicit
 * membership list as they stand — I2-0 measured that
 * `app.validate_segment_predicate` accepts only `{field, op, value}` over the
 * four available `segment_fields`. The two shapes that would fix it are Tor's
 * to choose and he asked for them when they are needed, not before.
 */
export const DEPARTMENT_IS_THE_AXIS = true

/**
 * THE SCOPES WE ACTUALLY REQUEST, and there is ONE.
 *
 * The app registration carries `User.Read.All` and `Group.Read.All`, and
 * `Directory.Read.All` is deliberately not registered — two permissions cover
 * users and groups, and the third reads the catalogue's structure, which is
 * broader than the need.
 *
 * **But only `User.Read.All` is REQUESTED, because only it has a caller.**
 * Departments arrive on the user object; Entra's own groups are not read until
 * the audience shape is decided. Asking a customer's administrator to approve a
 * permission nothing calls fails the same test that keeps
 * `employeeLeaveDateTime` out — a permission an administrator must approve has
 * to be defensible line by line, and «we might use it later» is not a line.
 *
 * The cost is a second consent when groups land. That is a real cost and it is
 * the smaller one: a consent screen listing a permission the product does not
 * use is the kind of thing a security review asks about once and remembers.
 */
export const REQUESTED_SCOPES = ['User.Read.All'] as const

/** The connect steps, for the pull flow. No bearer token to paste any more: the
 *  customer's administrator consents once and the schedule is ours. */
export const CONNECT_STEPS = ['consent', 'scope', 'first', 'schedule'] as const
