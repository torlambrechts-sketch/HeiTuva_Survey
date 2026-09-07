'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setDefaultThreshold, setPrivacy, setRetention } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'
import { PRIVACY_KEYS, type PrivacyKey } from './keys'

const LABEL: Record<PrivacyKey, [string, string]> = {
  ip_logging: ['pIpLogging', 'pIpLoggingDesc'],
  eu_only: ['pEuOnly', 'pEuOnlyDesc'],
  auto_delete: ['pAutoDelete', 'pAutoDeleteDesc'],
  consent: ['pConsent', 'pConsentDesc'],
}

const RETENTIONS = [6, 12, 24, 0] as const

/** DECISIONS Q57 / Q38 — the picker v2 draws (HeiTuva.dc.html:2737-2747). The
 *  values are the bundle's and they agree with the schema: 3 is Q17's floor for
 *  natural persons, 10 is Q36's ceiling, both CHECKed on the column. */
const THRESHOLDS = [3, 5, 8, 10] as const

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
          {RETENTIONS.map((m) => (
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

          THE NOTE IS NOT THE BUNDLE'S. V2:5591 says «Den som lager en
          undersøkelse kan heve terskelen, men ikke senke den under
          virksomhetens minimum», and THREE parts of that are not what this
          system does: nothing ties a survey's threshold to the organisation's
          default (the default SEEDS a new survey in `app.apply_pack_policy`
          and constrains nothing afterwards); by default only an administrator
          may change a survey's threshold at all; and whether a redaktør may is
          `privacy.redaktor_may_lower`, which the bundle draws no switch for.
          So the note states what is true and is parameterised on the flag.
          Logged in docs/DEVIATIONS.md. */}
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
        {redaktorMayLower ? t('orgThresholdRedaktorMayLower') : t('orgThresholdAdminOnly')}{' '}
        {t('orgThresholdOrgSurveys')}
      </p>

      {error && !error.ok ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {t(ADMIN_ERROR_KEY[error.error])}
        </p>
      ) : null}
    </section>
  )
}
