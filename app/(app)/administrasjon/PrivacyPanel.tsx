'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setPrivacy, setRetention } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'
import { PRIVACY_KEYS, type PrivacyKey } from './keys'

const LABEL: Record<PrivacyKey, [string, string]> = {
  ip_logging: ['pIpLogging', 'pIpLoggingDesc'],
  eu_only: ['pEuOnly', 'pEuOnlyDesc'],
  auto_delete: ['pAutoDelete', 'pAutoDeleteDesc'],
  consent: ['pConsent', 'pConsentDesc'],
}

const RETENTIONS = [6, 12, 24, 0] as const

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
}: {
  privacy: Record<PrivacyKey, boolean>
  retention: number
  /** organizations.default_k_threshold — what a NEW person survey starts at (Q17). */
  defaultK: number
}) {
  const t = useTranslations('admin')
  const [saved, setSaved] = useState(privacy)
  const [optimistic, setOptimistic] = useOptimistic(saved)
  const [months, setMonths] = useState(retention)
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

      {error && !error.ok ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {t(ADMIN_ERROR_KEY[error.error])}
        </p>
      ) : null}
    </section>
  )
}
