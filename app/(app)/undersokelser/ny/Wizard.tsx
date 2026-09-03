'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { ModalLayer } from '@/components/ModalLayer'
import {
  CADENCE_KEY,
  WIZARD_CADENCES,
  WIZARD_COUNT_MAX,
  WIZARD_COUNT_MIN,
  WIZARD_STEPS,
  type WizardCadence,
} from '../keys'
import { createBlankSurvey, createSurveyFromWizard } from '../actions'

/** The four step labels, as message keys in the design's order. */
const STEP_KEYS = WIZARD_STEPS

export type WizardPack = {
  id: string
  title: string
  tag: string
  questions: { text: string; typeLabel: string }[]
}

export type WizardGroup = { id: string; name: string; memberCount: number }

/**
 * Four steps, then one write.
 *
 * The step index and the selections stay in component state rather than the
 * URL — unlike every filter in this app. A half-filled wizard is not a view of
 * anything: nothing is persisted until "Opprett undersøkelsen", so a shareable
 * "step 3" link would restore a step with no answers behind it. The design
 * keeps it local too.
 *
 * Every string comes from the `wizard` namespace through `useTranslations`
 * rather than being threaded down as props: half of them interpolate values
 * that exist only in this component's state, so formatting them on the server
 * would mean sending the state up just to get the sentence back.
 */
export function Wizard({ packs, groups }: { packs: WizardPack[]; groups: WizardGroup[] }) {
  const t = useTranslations('wizard')
  const tSurveys = useTranslations('surveys')


  const [step, setStep] = useState(0)
  const [packId, setPackId] = useState(packs[0]?.id ?? '')
  const [count, setCount] = useState(4)
  const [chosen, setChosen] = useState<Record<string, boolean>>({})
  const [cadence, setCadence] = useState<WizardCadence>('weekly')
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  const pack = packs.find((p) => p.id === packId)

  /**
   * The slider offers 2-7 as the design does, but a pack can hold fewer
   * questions than the number picked. The design slices silently and still says
   * "med 7 spørsmål" in its summary; reporting the number that will actually be
   * created is the honest reading. docs/DEVIATIONS.md D28.
   */
  const effectiveCount = Math.min(count, pack?.questions.length ?? count)
  const shownQuestions = pack?.questions.slice(0, effectiveCount) ?? []
  const respondentMinutes = Math.max(1, Math.round(effectiveCount * 0.4))

  const people = groups.reduce((sum, g) => (chosen[g.id] ? sum + g.memberCount : sum), 0)
  const isLast = step === 3

  function submit(formData: FormData) {
    setFailed(false)
    startTransition(async () => {
      const result = await createSurveyFromWizard(formData)
      if (!result.ok) setFailed(true)
    })
  }

  return (
    <ModalLayer>
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-auto p-0 md:p-8"
      style={{ background: 'rgba(25,21,16,.42)' }}
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
    >
      {/* Below md a modal is a full-screen sheet, per RESPONSIVE.md — no
          rounded corners, no max height, close affordance top-right. */}
      <div className="max-h-full w-full overflow-auto rounded-none border border-line bg-sf p-6 md:max-h-[88vh] md:max-w-[660px] md:rounded-[22px] md:p-[30px]">
        <div className="flex items-start justify-between gap-[14px]">
          <div>
            <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('overline')}</div>
            <h1 className="mt-1 font-display text-[27px] font-medium">{t('title')}</h1>
          </div>
          <Link
            href="/undersokelser"
            aria-label={t('close')}
            className="touch-44 flex flex-none items-center justify-center border-none bg-transparent text-[19px] leading-none text-mut no-underline"
          >
            ×
          </Link>
        </div>

        {/* Step indicator stays at every width (RESPONSIVE.md, Modals). */}
        <div className="mt-5 flex flex-wrap items-center gap-[10px]">
          {STEP_KEYS.map((key, i) => (
            <span key={key} className="flex flex-1 items-center gap-2">
              <span
                className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: i <= step ? 'var(--ac)' : 'var(--sf2)',
                  color: i <= step ? 'var(--ink)' : 'var(--mut)',
                }}
              >
                {i + 1}
              </span>
              <span
                className="text-[12.5px]"
                style={{ fontWeight: i === step ? 700 : 500 }}
                aria-current={i === step ? 'step' : undefined}
              >
                {t(key)}
              </span>
            </span>
          ))}
        </div>
        <div
          className="mt-3 h-[6px] overflow-hidden rounded-full"
          style={{ background: 'var(--sf2)' }}
        >
          <div
            className="h-full rounded-full bg-ac"
            style={{ width: `${Math.round(((step + 1) / 4) * 100)}%` }}
          />
        </div>

        {step === 0 ? (
          <div className="mt-[22px]">
            <div className="mb-[18px] flex flex-wrap items-center gap-[14px] rounded-xl border border-dashed border-line bg-bg px-[18px] py-4">
              <span className="flex-1">
                <span className="block text-sm font-semibold">{t('skipTitle')}</span>
                <span className="mt-[2px] block text-[13px] text-mut">{t('skipSub')}</span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setFailed(false)
                  startTransition(async () => {
                    const result = await createBlankSurvey()
                    if (!result.ok) setFailed(true)
                  })
                }}
                className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-ink bg-transparent px-5 py-3 text-[13.5px] font-semibold text-ink disabled:opacity-60"
              >
                {t('startBlank')}
              </button>
            </div>
            <h2 className="text-[15px] font-semibold">{t('purpose')}</h2>
            <div className="mt-[14px] flex flex-col gap-[9px]">
              {packs.length === 0 ? (
                <p className="text-[13px] text-mut">{t('noPacks')}</p>
              ) : (
                packs.map((p) => {
                  const on = p.id === packId
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPackId(p.id)}
                      className="touch-44 flex cursor-pointer items-start gap-[11px] rounded-xl border px-[15px] py-[13px] text-left text-ink"
                      style={{
                        borderColor: on ? 'var(--ink)' : 'var(--line)',
                        background: on ? 'var(--sbg)' : 'var(--bg)',
                      }}
                    >
                      <span
                        className="mt-[2px] flex h-4 w-4 flex-none items-center justify-center rounded-full border-[1.5px]"
                        style={{ borderColor: on ? 'var(--ink)' : 'var(--line)' }}
                      >
                        <span
                          className="block h-2 w-2 rounded-full"
                          style={{ background: on ? 'var(--ink)' : 'transparent' }}
                        />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{p.title}</span>
                        <span className="mt-[2px] block text-[13px] text-mut">
                          {t('packMeta', { count: p.questions.length, tag: p.tag })}
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mt-[22px]">
            <h2 className="text-[15px] font-semibold">{t('questionCount')}</h2>
            <div className="mt-[14px] flex flex-wrap items-center gap-[14px]">
              <input
                type="range"
                min={WIZARD_COUNT_MIN}
                max={WIZARD_COUNT_MAX}
                step={1}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                aria-label={t('countAria')}
                // A range input paints its own 16px track and cannot take the
                // ::after overlay, so the touch height comes from the element.
                className="min-w-[180px] flex-1 py-[14px] md:py-0"
              />
              <span className="whitespace-nowrap text-[13px] text-mut">
                {t('countLabel', { count: effectiveCount, mins: respondentMinutes })}
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {shownQuestions.map((q, i) => (
                <div
                  key={`${q.text}-${i}`}
                  className="flex items-center gap-[11px] rounded-xl border border-line bg-bg px-[14px] py-3"
                >
                  <span
                    className="flex h-6 w-6 flex-none items-center justify-center rounded-lg text-xs font-semibold"
                    style={{ background: 'var(--sf2)' }}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[13.5px]">{q.text}</span>
                  <span className="whitespace-nowrap text-xs text-mut">{q.typeLabel}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-mut">{t('editLater')}</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-[22px]">
            <h2 className="text-[15px] font-semibold">{t('whoAnswers')}</h2>
            {groups.length === 0 ? (
              <p className="mt-[14px] text-[13.5px] text-mut">{t('noGroupsYet')}</p>
            ) : (
              <div className="mt-[14px] grid grid-cols-1 gap-[10px] md:grid-cols-2">
                {groups.map((g) => {
                  const on = Boolean(chosen[g.id])
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setChosen((c) => ({ ...c, [g.id]: !c[g.id] }))}
                      className="touch-44 cursor-pointer rounded-xl border px-[15px] py-[14px] text-left text-sm font-semibold text-ink"
                      style={{
                        borderColor: on ? 'var(--ink)' : 'var(--line)',
                        background: on ? 'var(--ac)' : 'transparent',
                      }}
                    >
                      {g.name}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="mt-3 text-[13.5px] text-mut">
              {people ? t('peopleChosen', { count: people }) : t('noGroups')}{' '}
              {t('importLater')}
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-[22px]">
            <h2 className="text-[15px] font-semibold">{t('howOften')}</h2>
            <div className="mt-[14px] flex flex-wrap gap-[9px]">
              {WIZARD_CADENCES.map((c) => {
                const on = cadence === c
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCadence(c)}
                    className="touch-44 cursor-pointer rounded-xl border px-[22px] py-[13px] text-sm font-semibold text-ink"
                    style={{
                      borderColor: on ? 'var(--ink)' : 'var(--line)',
                      background: on ? 'var(--ac)' : 'transparent',
                    }}
                  >
                    {t(CADENCE_KEY[c].chip)}
                  </button>
                )
              })}
            </div>
            <div className="mt-[18px] rounded-[13px] bg-sbg px-[18px] py-4">
              <div className="text-[13px] font-semibold">{t('summary')}</div>
              <p className="mt-[6px] text-sm leading-relaxed">
                {t('summaryLine', {
                  title: pack?.title ?? '',
                  count: effectiveCount,
                  people,
                  cadence: t(CADENCE_KEY[cadence].sentence),
                })}
              </p>
            </div>
          </div>
        ) : null}

        {failed ? (
          <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
            {tSurveys('actionFailed')}
          </p>
        ) : null}

        <form action={submit} className="mt-6 flex flex-wrap gap-[10px]">
          <input type="hidden" name="packId" value={packId} />
          <input type="hidden" name="count" value={effectiveCount} />
          <input type="hidden" name="cadence" value={cadence} />
          {groups.filter((g) => chosen[g.id]).map((g) => (
            <input key={g.id} type="hidden" name="groupIds" value={g.id} />
          ))}

          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="touch-44 cursor-pointer rounded-[11px] border border-line bg-transparent px-[22px] py-[13px] text-sm font-semibold text-ink"
            >
              {t('back')}
            </button>
          ) : null}
          {isLast ? (
            <button
              type="submit"
              disabled={pending || !packId}
              className="touch-44 flex-1 cursor-pointer rounded-[11px] border-none py-[13px] text-[15px] font-bold disabled:opacity-60"
              style={{ background: 'var(--ink)', color: 'var(--sf)' }}
            >
              {t('create')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(3, s + 1))}
              disabled={!packId}
              className="touch-44 flex-1 cursor-pointer rounded-[11px] border-none bg-ac py-[13px] text-[15px] font-bold text-ink disabled:opacity-60"
            >
              {t('next')}
            </button>
          )}
        </form>
      </div>
    </div>
    </ModalLayer>
  )
}
