'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  AUDIENCES,
  COMMENT_SCOPES,
  ENGAGE_TOGGLES,
  INCENTIVES,
  incentiveWarns,
  showsCharityField,
  showsPrizeField,
  type Audience,
  type CommentScope,
  type Engagement,
  type Incentive,
} from '@/lib/engagement'

const AUDIENCE_KEY: Record<Audience, string> = { ansatte: 'audAnsatte', kunder: 'audKunder' }
const AUDIENCE_NOTE: Record<Audience, string> = {
  ansatte: 'audNoteAnsatte',
  kunder: 'audNoteKunder',
}
const INCENTIVE_KEY: Record<Incentive, { label: string; desc: string }> = {
  ingen: { label: 'incIngen', desc: 'incIngenDesc' },
  lotteri: { label: 'incLotteri', desc: 'incLotteriDesc' },
  alle: { label: 'incAlle', desc: 'incAlleDesc' },
  veldedig: { label: 'incVeldedig', desc: 'incVeldedigDesc' },
}
const TOGGLE_KEY = {
  personal: { label: 'tPersonal', desc: 'tPersonalDesc' },
  deadline: { label: 'tDeadline', desc: 'tDeadlineDesc' },
  show_progress: { label: 'tShowProgress', desc: 'tShowProgressDesc' },
  one_question: { label: 'tOneQuestion', desc: 'tOneQuestionDesc' },
  reveal_results: { label: 'tRevealResults', desc: 'tRevealResultsDesc' },
  follow_up: { label: 'tFollowUp', desc: 'tFollowUpDesc' },
} as const
const COMMENT_KEY: Record<CommentScope, { label: string; desc: string; note: string }> = {
  ingen: { label: 'cIngen', desc: 'cIngenDesc', note: 'cNoteIngen' },
  lav: { label: 'cLav', desc: 'cLavDesc', note: 'cNoteLav' },
  alle: { label: 'cAlle', desc: 'cAlleDesc', note: 'cNoteAlle' },
}

const input =
  'touch-44-field mt-[11px] w-full rounded-[10px] border border-line bg-bg px-[14px] py-[11px] text-[13.5px] text-ink outline-none disabled:opacity-60'

/**
 * "Engasjement og svarprosent" — the design's panel inside the Builder's
 * Innstillinger tab (L:556-650).
 *
 * It belongs to the Builder, not to Send: what it sets is part of what the
 * survey *is*. `one_question`, `show_progress`, `reveal_results` and
 * `comments` change how /s/[token] renders in Phase 3; `personal`, `deadline`
 * and `thank_you` change what the invitation says.
 *
 * **It shows no estimated response rate, and D232 is why.** The number that used
 * to sit in the header was eleven constants nothing measures; the reasoning is
 * in `lib/engagement.ts` where the function was. The panel says so on the
 * screen rather than leaving a silent gap.
 */
export function EngagementPanel({
  value,
  disabled,
  onChange,
}: {
  value: Engagement
  /* No `questionCount`. It reached this component for one reason — the deleted
     estimate's `−12 over eight questions` term — and a prop kept after its only
     reader is gone is how a later phase concludes the panel still knows
     something about length. */
  disabled: boolean
  onChange: (patch: Partial<Engagement>) => void
}) {
  const t = useTranslations('builder')
  const [open, setOpen] = useState(true)

  return (
    <section className="rounded-2xl border border-line bg-sf p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-[14px]">
        <div>
          <h2 className="font-display text-[21px] font-bold">{t('engageTitle')}</h2>
          <p className="mt-[2px] text-[13px] text-mut">{t('engageScopeNote')}</p>
        </div>
        {/* D232 — THE NUMBER THAT WAS HERE IS GONE, AND THE SLOT IS NOT REFILLED.
            v7:9979-9984 computes «68 % · forventet svar» from eleven constants
            nothing measures. Tor: a prediction about the customer's own data is
            the one form where she finds out it was wrong by acting on it. The
            reasoning is in `lib/engagement.ts` beside the deleted function. */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="touch-44 cursor-pointer rounded-[10px] border border-line bg-transparent px-4 py-[10px] text-[12.5px] font-semibold text-ink"
          >
            {t('engageToggle')}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold">{t('whoResponds')}</span>
            <span
              className="flex flex-wrap gap-[3px] rounded-full p-1"
              style={{ background: 'var(--sf2)' }}
            >
              {AUDIENCES.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={value.audience === a}
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      // Switching to employees clears an incentive that would
                      // be inappropriate there, exactly as the design does
                      // (L:3745) — otherwise the warning appears
                      // for a choice the user cannot see any more.
                      a === 'ansatte' ? { audience: a, incentive: 'ingen' } : { audience: a },
                    )
                  }
                  className="touch-44 cursor-pointer rounded-full border-none px-4 py-[7px] text-[12.5px] font-semibold text-ink disabled:opacity-60"
                  style={{ background: value.audience === a ? 'var(--ac)' : 'transparent' }}
                >
                  {t(AUDIENCE_KEY[a])}
                </button>
              ))}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-mut">{t(AUDIENCE_NOTE[value.audience])}</p>

          <div className="my-[18px] h-px" style={{ background: 'var(--line)' }} />

          <h3 className="text-[13px] font-semibold">{t('incentive')}</h3>
          <div className="mt-[10px] grid grid-cols-1 gap-[9px] md:grid-cols-2">
            {INCENTIVES.map((i) => {
              const on = value.incentive === i
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => onChange({ incentive: i })}
                  className="touch-44 flex cursor-pointer items-start gap-[11px] rounded-xl border px-[15px] py-[13px] text-left text-ink disabled:opacity-60"
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
                    <span className="block text-[13.5px] font-semibold">
                      {t(INCENTIVE_KEY[i].label)}
                    </span>
                    <span className="mt-[2px] block text-[13px] leading-snug text-mut">
                      {t(INCENTIVE_KEY[i].desc)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {showsPrizeField(value) ? (
            <input
              value={value.prize}
              onChange={(e) => onChange({ prize: e.target.value })}
              disabled={disabled}
              placeholder={t('prizePlaceholder')}
              aria-label={t('prizePlaceholder')}
              className={input}
            />
          ) : null}
          {showsCharityField(value) ? (
            <input
              value={value.charity}
              onChange={(e) => onChange({ charity: e.target.value })}
              disabled={disabled}
              placeholder={t('charityPlaceholder')}
              aria-label={t('charityPlaceholder')}
              className={input}
            />
          ) : null}
          {incentiveWarns(value) ? (
            <p role="alert" className="mt-[11px] rounded-[11px] bg-ac3 px-[14px] py-[11px] text-[12.5px] leading-relaxed">
              {t('incentiveWarning')}
            </p>
          ) : null}

          <div className="my-[18px] h-px" style={{ background: 'var(--line)' }} />

          <div className="flex flex-col gap-[13px]">
            {ENGAGE_TOGGLES.map((k) => (
              <div key={k} className="flex items-center gap-[14px]">
                <span className="flex-1">
                  <span className="block text-[13.5px] font-semibold">{t(TOGGLE_KEY[k].label)}</span>
                  <span className="mt-[2px] block text-[13px] text-mut">{t(TOGGLE_KEY[k].desc)}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={value[k]}
                  aria-label={t(TOGGLE_KEY[k].label)}
                  disabled={disabled}
                  onClick={() => onChange({ [k]: !value[k] } as Partial<Engagement>)}
                  className="touch-44 flex h-[26px] w-[46px] flex-none cursor-pointer rounded-full border-none p-[3px] disabled:opacity-60"
                  style={{
                    background: value[k] ? 'var(--ac)' : 'var(--sf2)',
                    justifyContent: value[k] ? 'flex-end' : 'flex-start',
                  }}
                >
                  <span className="block h-5 w-5 rounded-full bg-white" />
                </button>
              </div>
            ))}
          </div>

          <div className="my-[18px] h-px" style={{ background: 'var(--line)' }} />

          <h3 className="text-[13px] font-semibold">{t('commentsHeading')}</h3>
          <div className="mt-[10px] flex flex-wrap gap-[9px]">
            {COMMENT_SCOPES.map((c) => {
              const on = value.comments === c
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => onChange({ comments: c })}
                  className="touch-44 flex-1 basis-[180px] cursor-pointer rounded-xl border px-[15px] py-[13px] text-left text-ink disabled:opacity-60"
                  style={{
                    borderColor: on ? 'var(--ink)' : 'var(--line)',
                    background: on ? 'var(--ac)' : 'transparent',
                  }}
                >
                  <span className="block text-[13.5px] font-semibold">{t(COMMENT_KEY[c].label)}</span>
                  <span className="mt-[2px] block text-[13px] leading-snug text-mut">
                    {t(COMMENT_KEY[c].desc)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-[9px] text-[13px] leading-relaxed text-mut">
            {t(COMMENT_KEY[value.comments].note)}
          </p>

          <div className="my-[18px] h-px" style={{ background: 'var(--line)' }} />

          <label className="block">
            <span className="block text-[13px] font-semibold">{t('thankYouLabel')}</span>
            <input
              value={value.thank_you}
              onChange={(e) => onChange({ thank_you: e.target.value })}
              disabled={disabled}
              aria-label={t('thankYouLabel')}
              className={`${input} mt-2`}
            />
          </label>
          {/* G1 — «Hva skjer nå» on the thanks screen. A TEXTAREA rather than an
              input because the drawing's own example is a full sentence about a
              committee and a week, and a one-line field would teach people to
              write less than the card is for.

              The hint says who reads it. That is what makes this field need no
              publication flag while `tasks.shared_with_respondents` does: this
              one is authored FOR the respondent and says so at the moment of
              writing. */}
          <label className="mt-[18px] block">
            <span className="block text-[13px] font-semibold">{t('nextStepsLabel')}</span>
            <span className="mt-[2px] block text-[13px] leading-snug text-mut">
              {t('nextStepsHint')}
            </span>
            <textarea
              value={value.next_steps}
              onChange={(e) => onChange({ next_steps: e.target.value })}
              disabled={disabled}
              rows={2}
              maxLength={600}
              aria-label={t('nextStepsLabel')}
              placeholder={t('nextStepsPlaceholder')}
              className={`${input} mt-2 resize-y leading-[1.5]`}
            />
          </label>

          {/* Said on the screen rather than left out, which is this project's
              habit for anything it refuses to show: Live names four unavailable
              panels, Hjelp says status and chat are not set up, Målgruppe writes
              its refused half into the page. A missing estimate reads as one
              somebody did not finish; a refused one reads as a decision. */}
          <p className="mt-[10px] text-[13px] text-mut">{t('engageNoEstimate')}</p>
        </div>
      ) : null}
    </section>
  )
}
