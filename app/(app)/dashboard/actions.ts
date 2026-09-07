'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { createReport } from '../rapporter/editor-actions'
import { WORKING_TITLE, filtersForPreset } from '@/lib/dashboard/layout'

/**
 * The dashboard's "Legg i rapport" pin — HeiTuva.dc.html:858, 3046-3056.
 *
 * A pin is one person's working selection, so it is keyed by (org, user,
 * panel) and RLS lets a member read and write only their own rows. The panel
 * key is a foreign key into `report_section_types`: a pin means "this panel
 * becomes that report section", and a new panel is a registry row rather than
 * a new list here.
 */
const PanelKey = z.string().trim().min(1).max(64)

export async function togglePin(panelKey: string): Promise<{ ok: boolean }> {
  const parsed = PanelKey.safeParse(panelKey)
  if (!parsed.success) return { ok: false }

  const viewer = await requireViewer()
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('dashboard_pins')
    .select('panel_key')
    .eq('org_id', viewer.orgId)
    .eq('user_id', viewer.userId)
    .eq('panel_key', parsed.data)
    .maybeSingle()

  const { error } = existing
    ? await supabase
        .from('dashboard_pins')
        .delete()
        .eq('org_id', viewer.orgId)
        .eq('user_id', viewer.userId)
        .eq('panel_key', parsed.data)
    : await supabase.from('dashboard_pins').insert({
        org_id: viewer.orgId,
        user_id: viewer.userId,
        panel_key: parsed.data,
      })

  if (error) return { ok: false }
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * "Åpne rapport (n)" — the design opens the editor on `["summary"]` plus the
 * pinned panels, with the base template named "Dashboard".
 *
 * The pins are read from the table rather than passed in from the browser: the
 * button says how many there are, but what ends up in the report is what the
 * database holds for this member.
 */
export async function openPinnedReport(title: string) {
  const viewer = await requireViewer()
  const supabase = await createClient()

  const { data: pins } = await supabase
    .from('dashboard_pins')
    .select('panel_key, report_section_types!inner(in_report)')
    .eq('org_id', viewer.orgId)
    .eq('user_id', viewer.userId)
    // V1-4: only a section a report can RENDER. `duties` is a dashboard panel
    // with no prose form (M:0047), and `createReport` would drop it silently —
    // leaving the button's count promising a section the report does not
    // contain. Filtered here so the count and the content are the same set.
    .eq('report_section_types.in_report', true)

  const sections = ['summary', ...(pins ?? []).map((p) => p.panel_key).filter((k) => k !== 'summary')]

  // createReport redirects into the editor; unknown keys are dropped there
  // against the registry, which is the same check the pin's foreign key made.
  return createReport({
    title: z.string().trim().min(1).max(200).catch('Fra dashboard').parse(title),
    baseTemplate: 'Dashboard',
    sections,
  })
}

/* ── The «Tilpass» card — DECISIONS Q25, Q46, Q51 ───────────────────────────
 *
 * Every write here goes through `dashboard_layouts`, whose constraints are the
 * rule (migration 0046). These actions do NOT re-implement them: an action is
 * one caller, and the table is writable through PostgREST by any authenticated
 * session. What the actions add is Zod at the boundary (CLAUDE.md) and the
 * ORDER of the payload, which a CHECK cannot express.
 */

const PanelsInput = z
  .array(z.object({ key: z.string().trim().min(1).max(64), wide: z.boolean() }))
  .max(20)

const FiltersInput = z.object({
  period: z.enum(['q', 'h', 'y']),
  group_id: z.string().uuid().nullable(),
  survey_ids: z.array(z.string().uuid()).max(200),
})

/**
 * The member's own working layout — what reappears «neste gang» (NEW:1026).
 *
 * Upsert on (org, user, title): one working row per member. A conflict target
 * rather than a read-then-write, because two tabs saving at once would
 * otherwise race into two rows and the unique index is what forbids that.
 */
export async function saveLayout(input: {
  panels: unknown
  filters: unknown
}): Promise<{ ok: boolean }> {
  const panels = PanelsInput.safeParse(input.panels)
  const filters = FiltersInput.safeParse(input.filters)
  if (!panels.success || !filters.success) return { ok: false }

  const viewer = await requireViewer()
  const supabase = await createClient()

  const { error } = await supabase.from('dashboard_layouts').upsert(
    {
      org_id: viewer.orgId,
      user_id: viewer.userId,
      title: WORKING_TITLE,
      panels: panels.data,
      filters: filters.data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,user_id,title' },
  )

  if (error) return { ok: false }
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * «Lagre dette som eget oppsett» — an ORGANISATION preset (Q25), so writing one
 * is an editor act and `dashboard_layouts_ins` refuses a leser.
 *
 * Q51, THE HALF THE CHECK CANNOT DELIVER: an org preset may not carry a group
 * filter, and this returns `groupDropped` so the screen can SAY SO rather than
 * let the member discover it later. `filtersForPreset` is the one place that
 * decides what travels; the database refuses the row if it ever disagrees.
 */
export async function savePreset(input: {
  title: unknown
  panels: unknown
  filters: unknown
}): Promise<{ ok: boolean; groupDropped: boolean; reason?: 'duplicate' | 'forbidden' }> {
  const title = z.string().trim().min(1).max(80).safeParse(input.title)
  const panels = PanelsInput.safeParse(input.panels)
  const filters = FiltersInput.safeParse(input.filters)
  if (!title.success || !panels.success || !filters.success) {
    return { ok: false, groupDropped: false }
  }

  const viewer = await requireViewer()
  const supabase = await createClient()
  const { stored, groupDropped } = filtersForPreset(filters.data)

  const { error } = await supabase.from('dashboard_layouts').insert({
    org_id: viewer.orgId,
    user_id: null,
    title: title.data,
    panels: panels.data,
    filters: stored,
  })

  if (error) {
    // 23505 is the unique index on (org, owner, title). Reported as its own
    // reason because "that name is taken" and "you may not do this" are
    // different things to a reader, and a single «gikk ikke» would make an
    // editor think they lacked permission.
    return {
      ok: false,
      groupDropped,
      reason: error.code === '23505' ? 'duplicate' : 'forbidden',
    }
  }

  revalidatePath('/dashboard')
  return { ok: true, groupDropped }
}

/** Removing a shared preset. RLS decides who may: the same editor predicate
 *  that admitted it. A leser's delete matches no row and the preset stays. */
export async function deletePreset(id: unknown): Promise<{ ok: boolean }> {
  const parsed = z.string().uuid().safeParse(id)
  if (!parsed.success) return { ok: false }

  const viewer = await requireViewer()
  const supabase = await createClient()

  const { error } = await supabase
    .from('dashboard_layouts')
    .delete()
    .eq('id', parsed.data)
    .eq('org_id', viewer.orgId)
    .is('user_id', null)

  if (error) return { ok: false }
  revalidatePath('/dashboard')
  return { ok: true }
}

/** «Start på nytt» — drops the member's working row, which returns them to the
 *  first-run preset chooser rather than to an empty board. Their organisation's
 *  presets are untouched: this is one person starting over, not a reset of what
 *  the organisation shares. */
export async function resetLayout(): Promise<{ ok: boolean }> {
  const viewer = await requireViewer()
  const supabase = await createClient()

  const { error } = await supabase
    .from('dashboard_layouts')
    .delete()
    .eq('org_id', viewer.orgId)
    .eq('user_id', viewer.userId)
    .eq('title', WORKING_TITLE)

  if (error) return { ok: false }
  revalidatePath('/dashboard')
  return { ok: true }
}
