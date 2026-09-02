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

export type AdminResult = { ok: true } | { ok: false; error: AdminError }

/** Message key under the `admin` namespace for each failure. */
export const ADMIN_ERROR_KEY: Record<AdminError, string> = {
  forbidden: 'errForbidden',
  invalid: 'errInvalid',
  save_failed: 'saveFailed',
  duplicate: 'errDuplicate',
  last_admin: 'errLastAdmin',
}
