/**
 * Deterministic demo personas. Dev/CI only — these credentials exist solely in
 * the local stack and in throwaway CI containers, never in a real project.
 *
 * One org (Nordisk Studio) with the three roles CLAUDE.md defines, plus a
 * second org used to prove cross-org isolation from the browser as well as
 * from SQL.
 */
export const DEMO_PASSWORD = 'heituva-dev-password-1!'

export const PERSONAS = {
  administrator: { email: 'admin@nordiskstudio.test', name: 'Tuva Berg', role: 'administrator' },
  redaktor: { email: 'redaktor@nordiskstudio.test', name: 'Jonas Vik', role: 'redaktor' },
  leser: { email: 'leser@nordiskstudio.test', name: 'Mari Holm', role: 'leser' },
  outsider: { email: 'admin@annenbedrift.test', name: 'Even Aas', role: 'administrator' },
} as const

export type PersonaName = keyof typeof PERSONAS

export const ORG_PRIMARY = 'Nordisk Studio'
export const ORG_OTHER = 'Annen Bedrift AS'
export const GROUP_PRIMARY = 'Ledelse'
/** A second team, kept below the k threshold on purpose: without it the seeded
 *  heatmap has one row and no screen ever shows a gated cell. */
export const GROUP_SECONDARY = 'Utvikling'

/**
 * The raw token behind the seeded share link, so the harness can open
 * /s/<token> without minting one. Dev/CI only, like DEMO_PASSWORD — tokens are
 * stored hashed, so a fixed plaintext is the only way a test can hold one.
 */
export const DEMO_SHARE_TOKEN = 'demo-share-link-token-for-local-verification'

/**
 * G1 — a SPENT invitation token, for the one thanks-screen state a share link
 * cannot reach.
 *
 * The result opt-in is offered only where an invitation exists (`can_opt_in`),
 * because a share link has no address and nowhere to send anything. So the
 * capture of that control needs an invitation token, and an invitation token
 * answers once — which would make the state photographable exactly one time.
 *
 * It is SPENT ON PURPOSE. `Respondent` opens straight on the thanks screen when
 * `already_responded` is true, and `app.resolve_token` still resolves a spent
 * invitation while its round is open, so `/s/<this>` renders the thanks screen
 * with the opt-in, repeatably, without submitting anything. Same dev/CI-only
 * standing as DEMO_SHARE_TOKEN and DEMO_PASSWORD.
 */
export const DEMO_ANSWERED_TOKEN = 'demo-answered-invitation-token-for-local-verification'

/**
 * V7-3c — a share token for the survey that carries CONTENT BLOCKS.
 *
 * Its own survey rather than the one `DEMO_SHARE_TOKEN` points at, and
 * deliberately so: `verify:visual` compares `/s/<DEMO_SHARE_TOKEN>` against a
 * rendered baseline, so interleaving four blocks into that survey would have
 * moved a reference every earlier phase was judged against — the failure the
 * per-bundle baselines exist to prevent, arriving through a fixture.
 *
 * So this reaches the state without touching a baseline. **No manifest state
 * was added for it**: the verification apparatus is frozen for this phase, so
 * the seed makes the flow openable and photographing it is logged for the next
 * one (D239). A seed that reaches a state no gate walks is still worth having —
 * it is the difference between a feature a human can open and one reachable
 * only from psql.
 */
export const DEMO_BLOCKS_TOKEN = 'demo-content-blocks-token-for-local-verification'
