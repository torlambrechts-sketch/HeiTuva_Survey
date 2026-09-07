import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

type Status = 'utkast' | 'aktiv' | 'lukket'

/** The pill's own colours, which the design states literally rather than as
 *  theme tokens (HeiTuva.dc.html:3402-3403) — they are the only greens and
 *  browns in the app. */
const STATUS_STYLE: Record<Status, { background: string; color: string }> = {
  aktiv: { background: '#E4F2E0', color: '#2F5D2A' },
  lukket: { background: '#F3E7DE', color: '#8A4B22' },
  utkast: { background: 'var(--sf2)', color: 'var(--mut)' },
}

const STATUS_KEY: Record<Status, string> = {
  utkast: 'statusUtkast',
  aktiv: 'statusAktiv',
  lukket: 'statusLukket',
}

/** Which of the three steps this screen is. */
export type SurveyStep = 'bygg' | 'send' | 'resultater'

const STEPS: { step: SurveyStep; num: string; key: string }[] = [
  { step: 'bygg', num: '1', key: 'stepBuild' },
  { step: 'send', num: '2', key: 'stepSend' },
  { step: 'resultater', num: '3', key: 'stepResults' },
]

/**
 * The survey context bar — HeiTuva.dc.html:194-211.
 *
 * The design puts it above Bygg, Send and Resultater alike (`inSurvey`), so it
 * lives beside those routes rather than inside the Builder: it is what tells
 * you WHICH survey you are editing, and Phase 3's Send screen renders the same
 * bar with `current="send"`.
 *
 * Send and Resultater do not exist until Phases 3 and 4. Their steps still
 * link, as the design's do — docs/DEVIATIONS.md D29 covers the forward links
 * the survey list already carries.
 */
export async function SurveyContextBar({
  surveyId,
  title,
  audience,
  status,
  recurrence,
  current,
}: {
  surveyId: string
  title: string
  audience: string | null
  status: Status
  /**
   * The ↻ chip (NEW:228-230). Empty when the survey has no series. Formatted
   * by the caller from `lib/schedules/status.ts` — the same sentence the list
   * row, the Send screen and the rounds panel show.
   */
  recurrence?: string
  current: SurveyStep
}) {
  const t = await getTranslations('surveyNav')

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-sf px-[22px] py-4">
      <div className="flex min-w-0 items-center gap-[14px]">
        <Link
          href="/undersokelser"
          aria-label={t('back')}
          className="touch-44 flex cursor-pointer items-center whitespace-nowrap rounded-[10px] border border-line bg-transparent px-[14px] py-[9px] text-[12.5px] font-semibold text-ink no-underline"
        >
          ←
        </Link>
        <span className="min-w-0">
          <span className="block font-display text-xl font-medium leading-[1.2]">
            {title}
          </span>
          {audience ? (
            <span className="mt-[2px] block text-[13px] text-mut">
              {audience}
            </span>
          ) : null}
        </span>
        <span
          className="whitespace-nowrap rounded-full px-3 py-[5px] text-xs font-bold"
          style={STATUS_STYLE[status]}
        >
          {t(STATUS_KEY[status] as 'statusUtkast')}
        </span>
        {recurrence ? (
          <span
            className="inline-block rounded-full px-[10px] py-1 text-[11.5px] font-semibold"
            style={{ background: 'var(--sbg)' }}
          >
            ↻ {recurrence}
          </span>
        ) : null}
      </div>
      {/* RESPONSIVE.md § Tab rails: the rail wraps below md and each step keeps
          its design size, so the three 44px targets stay apart. */}
      <div className="flex flex-wrap gap-2 rounded-full bg-sf2 p-1 md:gap-[3px]">
        {STEPS.map((s) => {
          const active = s.step === current
          return (
            <Link
              key={s.step}
              href={`/undersokelser/${surveyId}/${s.step}`}
              aria-current={active ? 'step' : undefined}
              className={`touch-44 flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[12.5px] text-ink no-underline ${
                active ? 'font-bold' : 'font-medium'
              }`}
              style={{ background: active ? 'var(--ac)' : 'var(--sf2)' }}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sf text-[11px] font-bold">
                {s.num}
              </span>
              {t(s.key as 'stepBuild')}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
