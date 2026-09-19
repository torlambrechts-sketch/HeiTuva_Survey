import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { WORKING_TITLE } from '@/lib/dashboard/layout'
import type { SubnavDashboard } from './subnav'

/**
 * N2 — the Innsikt rail's dashboard pills (v8:9340-9350).
 *
 * v8's rail interpolates `mine`, the viewer's own boards, and caps the rail at
 * four with a «Flere oppsett» pill for the rest (v8:9347). `mine` is a fixture
 * array there; here it is a table, so this is the read.
 *
 * ── WHY THIS IS A SEPARATE MODULE AND NOT A QUERY IN `AppHeader` ───────────
 *
 * `resolveSubnav` is PURE — every rail is a function of (pathname, params,
 * dashboards), so `tests/unit/subnav.test.ts` drives all twelve of them with no
 * database. Keeping the read out here preserves that: the shell fetches, the
 * registry decides. The alternative — a registry entry that queries — would
 * have made the rail untestable without a stack, which is how a rail stops
 * being checked at all.
 *
 * ── WHAT THE ROWS ARE, AND WHO DECIDES WHICH ARE VISIBLE ──────────────────
 *
 * `public.dashboards` (M:0132), scoped by RLS to the organisation — this does
 * NOT filter by owner. v8 calls the array `mine` and its fixture is one
 * person's; ours is the organisation's, because `dashboards_sel` (M:0133)
 * admits every member and a board with `owner_id` null is the organisation's
 * rather than nobody's. Narrowing to `owner_id = me` here would hide
 * «Ledergruppa» from everyone including its own readers, which is a product
 * change wearing a fidelity change's clothes.
 *
 * Ordered by `created_at` so the rail is stable between renders: `title` order
 * would reshuffle the whole rail the moment somebody renames a board, and the
 * four that survive `.slice(0, 4)` would change with it.
 *
 * A failed read yields an EMPTY rail rather than a thrown error. The subnav is
 * shell furniture on every Innsikt screen; a dashboards table that is briefly
 * unreadable must not take the page down with it. The cost is that the rail
 * silently shortens, which is visible and recoverable — the opposite trade
 * from a panel, where an empty state would be a claim about the data.
 */
export async function readDashboards(
  orgId: string,
  userId: string,
): Promise<SubnavDashboard[]> {
  const supabase = await createClient()
  const [{ data, error }, { data: workingRow }] = await Promise.all([
    supabase.from('dashboards').select('id, title').eq('org_id', orgId).order('created_at'),
    /* WHICH BOARD IS CURRENT IS A FACT ABOUT THE LAYOUT, NOT ABOUT THE
       DASHBOARD. `/dashboard` with no `flate` renders the row
       `(org, me, WORKING_TITLE)`; its `dashboard_id` is the board on screen.
       Read here so the rail's highlight and the page's content come from the
       same value — the alternative, lighting the first pill, is a second
       implementation of "which board is open" and the two can disagree. */
    supabase
      .from('dashboard_layouts')
      .select('dashboard_id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('title', WORKING_TITLE)
      .maybeSingle(),
  ])

  if (error || !data) return []
  const currentId = workingRow?.dashboard_id ?? null
  return data.map((d) => ({
    id: d.id,
    title: d.title,
    ...(currentId && d.id === currentId ? { current: true } : {}),
  }))
}
