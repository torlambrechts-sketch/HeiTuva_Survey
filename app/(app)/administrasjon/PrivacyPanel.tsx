'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setDefaultThreshold, setPrivacy, setRetention } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'
import { PRIVACY_KEYS, type PrivacyKey } from './keys'
import { thresholdTier } from '@/lib/questions/threshold-tier'
import { RETENTION_ORDER } from '@/lib/surveys/retention'

const LABEL: Record<PrivacyKey, [string, string]> = {
  ip_logging: ['pIpLogging', 'pIpLoggingDesc'],
  eu_only: ['pEuOnly', 'pEuOnlyDesc'],
  auto_delete: ['pAutoDelete', 'pAutoDeleteDesc'],
  consent: ['pConsent', 'pConsentDesc'],
}

/** DECISIONS Q57 / Q38 — the picker v2 draws (HeiTuva.dc.html:2737-2747). The
 *  10 is Q36's ceiling. The low end is 2 since Q91 superseded Q17's floor of 3
 *  — the bundle draws 3/5/8/10, so 2 is an addition the decision requires and
 *  D107 logs. At 2 the note below carries the arithmetic warning. */
const THRESHOLDS = [2, 3, 5, 8, 10] as const

/** Personvern card — HeiTuva.dc.html:1477-1502.
 *
 *  The design lists five toggles; the first, "Skjul resultater under 5 svar",
 *  is rendered here as locked-on. k=5 is enforced in the database and is not
 *  org-configurable (DECISIONS Q3) — a switch an administrator could flip would
 *  promise control that does not exist. */
export function PrivacyPanel({
  privacy,
  retention,
  defaultK,
  redaktorMayLower,
}: {
  privacy: Record<PrivacyKey, boolean>
  retention: number
  /** organizations.default_k_threshold — what a NEW person survey starts at (Q17). */
  defaultK: number
  /** organizations.privacy.redaktor_may_lower. Read only: v2 draws no switch
   *  for it, and Q57 keeps the column rather than deleting a working consumer
   *  to match a bundle that forgot it (Q29). The note below is PARAMETERISED on
   *  it instead of asserting it is always false. */
  redaktorMayLower: boolean
}) {
  const t = useTranslations('admin')
  const [saved, setSaved] = useState(privacy)
  const [optimistic, setOptimistic] = useOptimistic(saved)
  const [months, setMonths] = useState(retention)
  const [k, setK] = useState(defaultK)
  const [error, setError] = useState<AdminResult | null>(null)
  const [, startTransition] = useTransition()

  const toggle = (key: PrivacyKey) => {
    const next = !optimistic[key]
    startTransition(async () => {
      setOptimistic({ ...optimistic, [key]: next })
      const res = await setPrivacy(key, next)
      if (res.ok) {
        setSaved((s) => ({ ...s, [key]: next }))
        setError(null)
      } else {
        setError(res)
      }
    })
  }

  return (
    <section className="rounded-[18px] border border-line bg-sf p-6">
      <h2 className="font-display text-[22px] font-medium">{t('privacyHeading')}</h2>

      <div className="mt-4 flex flex-col gap-3.5">
        <div className="flex items-center gap-3.5">
          <span className="flex-1">
            <span className="block text-[14px] font-semibold">{t('pMinResponses')}</span>
            <span className="mt-0.5 block text-[13px] text-mut">
              {t('pMinResponsesDesc', { k: defaultK })} — {t('pMinResponsesLocked')}
            </span>
          </span>
          <span
            role="switch"
            aria-checked
            aria-disabled
            aria-label={t('pMinResponses')}
            className="flex h-[26px] w-[46px] flex-none justify-end rounded-full p-[3px]"
            style={{ background: 'var(--ac)' }}
          >
            <span className="block h-5 w-5 rounded-full bg-white" />
          </span>
        </div>

        {PRIVACY_KEYS.map((key) => {
          const on = optimistic[key]
          const [label, desc] = LABEL[key]
          return (
            <div key={key} className="flex items-center gap-3.5">
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">{t(label)}</span>
                <span className="mt-0.5 block text-[13px] text-mut">{t(desc)}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t(label)}
                onClick={() => toggle(key)}
                className="touch-44 flex h-[26px] w-[46px] flex-none cursor-pointer rounded-full border-none p-[3px]"
                style={{
                  background: on ? 'var(--ac)' : 'var(--sf2)',
                  justifyContent: on ? 'flex-end' : 'flex-start',
                }}
              >
                <span className="block h-5 w-5 rounded-full bg-white" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="my-[18px] h-px bg-line" />

      <div className="flex flex-wrap items-center gap-3.5">
        <span className="text-[14px] font-semibold">{t('retention')}</span>
        <select
          value={String(months)}
          aria-label={t('retention')}
          onChange={(e) => {
            const next = Number(e.target.value)
            const previous = months
            setMonths(next)
            startTransition(async () => {
              const res = await setRetention(next)
              if (res.ok) setError(null)
              else {
                setMonths(previous)
                setError(res)
              }
            })
          }}
          className="touch-44-field [--field-pad-y:10px] rounded-[10px] border border-line bg-bg px-[13px] py-2.5 text-[13.5px] text-ink outline-none"
        >
          {RETENTION_ORDER.map((m) => (
            <option key={m} value={m}>
              {t(`r${m}` as 'r6' | 'r12' | 'r24' | 'r0')}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-2.5 text-[13px] text-mut">
        {months === 0 ? t('retentionNoteNever') : t('retentionNoteMonths', { months })}
      </p>

      <div className="my-[18px] h-px bg-line" />

      {/* DECISIONS Q38 / Q57 — the organisation's default threshold. The column
          has been SHOWN on this tab since Phase 9 and had no writer; v2 draws
          the picker, so it has one now. Administrator only, in this component,
          in the action, and in `org_upd` (M:0008:8).

          THE NOTE SWUNG BACK TO THE BUNDLE, AND THE HISTORY IS THE POINT.
          V2:5591 says «Den som lager en undersøkelse kan heve terskelen, men
          ikke senke den under virksomhetens minimum». In V2-1 that was FALSE of
          this system — the default only SEEDED a new survey and constrained
          nothing afterwards (enumerated, not read for:
          `scripts/verify/threshold-readers.ts` returned zero bounding surfaces)
          — so the note was written to state what was true instead. **Q90 then
          made the bundle's sentence true**, on the evidence of
          `privacy.redaktor_may_lower`, which is meaningless without a floor to
          lower beneath. So the note states the floor again, and both branches
          interpolate {k} rather than asserting it, because the floor IS the
          picker's value. The flag's two effects are both said: who may change a
          survey's threshold, and whether anyone may go under this number.
          Logged in docs/DEVIATIONS.md (D107). */}
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="text-[14px] font-semibold">{t('orgThreshold')}</span>
        <div className="flex flex-wrap gap-2">
          {THRESHOLDS.map((value) => {
            const on = k === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const previous = k
                  setK(value)
                  startTransition(async () => {
                    const res = await setDefaultThreshold(value)
                    if (res.ok) setError(null)
                    else {
                      setK(previous)
                      setError(res)
                    }
                  })
                }}
                className="touch-44 cursor-pointer rounded-full px-[15px] py-[9px] text-[12.5px] font-semibold text-ink"
                style={{
                  background: on ? 'var(--ac)' : 'transparent',
                  border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
                }}
              >
                {t('orgThresholdChip', { k: value })}
              </button>
            )
          })}
        </div>
      </div>

      <p className="mt-2.5 text-[13px] leading-[1.6] text-mut">
        {t('orgThresholdNote', { k })}{' '}
        {redaktorMayLower
          ? t('orgThresholdRedaktorMayLower', { k })
          : t('orgThresholdAdminOnly', { k })}{' '}
        {t('orgThresholdOrgSurveys')}
      </p>

      {/* DECISIONS Q91 — TWO TIERS, because one warning cannot carry both cases.
          At 2 the property is not "weaker anonymity": a respondent knows their
          own answer, sees the aggregate, and SUBTRACTS. Disclosure by
          arithmetic. So the copy says that in those words, offers «Med navn» as
          the honest alternative in the same breath, and states the GDPR
          consequence at the point of choosing rather than in a policy document
          nobody opens. `--ac3` carries the weight; no red — the design brief
          forbids an error colour here, and this is a lawful choice with a
          consequence, not a mistake. */}
      {thresholdTier(k) === 'two' ? (
        <div className="mt-3 rounded-[11px] bg-ac3 px-[14px] py-[11px] text-[12.5px] leading-[1.55]">
          <p className="font-semibold">{t('thresholdTwoWarning')}</p>
          <p className="mt-1.5">{t('thresholdTwoAlternative')}</p>
          <p className="mt-1.5">{t('thresholdTwoGdpr')}</p>
        </div>
      ) : null}

      {error && !error.ok ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {t(ADMIN_ERROR_KEY[error.error])}
        </p>
      ) : null}
    </section>
  )
}
