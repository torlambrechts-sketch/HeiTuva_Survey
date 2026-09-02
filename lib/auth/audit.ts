import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Append-only audit trail. The table has an update/delete trigger that raises,
 * so entries cannot be rewritten. Write one for every action CLAUDE.md lists:
 * privacy toggles, role changes, retention changes, DSR status changes.
 *
 * Never put respondent free text in `meta` — audit rows are readable by org
 * administrators.
 */
export async function audit(
  orgId: string,
  action: string,
  target?: string,
  meta: Record<string, unknown> = {},
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('audit_events').insert({
    org_id: orgId,
    actor_user_id: user?.id ?? null,
    action,
    target: target ?? null,
    meta: meta as never,
  })
  // An audit write must never silently vanish, but it also must not take down
  // the user's action — surface it in the server log instead.
  if (error) console.error(`audit(${action}) failed: ${error.message}`)
}
