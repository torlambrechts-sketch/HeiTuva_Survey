import 'server-only'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * W1 · DECISIONS Q122 — reading the active arbeidsflate at SERVER RENDER.
 *
 * The bundle keeps the choice in `localStorage` (`V4:6059`). We keep it in a
 * cookie, and the reason is this function's existence: `wsShow.*` decides which
 * modules Oversikt renders, Oversikt is a server component, and a
 * `localStorage` value is not readable here. That is not a preference between
 * mechanisms — it is one of them not working. D161.
 *
 * The resolution order is the bundle's own, `st.workspace || ORG_WORKSPACE`,
 * with one addition it does not need and we do: a cookie can carry a key that
 * no longer exists (a workspace retired by a later migration, or a hand-edited
 * cookie), so the value is resolved AGAINST THE REGISTRY rather than trusted.
 * An unknown key falls back to the organisation's default exactly as an absent
 * one does.
 */
export const WORKSPACE_COOKIE = 'heituva.workspace'

export type Workspace = {
  key: string
  label: string
  short: string
  hint: string
  tint: string
  dot: string
  person: string
  person_def: string
  persons: string
  preset_key: string | null
}

export type WorkspaceState = {
  /** The resolved workspace — never null: the registry always has a row. */
  current: Workspace
  /** Every workspace, for the chip's own select. */
  all: Workspace[]
  /** True when the cookie chose it, false when it came from the organisation. */
  fromCookie: boolean
}

const COLUMNS = 'key, label, short, hint, tint, dot, person, person_def, persons, preset_key'

export async function readWorkspace(orgId: string): Promise<WorkspaceState | null> {
  const supabase = await createClient()
  const [{ data: all }, { data: org }] = await Promise.all([
    supabase.from('workspaces').select(COLUMNS).order('sort_order'),
    supabase.from('organizations').select('workspace').eq('id', orgId).single(),
  ])
  if (!all?.length) return null

  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value
  const byKey = (k: string | null | undefined) => all.find((w) => w.key === k)

  // Deliberately three steps rather than `chosen ?? org ?? all[0]`: each
  // fallback is a different fact, and collapsing them would hide an unknown
  // cookie behind a correct-looking render.
  const fromCookieRow = chosen ? byKey(chosen) : undefined
  const current = fromCookieRow ?? byKey(org?.workspace) ?? all[0]!

  return { current, all, fromCookie: Boolean(fromCookieRow) }
}
