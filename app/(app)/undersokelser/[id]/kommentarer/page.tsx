import { notFound } from 'next/navigation'
import { SubTabRail } from '@/components/SubTabRail'
import { resolveSubTab } from '@/lib/surveys/subtabs'
import { getTranslations, getFormatter } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { SurveyContextBar } from '../SurveyContextBar'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * V6-4 — «Kommentarer» for one survey (`sd.tabCom`, v6:2001).
 *
 * A narrowing of the Arbeidsliste's feedback half to one survey, and the
 * narrowing is where the care goes.
 *
 * ── INVARIANT 4 IS LEFT TO RLS, DELIBERATELY ───────────────────────────────
 *
 * A `leser` reads ANONYMOUS comments and never a NAMED one (Q114 condition 2).
 * That is enforced by the select policy on `survey_comments`, and this page
 * adds NO filter of its own — because a second implementation of the same rule
 * is a second thing that can drift, and the one in the database is the one that
 * also holds for every other caller. `tests/db/comments.test.ts` is what proves
 * it; this screen simply asks and renders what comes back.
 *
 * So a `leser` and an administrator see different lists here, and neither sees
 * a count of what they were refused — a «3 skjulte» chip would leak the
 * existence of named feedback to someone not entitled to it.
 */
export default async function SurveyCommentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ vis?: string }>
}) {
  const { id } = await params
  const sub = resolveSubTab('kommentarer', (await searchParams).vis)!
  if (!UUID.test(id)) notFound()

  await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('surveyComments')
  const tS = await getTranslations('surveys')
  const fmt = await getFormatter()

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('id, title, status, audience_label, run_mode, feedback_mode')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`survey read failed: ${error.message}`)
  if (!survey) notFound()

  const { data: rounds } = await supabase
    .from('survey_rounds')
    .select('id')
    .eq('survey_id', id)
  const roundIds = (rounds ?? []).map((r) => r.id)

  // `.in()` on an empty list matches nothing, which is the right answer for a
  // draft — but PostgREST needs a non-empty array, so the draft case short-
  // circuits rather than sending `in.()`.
  const { data: comments, error: commentError } = roundIds.length
    ? await supabase
        .from('survey_comments')
        .select('id, body, is_anonymous, created_at, handled_at')
        .in('round_id', roundIds)
        .order('created_at', { ascending: false })
    : { data: [], error: null }
  if (commentError) throw new Error(`survey_comments read failed: ${commentError.message}`)

  /* F5 — the sub-tab is a PREDICATE over the list this page already read, not a
     second query. `commentsFiltered` (v6:7267) is the bundle's own mechanism and
     it is the right one here: three round trips to show three views of nine rows
     would be three chances for the counts to disagree.

     «Behandlet» AND NOT «Besvart», WHICH IS A DEVIATION WITH A MEASUREMENT
     BEHIND IT. `handled_at` has two writers — `reply_to_comment` (M:0102) sets
     it alongside a reply, and `set_comment_handled` (M:0101) sets it with no
     reply at all. So «Besvart» would be false on the second path, and the row
     chip on this very screen has said «Behandlet» since C4. Two words for one
     state is how one of them ends up wrong. */
  const rows = (comments ?? []).filter((c) =>
    sub === 'alle' ? true : sub === 'venter' ? c.handled_at === null : c.handled_at !== null,
  )

  return (
    <main>
      <SurveyContextBar
        surveyId={survey.id}
        title={survey.title}
        audience={survey.audience_label}
        status={survey.status as 'utkast' | 'aktiv' | 'lukket'}
        liveMode={survey.run_mode === 'live'}
      />

      <section className="mt-5 rounded-2xl border border-line bg-sf">
        <div className="px-[22px] py-[18px]">
        <h1 className="font-display text-xl font-medium">{t('title')}</h1>
        <p className="mt-1 text-[13px] text-mut">
          {survey.feedback_mode === 'av' ? t('leadOff') : t('lead')}
        </p>

        {rows.length === 0 ? (
          /* The empty state names the FILTER, not the screen. «Ingen
             kommentarer ennå» under «Venter» is false when nine are handled —
             an empty view and an empty screen are different facts. */
          <p className="mt-4 text-[13px] text-mut">
            {(comments ?? []).length === 0
              ? t('empty')
              : tS(sub === 'venter' ? 'subEmptyVenter' : 'subEmptyBesvart')}
          </p>
        ) : (
          <ul className="mt-4 flex list-none flex-col gap-3 p-0">
            {rows.map((c) => (
              <li key={c.id} className="rounded-xl border border-line bg-bg px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="whitespace-nowrap rounded-full px-[10px] py-1 text-[11.5px] font-semibold"
                    style={{ background: c.is_anonymous ? 'var(--sf2)' : 'var(--ac2)' }}
                  >
                    {c.is_anonymous ? t('anonymous') : t('named')}
                  </span>
                  {c.handled_at ? (
                    <span className="text-[11.5px] text-mut">{t('handled')}</span>
                  ) : null}
                  <span className="text-[11.5px] text-mut">
                    {fmt.dateTime(new Date(c.created_at), {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
                <p className="mt-2 text-[13.5px]">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        </div>
        {/* v6:1243 — the rail sits on the card's bottom edge, inside it. */}
        <SubTabRail surveyId={survey.id} tab="kommentarer" current={sub} />
      </section>
    </main>
  )
}
