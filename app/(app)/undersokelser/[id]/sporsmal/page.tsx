import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { SubTabRail } from '@/components/SubTabRail'
import { SurveyContextBar } from '../SurveyContextBar'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { specOf, type QuestionType } from '@/lib/questions/registry'
import { resolveSubTab } from '@/lib/surveys/subtabs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * F5-2 — «Spørsmål» AS A READ VIEW (v6:1371-1412), beside the Builder rather
 * than instead of it.
 *
 * ── THE BUNDLE PROVES THESE ARE TWO SCREENS, AND IT PROVES IT TWICE ───────
 *
 * `v6:1377` puts «Åpne byggeren» beside this table, and `v6:1845` puts «Åpne
 * utsending» beside the invitation panel. A screen does not link to itself.
 * Until now `TAB_SEGMENT.sporsmal` was `'bygg'`, so the tab rail's «Spørsmål»
 * pill went straight to the editing tool.
 *
 * ── WHAT ACTUALLY JUSTIFIES THE SPLIT: TWO COLUMNS AND ONE ROLE ───────────
 *
 * The drawn table is seven columns — `#` · Spørsmål · Type · Krav · Tema ·
 * Besvart · Snitt. The first four are editor fields and the Builder shows
 * them all. The last three are the reason this screen exists, and they have
 * three different verdicts:
 *
 *   **Tema is NOT BUILT.** `theme: THEMES[i % THEMES.length]` (v6:6959) over a
 *   six-item array (v6:6917) — the drawing assigns each question a theme BY
 *   INDEX MODULO. `survey_questions` has no theme column, and `theme_rules` is
 *   the free-text classifier — `(key, lang, label, pattern, ord)` — not a
 *   question taxonomy. It is not a missing column; it is a drawing showing
 *   data that does not exist and never did, and it is the column that would
 *   look MOST like real data: a reader would believe the product had
 *   classified her questions. Refused on the screen, below.
 *
 *   **Besvart and Snitt ARE built**, from `aggregate_results` — `n` and `avg`
 *   per question, with `insufficient_data` below k.
 *
 * **And that is why they cannot live in the Builder.** The Builder is an editor
 * over `survey_questions`; giving it `n` and `avg` would put the k-gated
 * results path on the edit screen. Keeping them here is the same discipline as
 * `PageHeader` having no `pct` prop — the wrong thing is not expressible
 * rather than merely not done.
 *
 * ── THE ROLE ARGUMENT, WHICH IS THE ONE THAT MAKES IT WORTH DOING ─────────
 *
 * `bygg/page.tsx:208` renders the Builder with `canEdit={viewer.role !==
 * 'leser'}`. So a **leser** clicking «Spørsmål» landed in the question EDITOR
 * with every control greyed out — an edit screen with nothing editable, when
 * what that role wants is exactly this. That is a user need rather than a
 * fidelity reason, and it leads the decision.
 */
export default async function SurveyQuestionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ vis?: string }>
}) {
  const { id } = await params
  const sub = resolveSubTab('sporsmal', (await searchParams).vis)!
  if (!UUID.test(id)) notFound()

  const viewer = await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('surveys')
  const tQ = await getTranslations('qtype')

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('id, title, audience_label, status, run_mode')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`questions survey read failed: ${error.message}`)
  // RLS scopes this to the viewer's org; a miss is a 404 rather than a forbidden
  // page, so the response cannot confirm another org's survey exists.
  if (!survey) notFound()

  const { data: questions, error: qError } = await supabase
    .from('survey_questions')
    .select('id, type, text, required, config')
    .eq('survey_id', id)
    .order('position')
  if (qError) throw new Error(`questions read failed: ${qError.message}`)

  /*
    THE ONLY RESULTS READ ON THIS SCREEN, and it is the gated one.

    `aggregate_results` is SECURITY DEFINER and returns, per question,
    `{ question_id, type, text, n, distribution, avg, insufficient_data }` —
    refusing any cell under k. The client selects nothing from `responses` or
    `answers`, which is invariant 1, and a survey below the threshold comes back
    refused so both columns render the em dash rather than a number.

    One call for the whole survey, not one per question: the RPC already
    aggregates every question in a single pass.
  */
  const { data: agg } = await supabase.rpc('aggregate_results', { p_survey: id })
  const stats = new Map<string, { n: number | null; avg: number | null }>()
  const payload = agg as { questions?: unknown[] } | null
  for (const raw of payload?.questions ?? []) {
    const q = raw as {
      question_id: string
      n: number | null
      avg: number | null
      insufficient_data?: boolean
    }
    stats.set(q.question_id, {
      n: q.insufficient_data ? null : q.n,
      avg: q.insufficient_data ? null : q.avg,
    })
  }

  /*
    `qFiltered` (v6:7252), stated as a PROPERTY rather than as the bundle's
    label regex.

    v6 filters on the rendered label — `/Skala|Likert|Smilefjes|NPS/` — which is
    an enumeration of the four strings its fixture happened to produce. Ours
    reads the registry's own `group`, whose comment already says «the bundle
    collapses the five scale styles into a single Skala». A sixth scale type
    then needs no edit here, and a type renamed does not silently fall out of
    the filter.
  */
  const rows = questions ?? []
  const shown = rows.filter((q) => {
    if (sub === 'alle') return true
    const g = specOf(q.type as QuestionType).group
    return sub === 'skala' ? g === 'skala' : g === 'apne'
  })

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
        {/* v6:1373 — the heading row, the question count and the escape hatch
            to the editor. The count is of ALL questions, never of the filtered
            view: «3 spørsmål» under «Fritekst» on a survey of twelve would be a
            fact about the filter wearing the survey's clothes. */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-[22px] py-[18px]">
          <h1 className="font-display text-[21px] font-medium">{t('qTitle')}</h1>
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="self-center text-xs text-mut">
              {t('qCount', { n: rows.length })}
            </span>
            {/* Only where there is something to open the builder FOR. A leser
                sees the Builder read-only (`bygg/page.tsx:208`), so offering
                them «Åpne byggeren» would hand back the very screen this view
                exists to spare them — an editor with every control greyed out. */}
            {viewer.role === 'leser' ? null : (
              <Link
                href={`/undersokelser/${survey.id}/bygg`}
                className="touch-44 flex h-[34px] cursor-pointer items-center whitespace-nowrap rounded-[10px] border border-line px-3.5 text-[12.5px] font-semibold text-ink no-underline"
              >
                {t('qOpenBuilder')}
              </Link>
            )}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="px-[22px] pb-[18px] text-[13px] text-mut">{t('qEmpty')}</p>
        ) : shown.length === 0 ? (
          <p className="px-[22px] pb-[18px] text-[13px] text-mut">
            {t(sub === 'skala' ? 'qEmptyScale' : 'qEmptyText')}
          </p>
        ) : (
          /* v6:1380 — the table scrolls inside the card rather than squeezing.
             RESPONSIVE.md permits exactly this for a table. The drawing's
             `min-width:860px` is SIX columns wide; ours is six too, because
             Tema is refused and nothing takes its place. */
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[38px_minmax(0,2.4fr)_128px_96px_minmax(130px,1fr)_62px] gap-3 border-y border-line bg-bg px-[22px] py-[11px] text-[11px] uppercase tracking-[.09em] text-mut">
                <span>#</span>
                <span>{t('qColQuestion')}</span>
                <span>{t('qColType')}</span>
                <span>{t('qColRequired')}</span>
                <span>{t('qColAnswered')}</span>
                <span className="text-right">{t('qColAvg')}</span>
              </div>

              {shown.map((q) => {
                const s = stats.get(q.id)
                const opts = (q.config as { options?: { label?: string }[] } | null)?.options ?? []
                const n = rows.indexOf(q) + 1
                return (
                  <div
                    key={q.id}
                    className="grid grid-cols-[38px_minmax(0,2.4fr)_128px_96px_minmax(130px,1fr)_62px] items-center gap-3 border-b border-line px-[22px] py-3"
                    style={{ background: n % 2 === 0 ? 'var(--bg)' : 'transparent' }}
                  >
                    <span className="text-[12.5px] text-mut">{n}</span>
                    <span className="min-w-0">
                      <span className="block text-pretty text-[13.5px] font-semibold">
                        {q.text}
                      </span>
                      {opts.length > 0 ? (
                        <span className="mt-[3px] block truncate text-[11.5px] text-mut">
                          {opts.map((o) => o.label).filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </span>
                    <span>
                      <span className="inline-block whitespace-nowrap rounded-full bg-sf2 px-2.5 py-1 text-[11.5px] font-semibold">
                        {tQ(q.type as 'scale')}
                      </span>
                    </span>
                    <span>
                      <span
                        className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                        style={{ background: q.required ? 'var(--sbg)' : 'var(--sf2)' }}
                      >
                        {t(q.required ? 'qRequired' : 'qOptional')}
                      </span>
                    </span>
                    {/* Besvart. `n` is null when the RPC refused the cell —
                        below k — and that renders the em dash, never a zero:
                        «nobody answered» and «we may not say» are different
                        claims and only one of them is about the respondents. */}
                    <span className="min-w-0 text-[12.5px]">
                      {s?.n == null ? '—' : t('qAnsweredN', { n: s.n })}
                    </span>
                    <span className="text-right text-[13.5px] font-semibold">
                      {s?.avg == null ? '—' : s.avg.toFixed(1).replace('.', ',')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* THE COLUMN THE DRAWING HAS AND THIS TABLE MUST NOT.
            Said on the screen for the reason Live, Hjelp and Målgruppe say
            theirs: a column that is simply absent reads as one somebody did not
            finish, and this one would have been believed. */}
        <p className="border-t border-line px-[22px] py-3.5 text-[12.5px] leading-[1.55] text-mut">
          {t('qNoTheme')}
        </p>

        <SubTabRail surveyId={survey.id} tab="sporsmal" current={sub} />
      </section>
    </main>
  )
}
