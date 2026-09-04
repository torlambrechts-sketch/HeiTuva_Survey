'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { createReport } from '../rapporter/editor-actions'

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
    .select('panel_key')
    .eq('org_id', viewer.orgId)
    .eq('user_id', viewer.userId)

  const sections = ['summary', ...(pins ?? []).map((p) => p.panel_key).filter((k) => k !== 'summary')]

  // createReport redirects into the editor; unknown keys are dropped there
  // against the registry, which is the same check the pin's foreign key made.
  return createReport({
    title: z.string().trim().min(1).max(200).catch('Fra dashboard').parse(title),
    baseTemplate: 'Dashboard',
    sections,
  })
}
