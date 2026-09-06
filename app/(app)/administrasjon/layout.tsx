import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { AdminTabs } from './AdminTabs'

/**
 * Administrasjon — built against HeiTuva.dc.html:1370-1382 (heading + tab rail)
 * with the five tab bodies at :1384-1557.
 *
 * The whole screen group is administrator-only. RLS already refuses the writes,
 * but a redaktør landing here would otherwise see a form that silently does
 * nothing, so the gate is explicit and the refusal is visible.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer()
  const t = await getTranslations('admin')

  if (viewer.role !== 'administrator') {
    return (
      <main className="animate-enter pt-[34px]">
        <h1 className="font-display text-[28px] font-medium">{t('title')}</h1>
        <p role="alert" className="mt-3 text-[13.5px] text-mut">
          {t('onlyAdmin')}
        </p>
      </main>
    )
  }

  const supabase = await createClient()
  const [{ data: org }, { count }] = await Promise.all([
    supabase.from('organizations').select('plan').eq('id', viewer.orgId).single(),
    supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', viewer.orgId)
      .neq('status', 'inactive'),
  ])

  // The design's sub-heading reads "Teamplan · 86 lisenser · fornyes …". The
  // renewal date has no source until billing exists, so it is omitted rather
  // than invented — docs/DEVIATIONS.md D17.
  const planLabel = t('planLabel', {
    plan: org?.plan === 'team' ? t('planTeam') : t('planFree'),
    count: count ?? 0,
  })

  return (
    <main className="animate-enter pt-[34px]">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-medium">{t('title')}</h1>
          <p className="mt-[3px] text-[13px] text-mut">{planLabel}</p>
        </div>
      </div>

      <AdminTabs
        tabs={[
          { href: '/administrasjon', label: t('tabFirma') },
          { href: '/administrasjon/brukere', label: t('tabBrukere') },
          { href: '/administrasjon/grupper', label: t('tabGrupper') },
          { href: '/administrasjon/personvern', label: t('tabPersonvern') },
          { href: '/administrasjon/valg', label: t('tabValg') },
          // A sixth tab the design does not draw (docs/DEVIATIONS.md D79):
          // DECISIONS Q12 puts the translation editor in the admin app, and
          // this rail is where every other org-wide setting lives.
          { href: '/administrasjon/sprak', label: t('tabSprak') },
        ]}
      />

      {children}
    </main>
  )
}
