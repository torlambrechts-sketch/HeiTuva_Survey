/** The four notification toggles the design defines
 *  (HeiTuva.dc.html:3339-3346), and the jsonb keys they persist to.
 *
 *  Kept out of actions.ts because a 'use server' module may only export async
 *  functions — exporting this array from there is a build error.
 */
export const NOTIFY_KEYS = ['digest', 'low_response', 'new_text', 'shared'] as const
export type NotifyKey = (typeof NOTIFY_KEYS)[number]

export type SaveResult = { ok: true } | { ok: false; error: 'invalid' | 'save_failed' }
