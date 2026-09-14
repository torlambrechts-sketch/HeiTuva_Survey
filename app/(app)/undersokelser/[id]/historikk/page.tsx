import { notFound } from 'next/navigation'
import { getTranslations, getFormatter } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { SurveyContextBar } from '../SurveyContextBar'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * V6-4 — «Historikk» for one survey (`sd.tabLog`, v6:2096).
 *
 * Tor: «BUILD. `survey_rounds` exist, nothing reads them, and it is the
 * cheapest of the three. A survey with four rounds is four aggregates and no
 * timeline today.»
 *
 * ── IT SHOWS ROUNDS, NOT ANSWERS, AND THAT IS THE WHOLE DESIGN ─────────────
 *
 * A round carries `round_no`, `status`, `opens_at`, `closes_at` and a frozen
 * `question_snapshot`. None of that is svar-derived, so none of it is gated by
 * `app.k_for` — and this page reads NO aggregate, so it cannot become a way
 * around one. The response COUNT per round is deliberately absent: Q28 permits
 * it, but a timeline is about when a round ran, and a per-round count on a
 * small survey is the arrangement Feltarbeid was refused for.
 */
export default async function SurveyHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!UUID.test(id)) notFound()

  await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('surveyHistory')
  const fmt = await getFormatter()

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('id, title, status, anonymity, audience_label, run_mode')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`survey read failed: ${error.message}`)
  if (!survey) notFound()

  const { data: rounds, error: roundError } = await supabase
    .from('survey_rounds')
    .select('id, round_no, status, opens_at, closes_at, question_snapshot')
    .eq('survey_id', id)
    .order('round_no', { ascending: false })
  if (roundError) throw new Error(`survey_rounds read failed: ${roundError.message}`)

  const when = (iso: string | null) =>
    iso ? fmt.dateTime(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' }) : null

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

        {(rounds ?? []).length === 0 ? (
          // A draft has no round. Saying so is the real state; a «0 runder»
          // counter would be a number about something that has not happened.
          <p className="mt-4 text-[13px] text-mut">{t('empty')}</p>
        ) : (
          <ol className="mt-4 flex list-none flex-col gap-3 p-0">
            {(rounds ?? []).map((r) => {
              const snapshot = Array.isArray(r.question_snapshot)
                ? r.question_snapshot.length
                : null
              return (
                <li key={r.id} className="rounded-xl border border-line bg-bg px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold">
                      {t('round', { n: r.round_no })}
                    </span>
                    <span
                      className="whitespace-nowrap rounded-full px-[10px] py-1 text-[11.5px] font-semibold"
                      style={{ background: r.status === 'open' ? 'var(--sbg)' : 'var(--sf2)' }}
                    >
                      {r.status === 'open' ? t('statusOpen') : t('statusClosed')}
                    </span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-mut">
                    {when(r.opens_at) ? t('opened', { date: when(r.opens_at)! }) : null}
                    {when(r.closes_at) ? ` · ${t('closed', { date: when(r.closes_at)! })}` : ''}
                  </p>
                  {/* The frozen question set is the reason rounds exist — it is
                      what lets a survey run twice without a past answer pointing
                      at something that has since changed. */}
                  {snapshot !== null ? (
                    <p className="mt-1 text-[12.5px] text-mut">
                      {t('questions', { n: snapshot })}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </main>
  )
}
