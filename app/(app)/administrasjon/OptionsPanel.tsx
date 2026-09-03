'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setDefaultLang, setOption } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'
import { type OptionKey } from './keys'

/** Row order exactly as the design lists it (HeiTuva.dc.html:3288-3294), with
 *  the disabled SSO row in its fourth position. */
const ROW_ORDER = [
  'reminders',
  'weekly_digest',
  'allow_self_serve',
  'sso',
  'brand_mail',
] as const

const LABEL: Record<OptionKey, [string, string]> = {
  reminders: ['oReminders', 'oRemindersDesc'],
  weekly_digest: ['oWeeklyDigest', 'oWeeklyDigestDesc'],
  allow_self_serve: ['oAllowSelfServe', 'oAllowSelfServeDesc'],
  brand_mail: ['oBrandMail', 'oBrandMailDesc'],
}

/**
 * Alternativer card — HeiTuva.dc.html:1544-1556.
 *
 * The design's fifth row, "Pålogging med Entra ID (SSO)", renders disabled with
 * a "kommer" badge: SSO ships in Phase 6 (DECISIONS Q5) and the action refuses
 * the key, so an enabled switch would persist a setting nothing honours.
 */
export function OptionsPanel({
  options,
  defaultLang,
}: {
  options: Record<OptionKey, boolean>
  defaultLang: 'no' | 'en'
}) {
  const t = useTranslations('admin')
  const [saved, setSaved] = useState(options)
  const [optimistic, setOptimistic] = useOptimistic(saved)
  const [lang, setLang] = useState(defaultLang)
  const [error, setError] = useState<AdminResult | null>(null)
  const [, startTransition] = useTransition()

  const toggle = (key: OptionKey) => {
    const next = !optimistic[key]
    startTransition(async () => {
      setOptimistic({ ...optimistic, [key]: next })
      const res = await setOption(key, next)
      if (res.ok) {
        setSaved((s) => ({ ...s, [key]: next }))
        setError(null)
      } else {
        setError(res)
      }
    })
  }

  return (
    <section className="mt-5 max-w-[720px] rounded-[18px] border border-line bg-sf p-6">
      <h2 className="font-display text-[22px] font-medium">{t('optionsHeading')}</h2>

      <div className="mt-4 flex flex-col gap-3.5">
        {ROW_ORDER.map((key) => {
          // SSO keeps the design's fourth position rather than being pushed to
          // the end because it is disabled — the order is part of the layout.
          if (key === 'sso') {
            return (
              <div key="sso" className="flex items-center gap-3.5">
                <span className="flex-1">
                  <span className="block text-[14px] font-semibold">{t('oSso')}</span>
                  <span className="mt-0.5 block text-[13px] text-mut">
                    {t('oSsoDesc')} — {t('comingSoon')}
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={false}
                  aria-label={t('oSso')}
                  disabled
                  className="flex h-[26px] w-[46px] flex-none cursor-not-allowed justify-start rounded-full border-none p-[3px] opacity-50"
                  style={{ background: 'var(--sf2)' }}
                >
                  <span className="block h-5 w-5 rounded-full bg-white" />
                </button>
              </div>
            )
          }

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
        <span className="text-[14px] font-semibold">{t('defaultRespondentLang')}</span>
        <select
          value={lang}
          aria-label={t('defaultRespondentLang')}
          onChange={(e) => {
            const next = e.target.value as 'no' | 'en'
            const previous = lang
            setLang(next)
            startTransition(async () => {
              const res = await setDefaultLang(next)
              if (res.ok) setError(null)
              else {
                setLang(previous)
                setError(res)
              }
            })
          }}
          className="touch-44-field rounded-[10px] border border-line bg-bg px-[13px] py-2.5 text-[13.5px] text-ink outline-none"
        >
          <option value="no">{t('langLabelNo')}</option>
          <option value="en">{t('langLabelEn')}</option>
        </select>
      </div>

      {error && !error.ok ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {t(ADMIN_ERROR_KEY[error.error])}
        </p>
      ) : null}
    </section>
  )
}
