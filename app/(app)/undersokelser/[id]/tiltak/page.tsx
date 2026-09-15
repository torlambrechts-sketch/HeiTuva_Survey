import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SubTabRail } from '@/components/SubTabRail'
import { resolveSubTab } from '@/lib/surveys/subtabs'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { SurveyContextBar } from '../SurveyContextBar'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * V6-4 — «Tiltak» for one survey (`sd.tabTask`, v6:2026).
 *
 * The Arbeidsliste narrowed to the tasks this survey produced. The join is
 * `tasks.source_round_id`, which is the only honest link: a task belongs to a
 * ROUND, because that is what a finding came out of, and a survey that has run
 * twice has two rounds' worth.
 *
 * Tasks are created elsewhere — the Arbeidsliste owns that, and Q185 governs
 * the one Tuva may propose. This screen lists and links; it does not offer to
 * create one, because a «Lag tiltak» here would be a second entry point into a
 * register that already has an owner.
 */
export default async function SurveyTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ vis?: string }>
}) {
  const { id } = await params
  const sub = resolveSubTab('tiltak', (await searchParams).vis)!
  if (!UUID.test(id)) notFound()

  await requireViewer()
  const supabase = await createClient()
  const t = await getTranslations('surveyTasks')
  const tS = await getTranslations('surveys')

  const { data: survey, error } = await supabase
    .from('surveys')
    .select('id, title, status, audience_label, run_mode')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`survey read failed: ${error.message}`)
  if (!survey) notFound()

  const { data: rounds } = await supabase
    .from('survey_rounds')
    .select('id')
    .eq('survey_id', id)
  const roundIds = (rounds ?? []).map((r) => r.id)

  const { data: tasks, error: taskError } = roundIds.length
    ? await supabase
        .from('tasks')
        .select('id, title, kind, status, due_at, law_ref')
        .in('source_round_id', roundIds)
        .order('created_at', { ascending: false })
    : { data: [], error: null }
  if (taskError) throw new Error(`tasks read failed: ${taskError.message}`)

  /* F5 — `tasksFiltered` (v6:7268), over the list this page already read.
     «Åpne» is the bundle's `t.status !== "Lukket"`, against our six statuses
     (foreslatt · besluttet · pagar · gjennomfort · effektvurdert · lukket), so
     it is «not closed» rather than a list of five — the same reason the guard
     one level up is a column and not a predicate. «Med hjemmel» is the
     bundle's `!!t.law` against `tasks.law_ref`, which is why that column
     joined the select above: a filter over a field the page does not read is a
     filter that silently matches nothing. */
  const rows = (tasks ?? []).filter((x) =>
    sub === 'alle' ? true : sub === 'hjemmel' ? x.law_ref !== null : x.status !== 'lukket',
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
        <p className="mt-1 text-[13px] text-mut">{t('lead')}</p>

        {rows.length === 0 ? (
          /* The empty state names the FILTER when the screen itself is not
             empty — «ingen tiltak» under «Med hjemmel» is false when four are
             open without one. */
          <p className="mt-4 text-[13px] text-mut">
            {(tasks ?? []).length === 0
              ? t('empty')
              : tS(sub === 'hjemmel' ? 'subEmptyHjemmel' : 'subEmptyApne')}
          </p>
        ) : (
          <ul className="mt-4 flex list-none flex-col gap-3 p-0">
            {rows.map((task) => (
              <li key={task.id} className="rounded-xl border border-line bg-bg px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13.5px] font-semibold">{task.title}</span>
                  <span className="whitespace-nowrap rounded-full bg-sf2 px-[10px] py-1 text-[11.5px] font-semibold">
                    {task.status}
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] text-mut">{task.kind}</p>
              </li>
            ))}
          </ul>
        )}

        {/* `touch-44` — measured 116x17 at 390px and 320px, so a thumb aimed at
            it had a 17px-tall target. Predates F5; found because F5 gave this
            route its FIRST manifest coverage, and the phase that runs the sweep
            owns what it finds. */}
        <p className="mt-4 text-[13px]">
          <Link href="/oppgaver" className="touch-44 inline-block underline">
            {t('toWorklist')}
          </Link>
        </p>
        </div>
        <SubTabRail surveyId={survey.id} tab="tiltak" current={sub} />
      </section>
    </main>
  )
}
