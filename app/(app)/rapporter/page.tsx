import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { ReportsScreen } from './ReportsScreen'
import type { DutyCardData } from './types'

/**
 * Rapporter — HeiTuva.dc.html:911-1330.
 *
 * Three tabs. This slice builds Lovpålagte (the duty engine) and the two
 * listing tabs; the report editor itself is the next slice.
 *
 * The Lovpålagte tab renders every row of `duty_definitions`, not the
 * organisation's `duties` rows. The four laws are the same for every Norwegian
 * employer, so the list is not a record of what this company has chosen — what
 * belongs to the company is its own state laid over each one, and that row is
 * created the first time somebody touches it (see actions.ts). A company that
 * has done nothing therefore has an empty `duties` table and four cards telling
 * it so, which is the honest version of both.
 */
const TABS = ['lov', 'standard', 'mine'] as const
type Tab = (typeof TABS)[number]
const isTab = (v: string | undefined): v is Tab => !!v && TABS.includes(v as Tab)

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ fane?: string }>
}) {
  const { fane } = await searchParams
  const tab: Tab = isTab(fane) ? fane : 'lov'

  const viewer = await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('reports')

  const [
    { data: definitions },
    { data: duties },
    { data: templates },
    { data: members },
    { data: sectionTypes },
  ] = await Promise.all([
      supabase
        .from('duty_definitions')
        .select('key, title, law, basis, default_interval_months, publish, pack_key, checks, signer_roles')
        .order('key'),
      supabase
        .from('duties')
        .select('id, definition_key, owner_member_id, interval_months, reminder_weeks, publish, next_due_at')
        .eq('org_id', viewer.orgId),
      supabase.from('report_templates').select('key, tag, title, description, sections').order('sort_order'),
      supabase
        .from('org_members')
        .select('id, name, email')
        .eq('org_id', viewer.orgId)
        .eq('status', 'active')
        .order('name'),
      supabase.from('report_section_types').select('key, label'),
    ])

  const dutyByKey = new Map((duties ?? []).map((d) => [d.definition_key, d]))

  // Per-duty state comes from the RPC, which is also what reports whether a
  // signature still covers the current content. Only duties that exist have
  // one; the rest are untouched by definition.
  const statuses = await Promise.all(
    (duties ?? []).map(async (d) => {
      const { data } = await supabase.rpc('duty_status', { p_duty: d.id })
      return [d.definition_key, data] as const
    }),
  )
  const statusByKey = new Map(statuses)

  // Surveys linked to a duty, by the template pack the registry names. The
  // design links them by pack rather than by an explicit join, and
  // `duty_survey_links` is not written by anything yet — so the honest source
  // is the survey's own `template_pack_key`.
  const packKeys = (definitions ?? []).map((d) => d.pack_key)
  const { data: linkedSurveys } = await supabase
    .from('surveys')
    .select('id, title, status, template_pack_key')
    .eq('org_id', viewer.orgId)
    .is('deleted_at', null)
    .in('template_pack_key', packKeys.length ? packKeys : ['__none__'])

  const { data: reports } = await supabase
    .from('reports')
    .select('id, title, kind, status, base_template, duty_id, created_at')
    .eq('org_id', viewer.orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const cards: DutyCardData[] = (definitions ?? []).map((def) => {
    const duty = dutyByKey.get(def.key) ?? null
    const status = (statusByKey.get(def.key) ?? null) as DutyCardData['status']
    return {
      definitionKey: def.key,
      title: def.title,
      law: def.law,
      basis: def.basis,
      packKey: def.pack_key,
      checks: (def.checks ?? []) as { key: string; label: string }[],
      signerRoles: (def.signer_roles ?? []) as { key: string; label: string; role: string }[],
      registryPublish: def.publish,
      duty: duty
        ? {
            id: duty.id,
            ownerMemberId: duty.owner_member_id,
            intervalMonths: duty.interval_months,
            reminderWeeks: duty.reminder_weeks,
            publish: duty.publish,
            nextDueAt: duty.next_due_at,
          }
        : null,
      status,
      linked: (linkedSurveys ?? [])
        .filter((s) => s.template_pack_key === def.pack_key)
        .map((s) => ({ id: s.id, title: s.title, status: s.status })),
      hasReport: (reports ?? []).some((r) => r.duty_id === duty?.id),
    }
  })

  return (
    <ReportsScreen
      tab={tab}
      canEdit={viewer.role !== 'leser'}
      viewerMemberId={viewer.memberId}
      cards={cards}
      templates={(templates ?? []).map((r) => ({
        key: r.key,
        tag: r.tag,
        title: r.title,
        description: r.description,
        sections: (r.sections ?? []) as string[],
      }))}
      members={(members ?? []).map((m) => ({ id: m.id, name: m.name ?? m.email }))}
      reports={(reports ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        kind: r.kind,
        status: r.status,
        base: r.base_template,
        createdAt: r.created_at,
      }))}
      counts={{ lov: cards.length, mine: (reports ?? []).filter((r) => r.kind === 'egen').length }}
      thresholdNote={t('dutyThreshold')}
      sectionLabels={Object.fromEntries((sectionTypes ?? []).map((s) => [s.key, s.label]))}
    />
  )
}
