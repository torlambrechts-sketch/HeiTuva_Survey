'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setSurveyPolicy } from './actions'
import { policyWarnings, type PolicyState } from '@/lib/questions/policy-warnings'
import type { QualityRule } from '@/lib/questions/quality'
import { thresholdTier } from '@/lib/questions/threshold-tier'

/**
 * "Hvem svarer og hva vises" — V1:577-635, the v1 bundle's new
 * first card of the Builder's Innstillinger tab.
 *
 * This is Q17 §1 and §2 on screen: who answers, whether they are named, and the
 * threshold that governs what can be shown. The panel is the ONLY writer of
 * those three columns (DECISIONS Q36) — but it is not the enforcement. Every
 * refusal it can hit is a database rule: `app.guard_survey_policy` (M:0034:76)
 * raises `policy_locked` for a sent or pack-governed survey and
 * `threshold_admin_only` for anyone but an administrator, and 0036's CHECK
 * bounds the threshold. The panel disables what the guard would refuse and
 * shows the reason; it does not re-implement the rule.
 *
 * The threshold chips are 3/4/5/8/10 (:4855) — the panel's values ARE Q36's
 * accepted range, which is why the server's ceiling and this list have to be
 * read together rather than either being taken as the rule.
 */
export type PolicyPanelProps = {
  surveyId: string
  respondentKind: 'person' | 'organisation'
  anonymity: 'anonymous' | 'named' | 'optional'
  kThreshold: number
  /** How many people the survey is aimed at; 0 when nobody has been chosen yet. */
  target: number
  /** The guard will refuse a change: the survey is sent, or a statutory pack governs it. */
  locked: boolean
  /** The pack's legal reference when a pack is what locked it, else null. */
  lockedByPackLegal: string | null
  /** Only an administrator may write the policy; anyone else sees it read-only. */
  canEdit: boolean
  questions: { id: string; text: string }[]
  rules: QualityRule[]
}

const THRESHOLDS = [2, 3, 4, 5, 8, 10] as const
const KINDS = ['person', 'organisation'] as const
const ANONYMITIES = ['anonymous', 'named', 'optional'] as const

export function PolicyPanel({
  surveyId,
  respondentKind,
  anonymity,
  kThreshold,
  target,
  locked,
  lockedByPackLegal,
  canEdit,
  questions,
  rules,
}: PolicyPanelProps) {
  const t = useTranslations('builder')
  const tSend = useTranslations('send')
  const [open, setOpen] = useState(false)
  const [policy, setPolicy] = useState<PolicyState>({
    respondentKind,
    anonymity,
    kThreshold,
    target,
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The guard would refuse, or the viewer may not write: either way the chips
  // are inert. Kept visible and disabled rather than hidden — the current
  // policy is the point of the card, and a locked survey still has one.
  const frozen = locked || !canEdit
  // In flight is NOT the same state, and must not look like it. Both stop a
  // press, but `frozen` also greys the selected chip to `--sf2` to say "this
  // cannot change", and a save that briefly painted the same thing would tell
  // the reader their survey had just been locked. So pending disables without
  // restyling — caught in the mobile capture of the low-threshold state, where
  // the screenshot lands mid-transition.
  const busy = frozen || pending

  const save = (next: Partial<PolicyState>) => {
    if (busy) return
    // An organisation survey is always named (the action refuses anything else,
    // and Q47 assumes it), so switching kind carries anonymity with it.
    const merged: PolicyState = { ...policy, ...next }
    if (merged.respondentKind === 'organisation') merged.anonymity = 'named'
    setPolicy(merged)
    setError(null)
    startTransition(async () => {
      const r = await setSurveyPolicy({
        surveyId,
        kThreshold: merged.kThreshold,
        respondentKind: merged.respondentKind,
        anonymity: merged.anonymity,
      })
      if (!r.ok) {
        // Put the old policy back. A chip that stays where the reader pressed
        // it while the database holds something else is worse than no chip.
        setPolicy({ respondentKind, anonymity, kThreshold, target })
        setError(t(`policyError_${r.error}`))
      }
    })
  }

  const warnings = policyWarnings(policy, questions, rules, ({ target, k }) =>
    t('policyWarnTargetBelow', { target, k }),
  )

  const summary =
    policy.respondentKind === 'organisation' ? t('policySummaryOrganisation')
    : policy.anonymity === 'named' ? t('policySummaryNamed')
    : policy.anonymity === 'optional' ? t('policySummaryOptional', { k: policy.kThreshold })
    : t('policySummaryAnonymous', { k: policy.kThreshold })

  // Reuses the Send screen's lock sentences (Q17, Phase 9) rather than a second
  // set that would drift from them: the two screens describe one state.
  const lockText =
    lockedByPackLegal !== null ?
      policy.respondentKind === 'organisation' ?
        tSend('lockedByPackAttributed', { legalRef: lockedByPackLegal })
      : tSend('lockedByPack', {
          legalRef: lockedByPackLegal,
          anonymity: tSend('lockedAnonymousWord'),
          k: policy.kThreshold,
        })
    : locked ? tSend('lockedBySent')
    : ''

  // The bundle's chip states (:4850): selected is ink-bordered; selected while
  // locked drops to `--sf2` so a frozen choice does not read as pressable.
  const chip = (on: boolean, lockedNow: boolean) => ({
    background: on ? (lockedNow ? 'var(--sf2)' : 'var(--ac)') : 'transparent',
    borderColor: on ? 'var(--ink)' : 'var(--line)',
    color: lockedNow && !on ? 'var(--mut)' : 'var(--ink)',
    cursor: lockedNow ? 'default' : 'pointer',
  })

  const chipClass =
    'touch-44 rounded-full border px-[14px] py-2 text-[12.5px] font-semibold disabled:opacity-100'

  return (
    <div className="rounded-2xl border border-line bg-sf p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold">{t('policyTitle')}</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="touch-44 cursor-pointer rounded-full border border-line bg-transparent px-[13px] py-[7px] text-[12px] font-semibold text-ink"
        >
          {open ? t('policyClose') : t('policyEdit')}
        </button>
      </div>

      <p className="mt-2 text-[13px] leading-normal text-mut">{summary}</p>

      {warnings.length > 0 ? (
        <div className="mt-[10px] flex flex-col gap-[7px]">
          {warnings.map((w) => (
            <p
              key={w.key}
              className="rounded-[10px] px-3 py-[10px] text-[12.5px] leading-normal"
              style={{ background: 'var(--ac3)' }}
            >
              {w.text}
            </p>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-[10px] rounded-[10px] px-3 py-[10px] text-[12.5px]" style={{ background: 'var(--ac3)' }}>
          {error}
        </p>
      ) : null}

      {open ? (
        <div className="mt-[14px] flex flex-col gap-4">
          {lockText ? (
            <div
              className="flex items-start gap-[10px] rounded-[10px] px-[13px] py-[11px]"
              style={{ background: 'var(--sf2)' }}
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" aria-hidden="true" className="mt-[2px] flex-none text-mut"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span className="text-[12.5px] leading-normal text-mut">{lockText}</span>
            </div>
          ) : null}

          <div>
            <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('policyWhoAnswers')}</div>
            <div className="mt-[9px] flex flex-wrap gap-[7px]">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={busy}
                  aria-pressed={policy.respondentKind === k}
                  onClick={() => save({ respondentKind: k })}
                  className={chipClass}
                  style={chip(policy.respondentKind === k, frozen)}
                >
                  {t(k === 'person' ? 'policyKindPerson' : 'policyKindOrganisation')}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] leading-normal text-mut">
              {t(
                policy.respondentKind === 'organisation' ?
                  'policyKindNoteOrganisation'
                : 'policyKindNotePerson',
              )}
            </p>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('policyAnonymity')}</div>
            <div className="mt-[9px] flex flex-wrap gap-[7px]">
              {ANONYMITIES.map((a) => {
                // Organisation mode fixes anonymity at «Med navn», so every chip
                // here is inert — including the selected one.
                const inert = frozen || policy.respondentKind === 'organisation'
                return (
                  <button
                    key={a}
                    type="button"
                    disabled={inert || pending}
                    aria-pressed={policy.anonymity === a}
                    onClick={() => save({ anonymity: a })}
                    className={chipClass}
                    style={chip(policy.anonymity === a, inert)}
                  >
                    {t(
                      a === 'anonymous' ? 'policyAnonAnonymous'
                      : a === 'named' ? 'policyAnonNamed'
                      : 'policyAnonOptional',
                    )}
                  </button>
                )
              })}
            </div>
            {policy.respondentKind === 'organisation' ? (
              <p className="mt-2 text-[12.5px] leading-normal text-mut">
                {t('policyAnonNoteOrganisation')}
              </p>
            ) : null}
          </div>

          {policy.respondentKind === 'person' ? (
            <div>
              <div className="text-[11px] uppercase tracking-[.1em] text-mut">
                {t('policyThreshold')}
              </div>
              <div className="mt-[9px] flex flex-wrap gap-[7px]">
                {THRESHOLDS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={busy}
                    aria-pressed={policy.kThreshold === n}
                    onClick={() => save({ kThreshold: n })}
                    className={`${chipClass} min-w-10 px-3`}
                    style={chip(policy.kThreshold === n, frozen)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12.5px] text-mut">{t('policyRecommended')}</p>
              {/* DECISIONS Q91 — TWO TIERS, and the tiers are not degrees of the
                  same warning. Below 5, answers from a small group are HARDER TO
                  KEEP APART. At 2 the other respondent can DERIVE yours exactly
                  by subtraction — a different claim, so it gets different words
                  and a heavier ground (`--ac3` rather than `--sbg`). Writing 2
                  as "even smaller" would be the one real error Q17 named: copy
                  that promises more than the setting holds. */}
              {thresholdTier(policy.kThreshold) === 'two' ? (
                <p
                  className="mt-[10px] rounded-[10px] px-[14px] py-3 text-[12.5px] leading-[1.55]"
                  style={{ background: 'var(--ac3)' }}
                >
                  {t('policyTwoText')}
                </p>
              ) : thresholdTier(policy.kThreshold) === 'low' ? (
                <p
                  className="mt-[10px] rounded-[10px] px-[14px] py-3 text-[12.5px] leading-[1.55]"
                  style={{ background: 'var(--sbg)' }}
                >
                  {t('policyLowText', { k: policy.kThreshold })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
