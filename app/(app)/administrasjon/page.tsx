import { getTranslations } from 'next-intl/server'
import { localiseWorkspaceNames } from '@/lib/workspace/current'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { CompanyForm } from './CompanyForm'

/** Firma tab — HeiTuva.dc.html:1384-1403. */
export default async function CompanyTab() {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return null

  const t = await getTranslations('admin')
  const supabase = await createClient()
  const [{ data: org }, { data: workspaces }] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, orgnr, address, contact_name, contact_email, dpo, timezone, workspace, worklist_view')
      .eq('id', viewer.orgId)
      .single(),
    // W0/Q122: the registry is the authority on which workspaces exist, so the
    // control is built from it. `workspaces` carries no org id and its select
    // policy is `using (true)` — the same shape as `use_cases`.
    supabase.from('workspaces').select('key, label, short, visible').order('sort_order'),
  ])

  /* Q125 — the option list is the VISIBLE rows, plus this organisation's own
     row when that row is hidden. The second clause is not politeness: this is
     a `<select name="workspace">` whose value is submitted, so an option list
     missing the current value would display a different row and `saveCompany`
     would write THAT one on the next save of any field on this form. Hiding
     governs the picker; it must not reassign an organisation's workspace. */
  /* Q129 — this tab reads the registry directly rather than through
     readWorkspace, so it needs the same localisation or it renders the seeded
     Norwegian names in an English session. The shared helper, not a second
     copy of the rule. */
  const options = await localiseWorkspaceNames(
    (workspaces ?? []).filter((w) => w.visible || w.key === (org?.workspace ?? 'hr')),
  )

  return (
    <div className="mt-5 grid grid-cols-1 items-start gap-[18px] md:grid-cols-[1.2fr_.8fr]">
      <CompanyForm
        company={{
          name: org?.name ?? '',
          orgnr: org?.orgnr ?? '',
          address: org?.address ?? '',
          contact_name: org?.contact_name ?? '',
          contact_email: org?.contact_email ?? '',
          dpo: org?.dpo ?? '',
          // Q50: the DB default is the fallback, never an empty string —
          // the column is NOT NULL and the select must not offer a blank.
          timezone: org?.timezone ?? 'Europe/Oslo',
          // Same rule as `timezone` above: the column is NOT NULL with a real
          // default, so the fallback is that default and never a blank option.
          workspace: org?.workspace ?? 'hr',
          worklistView: org?.worklist_view ?? 'list',
        }}
        workspaces={options}
      />

      <aside className="rounded-[18px] border border-line bg-sbg p-6">
        <h2 className="text-[15.5px] font-semibold">{t('controllerTitle')}</h2>
        <p className="mt-2 text-[13.5px] leading-[1.65]">
          {t('controllerBody', { org: org?.name ?? viewer.orgName })}
        </p>
        <div className="my-4 h-px" style={{ background: 'rgba(25,21,16,.12)' }} />
        <div className="text-[13px] leading-[1.7]">
          <strong>{t('dpoTitle')}</strong>
          <br />
          {org?.dpo || '—'}
          <br />
          {org?.contact_email || '—'}
        </div>
      </aside>
    </div>
  )
}
