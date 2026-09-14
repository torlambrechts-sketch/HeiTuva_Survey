import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { retentionOf } from '@/lib/surveys/retention'
import { SurveyContextBar } from '../SurveyContextBar'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * V6-4 — «Personvern» for one survey (`sd.tabPriv`, v6:2056-2096).
 *
 * ── IT IS A SUMMARY, NOT A SECOND EDITOR, AND THAT IS THE DECISION ─────────
 *
 * The bundle draws «Modus» here — the three anonymity options, pickable — plus
 * a threshold preview and a read-only «Personvern og hjemmel» table. **The
 * Builder's `PolicyPanel` already edits every one of those**, with the
 * statutory locks, the warnings and the guard behind it.
 *
 * Shipping the picker here too would be two controls doing one job, which is
 * exactly what `AppSubnav`'s header refuses for `admin` — and the stakes are
 * higher than a nav rail: a second policy editor that drifts is a second
 * account of what a respondent was promised. So this screen READS, and sends
 * you to the Builder to change anything.
 *
 * ── Q187: THE RETENTION SENTENCE IS INTERPOLATED ───────────────────────────
 *
 * The bundle hard-codes «24 måneder». See `lib/surveys/retention.ts` — the
 * default is 12, the value is per-organisation, and `auto_delete` off means
 * never. Nothing on this page renders a duration it was not handed.
 *
 * ── AND «Databehandler: HeiTuva AS · servere i Norge» IS NOT BUILT ─────────
 *
 * V6-1's claim sweep measured it: production is Supabase `eu-central-1`
 * (Frankfurt), and the shipped `faq2A` already says «Oslo og Frankfurt». The
 * bundle's line is NARROWER THAN THE TRUTH, which makes it a false claim about
 * where personal data lives. It is omitted rather than restated, because the
 * authoritative version already exists in the privacy notice and a second copy
 * is a second thing to keep true.
 */
export default async function SurveyPrivacyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const viewer = await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('surveyPrivacy')

  const { data: survey, error } = await supabase
    .from('surveys')
    .select(
      'id, title, status, anonymity, audience_label, k_threshold, policy_locked, respondent_kind, template_pack_key, run_mode',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`survey read failed: ${error.message}`)
  if (!survey) notFound()

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('retention_months, privacy')
    .eq('id', viewer.orgId)
    .maybeSingle()
  if (orgError) throw new Error(`organization read failed: ${orgError.message}`)

  // The pack's legal reference, when a pack governs this survey — the same row
  // `guard_survey_policy` tests, so the screen and the guard cite one source.
  const { data: pack } = survey.template_pack_key
    ? await supabase
        .from('template_packs')
        .select('legal_ref')
        .eq('key', survey.template_pack_key)
        .is('org_id', null)
        .maybeSingle()
    : { data: null }

  const retention = org ? retentionOf(org) : { kept: 'forever' as const }

  const rows: { label: string; value: string }[] = [
    {
      label: t('rowWhoSees'),
      value: survey.anonymity === 'anonymous' ? t('whoSeesAnonymous') : t('whoSeesNamed'),
    },
    { label: t('rowThreshold'), value: t('thresholdValue', { n: survey.k_threshold }) },
    { label: t('rowLegal'), value: pack?.legal_ref ?? t('legalNone') },
    {
      label: t('rowRetention'),
      value:
        retention.kept === 'months'
          ? t('retentionMonths', { n: retention.months })
          : t('retentionForever'),
    },
    {
      label: t('rowBasis'),
      value: survey.respondent_kind === 'organisation' ? t('basisLegal') : t('basisInterest'),
    },
  ]

  return (
    <main>
      <SurveyContextBar
        surveyId={survey.id}
        title={survey.title}
        audience={survey.audience_label}
        status={survey.status as 'utkast' | 'aktiv' | 'lukket'}
        liveMode={survey.run_mode === 'live'}
      />

      <section className="mt-5 rounded-2xl border border-line bg-sf px-[22px] py-[18px]">
        <h1 className="font-display text-xl font-medium">{t('title')}</h1>
        <p className="mt-1 text-[13px] text-mut">{t('lead')}</p>

        <dl className="mt-4 flex list-none flex-col gap-0 p-0">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-3 last:border-b-0"
            >
              <dt className="text-[12.5px] text-mut">{r.label}</dt>
              <dd className="m-0 text-[13.5px] font-semibold">{r.value}</dd>
            </div>
          ))}
        </dl>

        {/* One editor, and it is the Builder's. `leser` may read this summary
            and has no business being sent to a control it cannot use. */}
        {viewer.role !== 'leser' ? (
          <p className="mt-4 text-[13px]">
            <Link href={`/undersokelser/${survey.id}/bygg`} className="underline">
              {survey.policy_locked ? t('editLocked') : t('edit')}
            </Link>
          </p>
        ) : null}
      </section>
    </main>
  )
}
