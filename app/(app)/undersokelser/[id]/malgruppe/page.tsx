import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SubTabRefusals } from '@/components/SubTabRefusals'
import { SubTabRail } from '@/components/SubTabRail'
import { resolveSubTab } from '@/lib/surveys/subtabs'
import { DeliveryPanel } from './DeliveryPanel'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { SurveyContextBar } from '../SurveyContextBar'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * V6-4b — «Målgruppe» for one survey (`sd.tabAud`, v6:1733), BUILT AS HALF A TAB.
 *
 * ── WHAT THE BUNDLE DRAWS, AND WHY ONLY ONE HALF OF IT SHIPS ───────────────
 *
 * Tuva's own tip for this tab is «Sjekk utvalget — hvem får den, og hvem faller
 * fra» (v6:6874). Those are two different screens sharing a name:
 *
 *   · **who receives it** is a property of the SURVEY. Which groups a round went
 *     to, and how many people that was. Q28 permits counts of people, and the
 *     Målgrupper screen already shows the same group sizes.
 *   · **who falls away** is Feltarbeid under another name, and is refused for
 *     the same reason: **a surface organised around who did not answer is a list
 *     of names and an omission, whatever it is called.** Six invited and one
 *     answered is five people, and the screen's whole arrangement points at
 *     them.
 *
 * So this page reads `survey_invitations.group_id` and COUNTS. It never reads
 * `responded_at`, and `tests/unit/audience-half.test.ts` asserts that over the
 * source rather than trusting this comment — because the tempting next commit
 * is one that adds a «2 av 6 har svart» column and looks like an improvement.
 *
 * The need that half was meant to serve is met on Send: a reminder reaches
 * everyone who has not answered WITHOUT showing anyone who they are.
 */
export default async function SurveyAudiencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ vis?: string }>
}) {
  const { id } = await params
  const sub = resolveSubTab('malgruppe', (await searchParams).vis)!
  if (!UUID.test(id)) notFound()

  await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('surveyAudience')

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('id, title, status, audience_label, run_mode, anonymity, org_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`survey read failed: ${error.message}`)
  if (!survey) notFound()

  const { data: rounds } = await supabase
    .from('survey_rounds')
    .select('id')
    .eq('survey_id', id)
  const roundIds = (rounds ?? []).map((r) => r.id)

  /* `group_id` and nothing else. Selecting `responded_at` «just in case» is how
     the refused half arrives later as a one-line change. */
  const { data: invitations, error: invError } = roundIds.length
    ? await supabase
        .from('survey_invitations')
        .select('group_id')
        .in('round_id', roundIds)
        .eq('is_test', false)
    : { data: [], error: null }
  if (invError) throw new Error(`survey_invitations read failed: ${invError.message}`)

  const byGroup = new Map<string | null, number>()
  for (const inv of invitations ?? []) {
    byGroup.set(inv.group_id, (byGroup.get(inv.group_id) ?? 0) + 1)
  }

  /* ── G2.6 — «Levering», and it reads COUNTS ONLY ─────────────────────────
     Three aggregate counts, asked for only when that tab is on screen, and no
     identity column among them. The Grupper view above still reads `group_id`
     and nothing else; V6-4b's guard is restated over that view rather than
     over the whole file, because the refusal it encoded — «the drop-off half
     does not ship» — was about data that did not exist and three of those six
     figures now do. Restated, not widened: the same choice V5-3 made when a
     refused string began shipping on purpose. */
  const delivery =
    sub === 'levering' && roundIds.length
      ? await (async () => {
          const [sentRes, doneRes, supRes] = await Promise.all([
            supabase
              .from('survey_invitations')
              .select('id', { count: 'exact', head: true })
              .in('round_id', roundIds)
              .eq('is_test', false)
              .not('sent_at', 'is', null),
            supabase
              .from('survey_invitations')
              .select('id', { count: 'exact', head: true })
              .in('round_id', roundIds)
              .eq('is_test', false)
              .not('responded_at', 'is', null),
            supabase
              .from('suppressions')
              .select('id', { count: 'exact', head: true })
              .eq('org_id', survey.org_id),
          ])
          return {
            sent: sentRes.count ?? 0,
            done: doneRes.count ?? 0,
            suppressed: supRes.count ?? 0,
          }
        })()
      : null

  const groupIds = [...byGroup.keys()].filter((g): g is string => g !== null)
  const { data: groups } = groupIds.length
    ? await supabase.from('groups').select('id, name').in('id', groupIds)
    : { data: [] }
  const nameOf = new Map((groups ?? []).map((g) => [g.id, g.name]))

  const rows = [...byGroup.entries()]
    .map(([gid, n]) => ({ name: gid ? (nameOf.get(gid) ?? t('unknownGroup')) : t('noGroup'), n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'nb'))

  const total = [...byGroup.values()].reduce((a, b) => a + b, 0)

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

        {rows.length === 0 ? (
          <p className="mt-4 text-[13px] text-mut">{t('empty')}</p>
        ) : (
          <>
            <p className="mt-4 text-[13.5px] font-semibold">{t('total', { n: total })}</p>
            <ul className="mt-3 flex list-none flex-col gap-0 p-0">
              {rows.map((r) => (
                <li
                  key={r.name}
                  className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line py-[10px] last:border-b-0"
                >
                  <span className="text-[13.5px]">{r.name}</span>
                  <span className="text-[13px] text-mut">{t('invited', { n: r.n })}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* The other half, named rather than silently missing — so this reads as
            a decision and not as a tab somebody did not finish. */}
        <p className="mt-5 border-t border-line pt-4 text-[12.5px] text-mut">
          {t('dropoffRefused')}{' '}
          {/* G2 fix pass — `touch-44` because this is a LINK inside a
              paragraph, measured 100x16 at 320px the first time this page ever
              had manifest coverage. It predates G2; the phase that runs the
              sweep owns what it finds. `inline-flex` so the 44px hit area has a
              box to hang on — an inline <a>'s ::after has nothing to size
              against. */}
          <Link
            href={`/undersokelser/${survey.id}/send`}
            className="touch-44 inline-flex items-center underline"
          >
            {t('toReminders')}
          </Link>
        </p>
      </section>

      {sub === 'levering' && delivery ? (
        <DeliveryPanel
          sent={delivery.sent}
          done={delivery.done}
          suppressed={delivery.suppressed}
          invited={invitations?.length ?? 0}
          labels={{
            title: t('delTitle'),
            lead: t('delLead'),
            sent: t('delSent'),
            sentSub: t('delSentSub'),
            done: t('delDone'),
            doneSub: (pct: number) => t('delDoneSub', { pct }),
            suppressed: t('delSuppressed'),
            suppressedSub: t('delSuppressedSub'),
            whyNoStarted: t('delWhyNoStarted'),
          }}
        />
      ) : null}

      {/* G2.6 — THE RAIL EXISTS NOW, because «Levering» is built and two pills
          are a rail. «Segmenter» stays refused and keeps its sentence: it is
          the only refusal in this product about the MODEL rather than about
          missing data (Q92 — k does not compose over overlapping segments). */}
      <SubTabRefusals tab="malgruppe" />
      <SubTabRail surveyId={survey.id} tab="malgruppe" current={sub} />
    </main>
  )
}
