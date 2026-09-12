import 'server-only'

import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
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
  /** Q125 — may a person CHOOSE this one? Never consulted when RESOLVING. */
  visible: boolean
}

export type WorkspaceState = {
  /** The resolved workspace — never null: the registry always has a row. */
  current: Workspace
  /** Every workspace, hidden ones included. Resolution reads this, because an
   *  organisation already set to a hidden workspace must keep rendering it. */
  all: Workspace[]
  /** Q125 — the rows a picker may OFFER: the visible ones, plus `current` when
   *  `current` is hidden. That second clause is load-bearing rather than
   *  courteous: a `<select>` whose value is absent from its options displays a
   *  different row, and the next save writes THAT one — so omitting it would
   *  silently reassign the organisation's workspace, which is precisely the
   *  change Q125 says hiding must not make. */
  selectable: Workspace[]
  /** True when the cookie chose it, false when it came from the organisation. */
  fromCookie: boolean
  /** The module keys actually in force, registry order. */
  modules: string[]
  /** Every module the registry ships, for the Tilpasset chooser. */
  allModules: { key: string; label: string }[]
  /** What Oversikt renders, and the two rows' column templates. */
  show: WorkspaceShow
  /** W3 — the vocabulary, ready to hand to an ICU argument.
   *
   *  `personsCap` IS DERIVED, NOT STORED, and that is a deliberate line: it is
   *  the one transformation that is purely mechanical in Norwegian (capitalise
   *  the first letter of a noun that is already in the right number and form).
   *  Everything that is NOT mechanical — the definite «den ansatte» beside the
   *  indefinite «ansatt» — is a column, because deriving those would put
   *  grammar in a component and be wrong in the next language. */
  vocabulary: { person: string; personDef: string; persons: string; personsCap: string }
  /** W3 — use-case keys this workspace lifts to the top of the library, in
   *  rank order. Empty for Tilpasset, which lifts nothing. */
  lifts: string[]
  /** Q124 — the SHIPPED preset's title, joined from `dashboard_presets` by
   *  `preset_key`, never copied. Null for Tilpasset, which has no preset and
   *  renders «Dashboard beholder ditt eget oppsett» instead. */
  presetTitle: string | null
  /** V4:6079 — Tilpasset with nothing switched on. NOT the same as a
   *  workspace whose own set happens to be empty, which cannot occur: the
   *  registry gives every workspace at least one module and a test asserts it. */
  empty: boolean
}

const COLUMNS = 'key, label, short, hint, tint, dot, person, person_def, persons, preset_key, visible'

/* Q129 — the registry's `label` and `short` are SEEDED NORWEGIAN, and they
   reach the chrome of every page through the chip, Oversikt's strip, the
   Firma tab's select and the library's lift note. Translated HERE, at the one
   read site, rather than at each of those four: a per-consumer fix is an
   enumeration of the consumers that exist today, and the fifth one will render
   Norwegian on an English page exactly as these four did.

   The registry value is the FALLBACK, so adding a workspace stays a row — it
   renders its seeded name until someone adds the message, never blank.

   GENERALISED to `use_cases` in the same breath, because the same measurement
   found the same gap there: `use_cases.label` for `hr` is the identical string,
   which is how the gate came to blame a workspace key for a library chip. Two
   of the three untranslated shipped registries are closed here; the third,
   `dashboard_presets`, is measured and logged in Q129 rather than fixed, since
   its titles are BOUND (Q124 renders `dashboard_presets.title` from the joined
   row) and translating them is a change to what that sentence promises. */
export async function localiseRegistryNames<T extends { key: string; label: string; short?: string }>(
  rows: T[],
  prefix: 'ws' | 'uc',
): Promise<T[]> {
  const t = await getTranslations('nav')
  return rows.map((w) => ({
    ...w,
    label: t.has(`${prefix}Label_${w.key}`) ? t(`${prefix}Label_${w.key}`) : w.label,
    ...(w.short === undefined
      ? {}
      : { short: t.has(`${prefix}Short_${w.key}`) ? t(`${prefix}Short_${w.key}`) : w.short }),
  }))
}

/** The workspace registry, by the name its four call sites already use. */
export async function localiseWorkspaceNames<T extends { key: string; label: string; short: string }>(
  rows: T[],
): Promise<T[]> {
  return localiseRegistryNames(rows, 'ws')
}

export async function readWorkspace(orgId: string): Promise<WorkspaceState | null> {
  const supabase = await createClient()
  const [{ data: all }, { data: org }] = await Promise.all([
    supabase.from('workspaces').select(COLUMNS).order('sort_order'),
    supabase.from('organizations').select('workspace').eq('id', orgId).single(),
  ])
  if (!all?.length) return null

  // Localised once, here, so `current`, `all` and `selectable` are all derived
  // from the same translated rows and no consumer sees an untranslated one.
  const rows = await localiseWorkspaceNames(all)

  const jar = await cookies()
  const chosen = jar.get(WORKSPACE_COOKIE)?.value
  const byKey = (k: string | null | undefined) => rows.find((w) => w.key === k)

  // Deliberately three steps rather than `chosen ?? org ?? all[0]`: each
  // fallback is a different fact, and collapsing them would hide an unknown
  // cookie behind a correct-looking render.
  const fromCookieRow = chosen ? byKey(chosen) : undefined
  const current = fromCookieRow ?? byKey(org?.workspace) ?? rows[0]!

  // The module set. Two reads rather than a join, because the link rows are a
  // registry of a dozen rows and the join would be a second place for the
  // ordering to live.
  const [{ data: links }, { data: mods }, { data: presets }, { data: lifts }] = await Promise.all([
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
    supabase
      .from('workspace_use_case_lifts')
      .select('workspace_key, use_case_key, sort_order')
      .order('sort_order'),
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
    all: rows,
    // One clause rather than a concat, so registry order survives: appending a
    // hidden `current` would put it last, where its own workspace is not.
    selectable: rows.filter((w) => w.visible || w.key === current.key),
    fromCookie: Boolean(fromCookieRow),
    modules,
    allModules: mods ?? [],
    show: computeShow(modules),
    vocabulary: {
      person: current.person,
      personDef: current.person_def,
      persons: current.persons,
      personsCap: current.persons.charAt(0).toUpperCase() + current.persons.slice(1),
    },
    lifts: (lifts ?? []).filter((l) => l.workspace_key === current.key).map((l) => l.use_case_key),
    presetTitle: current.preset_key
      ? ((presets ?? []).find((p) => p.key === current.preset_key)?.title ?? null)
      : null,
    empty: current.key === 'custom' && chosenMods !== null && chosenMods.length === 0,
  }
}
