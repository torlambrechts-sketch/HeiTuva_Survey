import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { BrandingPanel, type Accent, type BrandingState, type TypePair } from './BrandingPanel'
import type { LogoSlot } from '../actions'

/**
 * «Profil og avsender» — V2:2310-2404, the two cards V2-2 owns.
 *
 * The accents come from `brand_accents` rather than from a constant here. That
 * is the point of the registry: adding a sixth is a row, and a second copy in
 * the application would be the place the two quietly disagree.
 */
export default async function ProfileTab() {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null

  const supabase = await createClient()
  const [{ data: org }, { data: accents }] = await Promise.all([
    supabase
      .from('organizations')
      .select('brand_accent, brand_type, logo_light, logo_dark, logo_icon')
      .eq('id', viewer.orgId)
      .single(),
    supabase.from('brand_accents').select('key, hex, contrast, sort_order').order('sort_order'),
  ])

  // Signed URLs, never a public one: the bucket is private, and the reason is
  // in the migration — objects keyed by org id in a public bucket make the
  // customer list walkable (CLAUDE.md invariant 5).
  const paths: Record<LogoSlot, string | null> = {
    light: org?.logo_light ?? null,
    dark: org?.logo_dark ?? null,
    icon: org?.logo_icon ?? null,
  }
  const entries = await Promise.all(
    (Object.keys(paths) as LogoSlot[]).map(async (slot) => {
      const path = paths[slot]
      if (!path) return [slot, { path: null, url: null }] as const
      const { data } = await supabase.storage.from('org-logos').createSignedUrl(path, 3600)
      return [slot, { path, url: data?.signedUrl ?? null }] as const
    }),
  )

  const initial: BrandingState = {
    accent: org?.brand_accent ?? null,
    type: (org?.brand_type as TypePair | null) ?? null,
    logos: Object.fromEntries(entries) as BrandingState['logos'],
  }

  return <BrandingPanel accents={(accents ?? []) as Accent[]} initial={initial} />
}
