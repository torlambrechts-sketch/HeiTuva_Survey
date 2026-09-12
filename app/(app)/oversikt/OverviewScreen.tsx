import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ComplianceCard } from './ComplianceCard'
import { WorkspaceEmpty, WorkspaceStrip } from '@/components/WorkspaceStrip'
import { computeShow } from '@/lib/workspace/modules'
import type { WorkspaceState } from '@/lib/workspace/current'

export type ActionItem = {
  key: string
  tint: string
  title: string
  sub: string
  cta: string
  href: string
}

export type ComplianceChip = {
  key: string
  title: string
  law: string
  due: string
  /** Long form, "Neste om 6 måneder" — the chip row's wording. */
  days: string
  /** Short form, "6 mnd" — the compliance card's chip (HeiTuva.dc.html:355). */
  when: string
  tone: string
  /** Not started, past its date, or due inside the current year. */
  urgent: boolean
  /** Percentage along the card's twelve-month axis; derived per render. */
  pos: number
}

export type Activity = {
  thisWeek: number
  thisYear: number
  completion: number | null
  days: { day: string; n: number }[]
  weeks: { week: string; active: boolean }[]
  streakWeeks: number
}

/**
 * Oversikt — HeiTuva.dc.html:218-317.
 *
 * Built last in Phase 5 because it aggregates everything the phases before it
 * produced: surveys, invitations, responses, duties and loop actions.
 *
 * Every number is real or absent. The prototype pads its figures — the "svar i
 * år" milestone is the response count plus a literal 289, the manager grade is
 * a hard-coded "3 av 4", and the streak names one team over six weeks that no
 * data supports. Those are mock scaffolding, and rendering them would put
 * invented measurements on the first screen anyone sees (CLAUDE.md: never
 * fabricate data in the UI). The counts here come from `overview_activity`; the
 * grade counts real loop actions against real surveys; the streak is
 * organisation-wide because per-group participation over time is precisely what
 * k protects.
 */
export async function OverviewScreen({
  orgName,
  firstName,
  canEdit,
  activeSurveys,
  totalSurveys,
  actions,
  compliance,
  complianceUrgent,
  activity,
  loop,
  quizRecent,
  quizNext,
  showOnboard,
  workspace,
}: {
  orgName: string
  firstName: string
  canEdit: boolean
  activeSurveys: number
  totalSurveys: number
  actions: ActionItem[]
  compliance: ComplianceChip[]
  complianceUrgent: number
  activity: Activity
  loop: { id: string; text: string; when: string | null; done: boolean }[]
  /* V4:344-357. `top` is the LEADING TEAM, never a person: `quiz_leaderboard`
     returns team aggregates only and has no branch that can name one (Q84,
     V2-10). Null when the board is k-suppressed or disabled, and the chip is
     then absent rather than showing a zero nobody earned. */
  quizRecent: { id: string; title: string; meta: string; top: string | null }[]
  /* V4:352. The next scheduled quiz, or null. Never a placeholder date. */
  quizNext: string | null
  /* W2 · Q122. Null only if the registry has not been seeded — the strip is
     then absent rather than faked, and every module renders, which is the
     pre-W2 behaviour. Never fabricate: a strip naming a workspace that does
     not exist is indistinguishable from a real one. */
  workspace: WorkspaceState | null
  showOnboard: boolean
}) {
  const t = await getTranslations('dash')

  /* A null workspace means the registry is unseeded: show everything, which is
     exactly what this screen did before W2. Written once as `computeShow` over
     every key rather than as a second branch beside each card. */
  const show = workspace?.show ?? computeShow(['action', 'duties', 'loop', 'activity', 'nps', 'quiz'])
  const nav = await getTranslations('nav')

  const hour = new Date().getHours()
  const greeting =
    hour < 11 ? t('greetMorning', { name: firstName })
    : hour < 18 ? t('greetDay', { name: firstName })
    : t('greetEvening', { name: firstName })

  const peak = Math.max(1, ...activity.days.map((d) => d.n))
  const doneLoop = loop.filter((l) => l.done).length

  /* V4 draws `padding:24px 26px` on every Oversikt card — six occurrences in
     the screen's own region — and this was `px-6` (24px), two short on each
     side. Measured against the bundle rather than noticed: Oversikt is
     v4-governed because W2 touched it, so 26px is the target and 24px was
     inherited from the frame an earlier handoff set. */
  const card = 'rounded-[18px] border border-line bg-sf px-[26px] py-6'

  return (
    <main className="animate-enter pt-[26px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="text-[12.5px] text-mut">{t('overline')}</div>
          <h1 className="mt-[6px] font-display text-[31px] font-medium leading-[1.12] tracking-[-0.015em] xl:text-[40px]">
            {greeting}
          </h1>
          <p className="mt-2 text-[14.5px] leading-[1.6] text-mut">
            {activeSurveys === 1
              ? t('greetSubOne', { answers: activity.thisWeek })
              : t('greetSubMany', { surveys: activeSurveys, answers: activity.thisWeek })}
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-[10px]">
            <Link
              href="/undersokelser/ny"
              className="touch-44 inline-flex cursor-pointer items-center whitespace-nowrap rounded-[10px] border-none bg-ac px-[22px] py-3 text-[13.5px] font-semibold text-acf no-underline"
            >
              {nav('newSurvey')}
            </Link>
            <Link
              href="/undersokelser/ny?tom=1"
              className="touch-44 inline-flex cursor-pointer items-center whitespace-nowrap rounded-[10px] border border-line bg-transparent px-[22px] py-3 text-[13.5px] font-semibold text-ink no-underline"
            >
              {nav('blankSurvey')}
            </Link>
          </div>
        ) : null}
      </div>

      {/* HeiTuva.dc.html:258 — 26px under the greeting, where "Krever
          handling" used to sit. */}
      {/* V4:272-286 — the workspace strip. Absent, not faked, when the registry
          has not been seeded: `workspace` is null and every module renders,
          which is the pre-W2 behaviour rather than an invented default. */}
      {workspace ? (
        <WorkspaceStrip
          dot={workspace.current.dot}
          tint={workspace.current.tint}
          label={workspace.current.label}
          hint={workspace.current.hint}
          layoutNote={
            workspace.presetTitle
              ? t('wsLayoutFollows', { preset: workspace.presetTitle })
              : t('wsLayoutOwn')
          }
          isCustom={workspace.current.key === 'custom'}
          modules={workspace.allModules}
          active={workspace.modules}
        />
      ) : null}

      {workspace?.empty ? (
        <WorkspaceEmpty title={t('wsEmptyTitle')} body={t('wsEmptyBody')} reset={t('wsReset')} />
      ) : null}

      {/* W2 · V4:6071-6074 — THE TEMPLATE IS COMPUTED, NOT FIXED. Switching a
          module off does not hide a card in place: it changes this row's grid,
          so the survivor grows from a column to the full width. That is a
          layout change at every breakpoint, which is why `verify:responsive`
          runs early on this phase rather than last.

          Delivered as a CSS variable because Tailwind cannot take a runtime
          value in a class, and applied at `xl` only — below it the row is one
          column regardless, which is what it already was. */}
      {/* Quiz og resultattavle — V4:333-360, the second of the two workspace-gated
          rows. Placed before row A because that is the bundle's order.

          WHAT IS NOT HERE, AND WHY. v4 draws an NPS row immediately above this
          one (V4:296-332) and it is NOT built — Q126. Measured rather than
          judged: `enps` exists as a question type and `results_summary` already
          computes a k-gated eNPS from it, and there are ZERO enps questions in
          any template pack or any seeded survey, so the card would be empty for
          every organisation that exists. Its right-hand panel, «Kritikere uten
          svar», is refused on stronger grounds than emptiness — see Q126.

          The copy below drops the bundle's «Fire alternativer» (Q121): a module
          label may not carry a count of the fixture in front of it, and
          `quizzable` is choice | yesno | dropdown, of which yesno has two. */}
      {show.quiz ? (
      <div className="mt-[18px] grid grid-cols-1 gap-[18px] xl:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-[18px] bg-ink px-7 py-[26px] text-sf">
          <div className="text-[11px] uppercase tracking-[.1em] opacity-70">{t('quizKicker')}</div>
          <h2 className="font-display text-[30px] font-medium leading-[1.15]">{t('quizTitle')}</h2>
          <p className="text-[13.5px] leading-[1.55] opacity-80">{t('quizBody')}</p>
          <div className="mt-1.5 flex flex-wrap gap-2.5">
            {canEdit ? (
              <Link
                href="/undersokelser/ny"
                className="flex min-h-[48px] items-center rounded-xl bg-ac px-[22px] py-[13px] text-[14.5px] font-bold text-ink"
              >
                {t('quizNew')}
              </Link>
            ) : null}
            <Link
              href="/bibliotek"
              className="flex min-h-[48px] items-center rounded-xl border border-sf/30 px-5 py-[13px] text-[14px] font-semibold text-sf"
            >
              {t('quizTemplate')}
            </Link>
          </div>
          {/* Never fabricate: no scheduled quiz renders the absence, not a date. */}
          <div className="text-[12.5px] opacity-70">{quizNext ?? t('quizNextNone')}</div>
        </div>

        <div className={card}>
          <h2 className="font-display text-[23px] font-medium">{t('quizBoards')}</h2>
          {quizRecent.length === 0 ? (
            <p className="mt-3 text-[13px] text-mut">{t('quizBoardsEmpty')}</p>
          ) : (
            quizRecent.map((q) => (
              <div key={q.id} className="flex items-center gap-3.5 border-b border-line py-3.5 last:border-b-0">
                <span
                  aria-hidden
                  className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-xl bg-sbg text-[14px]"
                >
                  ★
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold">{q.title}</span>
                  <span className="mt-0.5 block text-[12.5px] text-mut">{q.meta}</span>
                </span>
                {q.top ? (
                  <span className="whitespace-nowrap rounded-full bg-ac2 px-[11px] py-[5px] text-[11.5px] font-bold">
                    {q.top}
                  </span>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
      ) : null}

      {show.rowA ? (
      <div
        className="mt-[26px] grid grid-cols-1 gap-[18px] xl:grid-cols-[var(--row-cols)]"
        style={{ '--row-cols': show.rowACols } as React.CSSProperties}
      >
        {show.loop ? (
        /* Sløyfen lukket */
        <div className={card}>
          <h2 className="font-display text-[23px] font-medium">{t('loopClosed')}</h2>
          <p className="mt-[3px] text-[13px] text-mut">{t('loopClosedSub')}</p>

          {loop.length === 0 ? (
            <p className="mt-4 text-[13px] text-mut">{t('loopEmpty')}</p>
          ) : (
            loop.map((l) => (
              <div key={l.id} className="flex items-center gap-3 border-b border-line py-[13px]">
                <span className="block h-[10px] w-[10px] flex-none rounded-full bg-ac2" />
                <span className="flex-1 text-[14px]">{l.text}</span>
                <span className="whitespace-nowrap text-[13px] text-mut">
                  {l.when ?? t('loopAfterRound')}
                </span>
              </div>
            ))
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] text-mut">
              {t('loopGrade', { done: doneLoop, total: totalSurveys })}
            </span>
            {/* V2-4 · Q68 (DEFAULTED): the second WRITE path is what «do not run
                both» is about, and it is this form. Adding a task now happens in
                one place — Oppgaver — where the lifecycle and the close guard
                are. The card keeps its drawing and links there. D113. */}
            {canEdit ? (
              <Link
                href="/oppgaver"
                className="touch-44 rounded-[10px] border border-line bg-transparent px-[15px] py-[9px] text-[12.5px] font-semibold text-ink"
              >
                {t('addAction')}
              </Link>
            ) : null}
          </div>
        </div>
        ) : null}

        {show.activity ? (
        /* Svaraktivitet */
        <div className={card}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[23px] font-medium">{t('responseActivity')}</h2>
            <span className="text-[13px] text-mut">
              {t('answersThisYear', { count: activity.thisYear })}
            </span>
          </div>

          <div className="mt-[14px] flex items-end justify-between gap-4">
            <div>
              <div className="text-[13px] text-mut">{t('answersThisWeek')}</div>
              <div className="font-display text-[34px] font-semibold leading-[1.05]">
                {activity.thisWeek}
              </div>
            </div>
            <div className="rounded-xl bg-ac2 px-[14px] py-[10px]">
              <div className="text-[12px] text-[rgba(25,21,16,.7)]">{t('responseRate')}</div>
              <div className="mt-[2px] text-[16px] font-bold">
                {/* No invitations means no rate — not 0 %. A percentage over an
                    empty denominator is a fabricated measurement. */}
                {activity.completion === null ? (
                  <span className="text-[12px] font-normal">{t('noResponseRate')}</span>
                ) : (
                  `${activity.completion} %`
                )}
              </div>
            </div>
          </div>

          <div className="mt-[18px] flex h-[74px] items-end gap-[7px]">
            {activity.days.map((d, i) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.n}`}
                className="flex-1 rounded-t-md"
                style={{
                  height: `${Math.max(2, (d.n / peak) * 100)}%`,
                  background: i % 2 ? 'var(--ac2)' : 'var(--ac)',
                }}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-[10px]">
            <span className="text-[13px] text-mut">
              {/* Norwegian counts "1 uke" and "2 uker". A single message with a
                  {weeks} placeholder renders "1 uker på rad", which is the kind
                  of wrong that only a native reader notices and nobody
                  reports. */}
              {activity.streakWeeks === 0
                ? t('streakNone')
                : activity.streakWeeks === 1
                  ? t('streakOne')
                  : t('streak', { weeks: activity.streakWeeks })}
            </span>
            <span className="flex gap-1">
              {activity.weeks.map((w) => (
                <span
                  key={w.week}
                  className="block h-[9px] w-[9px] rounded-full"
                  style={{ background: w.active ? 'var(--ac)' : 'var(--sf2)' }}
                />
              ))}
            </span>
          </div>
        </div>
        ) : null}
      </div>
      ) : null}


      {/* The v1 bundle moves "Krever handling" out of the top slot and pairs
          it with the compliance card in a second grid below the two panels
          (HeiTuva.dc.html:305). The chip row it replaces is gone.

          W2: the pair's template is ASYMMETRIC when both are on — 1.6fr beside
          a 280px floor, V4:6074 — because one is a list that wants width and
          the other a card that needs a minimum. One survivor takes the full
          width like row A. */}
      {show.rowB ? (
      <div
        className="mt-[18px] grid grid-cols-1 items-stretch gap-[18px] xl:grid-cols-[var(--row-cols)]"
        style={{ '--row-cols': show.rowBCols } as React.CSSProperties}
      >
        {show.action ? (
        /* Krever handling */
        <div className="min-w-0 rounded-[18px] border border-line bg-sf px-[26px] py-6 shadow-[0_10px_28px_rgba(25,21,16,.06)]">
          <div className="flex flex-wrap items-baseline justify-between gap-[14px]">
            <h2 className="font-display text-[25px] font-medium">{t('requiresAction')}</h2>
            <span className="text-[13px] text-mut">{t('updatedNow')}</span>
          </div>

          {actions.length === 0 && !showOnboard ? (
            <div className="mt-[10px] py-4">
              <p className="text-[15px] font-semibold">{t('nothingRequiresAction')}</p>
              <p className="mt-[2px] text-[13px] text-mut">{t('nothingRequiresActionSub')}</p>
            </div>
          ) : null}

          <div className="mt-[10px] flex flex-col gap-[2px]">
            {actions.map((a) => (
              <div
                key={a.key}
                className="flex flex-wrap items-center gap-[15px] border-b border-line py-[15px]"
              >
                <span
                  className="block h-10 w-10 flex-none rounded-xl"
                  style={{ background: a.tint }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{a.title}</span>
                  <span className="mt-[2px] block text-[13px] text-mut">{a.sub}</span>
                </span>
                <Link
                  href={a.href}
                  className="touch-44 inline-flex cursor-pointer items-center whitespace-nowrap rounded-[10px] border-none bg-ac px-5 py-[11px] text-[13px] font-semibold text-acf no-underline"
                >
                  {a.cta}
                </Link>
              </div>
            ))}
          </div>

          {showOnboard ? (
            <div className="flex flex-wrap items-center gap-[15px] pt-[15px]">
              <span className="block h-10 w-10 flex-none rounded-xl border border-dashed border-line" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{t('onboardTitle')}</span>
                <span className="mt-[2px] block text-[13px] text-mut">{t('onboardSub')}</span>
              </span>
              <Link
                href="/undersokelser/ny"
                className="touch-44 inline-flex cursor-pointer items-center whitespace-nowrap rounded-[10px] border border-line bg-transparent px-5 py-[11px] text-[13px] font-semibold text-ink no-underline"
              >
                {t('start')}
              </Link>
            </div>
          ) : null}
        </div>
        ) : null}
        {show.duties ? (
        <ComplianceCard compliance={compliance} urgent={complianceUrgent} />
        ) : null}
      </div>
      ) : null}

      <span className="sr-only">{orgName}</span>
    </main>
  )
}
