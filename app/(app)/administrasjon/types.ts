/** Result of every Administrasjon write.
 *
 *  Kept out of actions.ts because a 'use server' module may only export async
 *  functions — exporting a type is erased at build time, but the union is also
 *  needed by client components that never import the actions.
 *
 *  `forbidden` is distinct from `save_failed` on purpose: RLS filters rather
 *  than errors, so a non-administrator's update returns zero rows and no error.
 *  Without the explicit refusal the UI would say "Lagret" and nothing would
 *  have changed.
 */
export type AdminError =
  | 'forbidden'
  | 'invalid'
  | 'save_failed'
  | 'duplicate'
  | 'last_admin'
  /** The group is referenced by a round that was already sent. V2-3b made
   *  `survey_invitations.group_id` NO ACTION DEFERRABLE INITIALLY DEFERRED on
   *  purpose — erasing the organisation still works, deleting one group a round
   *  reached does not — so this is a decided rule and not a failure. It gets its
   *  own result because «Kunne ikke lagre. Prøv igjen.» sends an administrator
   *  round a loop that can never succeed (the walk of 2026-09-12, W-05). */
  | 'group_in_use'
  /** Entra ID is not configured in Auth, so nobody could sign in once it was required. */
  | 'sso_unavailable'
  /** The administrator is not themselves signed in through Entra — the next request would sign them out. */
  | 'sso_self_lockout'
  /** No active administrator is marked able to sign in without SSO (break-glass, D82). */
  | 'sso_no_break_glass'
  /** This is the last such administrator, and SSO is on — the database refused the change. */
  | 'sso_last_break_glass'
  /** G2 — the mode is still in use, so it may not be disallowed
   *  (`app.guard_mode_still_in_use`, `M:0124`). Its own result rather than
   *  `save_failed` for the reason `group_in_use` has one: retrying will fail
   *  identically, and the administrator's next step is to move those surveys to
   *  standard mode. That next step is what the copy names. */
  | 'run_mode_in_use'

export type AdminResult = { ok: true } | { ok: false; error: AdminError }

/** Message key under the `admin` namespace for each failure. */
export const ADMIN_ERROR_KEY: Record<AdminError, string> = {
  forbidden: 'errForbidden',
  invalid: 'errInvalid',
  save_failed: 'saveFailed',
  duplicate: 'errDuplicate',
  last_admin: 'errLastAdmin',
  group_in_use: 'errGroupInUse',
  sso_unavailable: 'errSsoUnavailable',
  sso_self_lockout: 'errSsoSelf',
  sso_no_break_glass: 'errSsoNoBreakGlass',
  sso_last_break_glass: 'errSsoLastBreakGlass',
  run_mode_in_use: 'errRunModeInUse',
}
