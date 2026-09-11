import 'server-only'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { computeShow, parseModuleCookie, type WorkspaceShow } from './modules'

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
/** W2 · V4:6078 — the Tilpasset workspace's own module set. A SECOND cookie
 *  rather than a field in the first, because they change independently: picking
 *  a workspace must not discard the modules you chose under Tilpasset, and
 *  resetting the modules must not move you off Tilpasset. */
export const MODULES_COOKIE = 'heituva.customMods'

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
  /** The module keys actually in force, registry order. */
  modules: string[]
  /** Every module the registry ships, for the Tilpasset chooser. */
  allModules: { key: string; label: string }[]
  /** What Oversikt renders, and the two rows' column templates. */
  show: WorkspaceShow
  /** Q124 — the SHIPPED preset's title, joined from `dashboard_presets` by
   *  `preset_key`, never copied. Null for Tilpasset, which has no preset and
   *  renders «Dashboard beholder ditt eget oppsett» instead. */
  presetTitle: string | null
  /** V4:6079 — Tilpasset with nothing switched on. NOT the same as a
   *  workspace whose own set happens to be empty, which cannot occur: the
   *  registry gives every workspace at least one module and a test asserts it. */
  empty: boolean
}

const COLUMNS = 'key, label, short, hint, tint, dot, person, person_def, persons, preset_key'

export async function readWorkspace(orgId: string): Promise<WorkspaceState | null> {
  const supabase = await createClient()
  const [{ data: all }, { data: org }] = await Promise.all([
    supabase.from('workspaces').select(COLUMNS).order('sort_order'),
    supabase.from('organizations').select('workspace').eq('id', orgId).single(),
  ])
  if (!all?.length) return null

  const jar = await cookies()
  const chosen = jar.get(WORKSPACE_COOKIE)?.value
  const byKey = (k: string | null | undefined) => all.find((w) => w.key === k)

  // Deliberately three steps rather than `chosen ?? org ?? all[0]`: each
  // fallback is a different fact, and collapsing them would hide an unknown
  // cookie behind a correct-looking render.
  const fromCookieRow = chosen ? byKey(chosen) : undefined
  const current = fromCookieRow ?? byKey(org?.workspace) ?? all[0]!

  // The module set. Two reads rather than a join, because the link rows are a
  // registry of a dozen rows and the join would be a second place for the
  // ordering to live.
  const [{ data: links }, { data: mods }, { data: presets }] = await Promise.all([
    supabase
      .from('workspace_module_links')
      .select('workspace_key, module_key, sort_order')
      .order('sort_order'),
    supabase.from('workspace_modules').select('key, label').order('sort_order'),
    // Q124: joined in JS rather than through a typed relationship, because
    // `types/database.ts` declares no Relationships for these tables — and a
    // hand-written one would be a second place for the FK to live. The FK in
    // the migration is the authority; this is only a lookup.
    supabase.from('dashboard_presets').select('key, title'),
  ])

  const known = (mods ?? []).map((m) => m.key)
  const ownSet = (links ?? []).filter((l) => l.workspace_key === current.key).map((l) => l.module_key)

  // Q122's cookie, and the distinction the empty state depends on: `null` is
  // «nothing chosen here», `[]` is «chose nothing». Only Tilpasset reads it —
  // a named workspace's set is the registry's, not the device's.
  const chosenMods = current.key === 'custom' ? parseModuleCookie(jar.get(MODULES_COOKIE)?.value, known) : null
  const modules = chosenMods ?? ownSet

  return {
    current,
    all,
    fromCookie: Boolean(fromCookieRow),
    modules,
    allModules: mods ?? [],
    show: computeShow(modules),
    presetTitle: current.preset_key
      ? ((presets ?? []).find((p) => p.key === current.preset_key)?.title ?? null)
      : null,
    empty: current.key === 'custom' && chosenMods !== null && chosenMods.length === 0,
  }
}
