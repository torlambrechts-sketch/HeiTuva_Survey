import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { isFlagEnabled } from '@/lib/flags'
import { ReportsScreen } from './ReportsScreen'
import { ReportEditor } from './ReportEditor'
import type { DutyCardData } from './types'
import type { ComposedDocument, EditorReport, QuotePick } from './editor-types'
import { effectiveK } from '@/lib/questions/threshold-tier'

/**
 * Rapporter — HeiTuva.dc.html:911-1330.
 *
 * Three tabs, plus the editor — which is a STATE of this screen in the design
 * (`repEditing`), not a screen of its own, so it is `?rapport=<id>` here.
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
  searchParams: Promise<{ fane?: string; rapport?: string }>
}) {
  const { fane, rapport } = await searchParams
  const tab: Tab = isTab(fane) ? fane : 'lov'

  const viewer = await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('reports')
  const tDuty = await getTranslations('duty')
  const tSection = await getTranslations('section')

  // ---------------------------------------------------------------------
  // The editor
  // ---------------------------------------------------------------------
  if (rapport) {
    const [{ data: row }, { data: sectionTypes }, { data: groups }, { data: surveys }] =
      await Promise.all([
        supabase
          .from('reports')
          .select('id, org_id, title, status, base_template, sections, filters, share_scope, schedule')
          .eq('id', rapport)
          .is('deleted_at', null)
          .maybeSingle(),
        supabase
          .from('report_section_types')
          // `in_report` is the report subset of the registry (M:0047). Without
          // it the editor would offer «Lovpålagte frister», a dashboard panel
          // with no prose form, as a section anyone could add to a report.
          .select('key, label, description, supports_group_filter')
          .eq('in_report', true)
          .order('sort_order'),
        supabase.from('groups').select('id, name').eq('org_id', viewer.orgId).order('name'),
        supabase
          .from('surveys')
          .select('id, title, status, k_threshold, respondent_kind')
          .eq('org_id', viewer.orgId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ])

    // RLS already scopes `reports` to the org, so a row from elsewhere cannot
    // arrive here — but a missing row and a foreign one must look the same, or
    // the URL becomes an existence oracle for report ids.
    if (!row) notFound()

    // The composed document. This is the ONLY read of results on this screen:
    // no aggregate RPC is called beside it, so there is no second path with
    // different gating rules.
    // The editor keeps the screen's header, so it needs the same counts.
    const [{ count: dutyCount }, { count: templateCount }, { count: mineCount }] =
      await Promise.all([
        supabase.from('duty_definitions').select('key', { count: 'exact', head: true }),
        supabase.from('report_templates').select('key', { count: 'exact', head: true }),
        supabase.from('reports').select('id', { count: 'exact', head: true })
          .eq('org_id', viewer.orgId).is('deleted_at', null),
      ])

    const { data: composed } = await supabase.rpc('compose_report', { p_report: row.id })
    const doc = (composed ?? {}) as ComposedDocument
    if (doc.error) notFound()

    const { data: counts } = await supabase.rpc('survey_response_counts', { p_org: viewer.orgId })
    const countBySurvey = new Map(
      ((counts ?? []) as { survey_id: string; responses: number }[]).map((c) => [
        c.survey_id,
        c.responses,
      ]),
    )

    const filters = (row.filters ?? {}) as Record<string, unknown>
    const schedule = (row.schedule ?? null) as { cadence?: string } | null
    const report: EditorReport = {
      id: row.id,
      title: row.title,
      status: row.status,
      baseTemplate: row.base_template,
      sections: (row.sections ?? []) as string[],
      filters: {
        surveys: (filters.surveys ?? []) as string[],
        rounds: (filters.rounds ?? []) as string[],
        group: (filters.group ?? null) as string | null,
        sectionGroups: (filters.sectionGroups ?? {}) as Record<string, string | null>,
      },
      shareScope: row.share_scope,
      cadence: (schedule?.cadence ?? 'none') as EditorReport['cadence'],
    }

    // The picker's candidate list — only when the section is actually on, the
    // way the design gates it (`quotesOn`, HeiTuva.dc.html:1202). The RPC is
    // administrator/redaktør only and k-gated per question, so a leser opening
    // the same editor gets `forbidden` and no picker; nothing here decides who
    // may see free text.
    let quotePicks: QuotePick[] = []
    if (report.sections.includes('quotes') && report.filters.surveys[0]) {
      const { data: cand } = await supabase.rpc('quote_candidates', {
        p_survey: report.filters.surveys[0],
        p_group: report.filters.group ?? undefined,
        p_rounds: report.filters.rounds.length ? report.filters.rounds : undefined,
        p_limit: 6,
      })
      const payload = (cand ?? {}) as { candidates?: QuotePick[] }
      quotePicks = payload.candidates ?? []
    }

    return (
      <ReportEditor
        report={report}
        doc={doc}
        canEdit={viewer.role !== 'leser'}
        options={{
          sectionTypes: (sectionTypes ?? []).map((s) => ({
            key: s.key,
            label: s.label,
            description: s.description,
            supportsGroupFilter: s.supports_group_filter,
          })),
          groups: groups ?? [],
          surveys: (surveys ?? []).map((s) => ({
            id: s.id,
            title: s.title,
            status: s.status,
            responses: countBySurvey.get(s.id) ?? 0,
            // The same reading app.k_for gives: organisation respondents carry
            // no threshold; persons never below the floor.
            k: effectiveK(s.k_threshold, s.respondent_kind === 'organisation' ? 'organisation' : 'person'),
            respondentKind: s.respondent_kind,
          })),
          orgName: viewer.orgName,
        }}
        // Q48(b): keyed by the registry key, same as the duties above.
        sectionLabels={Object.fromEntries(
          (sectionTypes ?? []).map((s) => [s.key, tSection(`label_${s.key}` as never)]),
        )}
        counts={t('counts', {
          lov: dutyCount ?? 0,
          maler: templateCount ?? 0,
          mine: mineCount ?? 0,
        })}
        pptxEnabled={await isFlagEnabled('pptx_export', viewer.orgId)}
        quotePicks={quotePicks}
        quotesChosen={(filters.quotes ?? []) as string[]}
      />
    )
  }

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
      supabase
        .from('report_section_types')
        .select('key, label')
        .eq('in_report', true)
        .order('sort_order'),
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
    .select('id, title, kind, status, base_template, duty_id, created_at, share_scope')
    .eq('org_id', viewer.orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const cards: DutyCardData[] = (definitions ?? []).map((def) => {
    const duty = dutyByKey.get(def.key) ?? null
    const status = (statusByKey.get(def.key) ?? null) as DutyCardData['status']
    return {
      definitionKey: def.key,
      // Q48(b): the STRING comes from next-intl, keyed by the registry key.
      // `duty_definitions.title` and `.law` remain in the table as the
      // canonical Norwegian and as what a migration seeds; nothing reads them
      // for display any more. `tests/unit/registry-strings.test.ts` binds the
      // two over the set, including the converse.
      title: tDuty(`title_${def.key}` as never),
      law: tDuty(`law_${def.key}` as never),
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
        shareScope: r.share_scope,
      }))}
      /* The design's line names all three collections
         (HeiTuva.dc.html:3070): statutory duties, standard templates, saved
         reports. "lagrede" counts every saved report, not just the own-made
         ones — a published statutory report is saved too. */
      counts={{
        lov: cards.length,
        maler: (templates ?? []).length,
        mine: (reports ?? []).length,
      }}
      thresholdNote={t('dutyThreshold')}
      sectionLabels={Object.fromEntries((sectionTypes ?? []).map((s) => [s.key, s.label]))}
    />
  )
}
