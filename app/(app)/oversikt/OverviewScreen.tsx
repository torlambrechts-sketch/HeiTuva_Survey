import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LoopActionForm } from './LoopActionForm'

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
  days: string
  tone: string
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
  activity,
  loop,
  showOnboard,
}: {
  orgName: string
  firstName: string
  canEdit: boolean
  activeSurveys: number
  totalSurveys: number
  actions: ActionItem[]
  compliance: ComplianceChip[]
  activity: Activity
  loop: { id: string; text: string; when: string | null; done: boolean }[]
  showOnboard: boolean
}) {
  const t = await getTranslations('dash')
  const nav = await getTranslations('nav')

  const hour = new Date().getHours()
  const greeting =
    hour < 11 ? t('greetMorning', { name: firstName })
    : hour < 18 ? t('greetDay', { name: firstName })
    : t('greetEvening', { name: firstName })

  const peak = Math.max(1, ...activity.days.map((d) => d.n))
  const doneLoop = loop.filter((l) => l.done).length

  const card = 'rounded-[18px] border border-line bg-sf px-6 py-6'

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

      {/* Krever handling */}
      <div className={`mt-[26px] rounded-[18px] border border-line bg-sf px-6 py-6 shadow-[0_10px_28px_rgba(25,21,16,.06)]`}>
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

      {/* Lovpålagte frister */}
      <div className="mt-[18px] flex flex-wrap items-center gap-3">
        <span className="mr-[2px] text-[11px] uppercase tracking-[.1em] text-mut">
          {t('statutoryDeadlines')}
        </span>
        {compliance.map((c) => (
          <Link
            key={c.key}
            href="/rapporter"
            title={`${c.law} · ${c.due}`}
            className="touch-44 inline-flex cursor-pointer items-center gap-[9px] rounded-full border border-line bg-sf px-[15px] py-[9px] text-[12.5px] text-ink no-underline"
          >
            <span
              className="block h-[9px] w-[9px] flex-none rounded-full"
              style={{ background: c.tone }}
            />
            <span className="font-semibold">{c.title}</span>
            <span className="text-mut">{c.days}</span>
          </Link>
        ))}
      </div>

      <div className="mt-[18px] grid grid-cols-1 gap-[18px] xl:grid-cols-2">
        {/* Sløyfen lukket */}
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
            {canEdit ? <LoopActionForm label={t('addAction')} /> : null}
          </div>
        </div>

        {/* Svaraktivitet */}
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
      </div>

      <span className="sr-only">{orgName}</span>
    </main>
  )
}
