'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setDefaultLang, setOption, setSsoExempt } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'
import { type OptionKey } from './keys'

/** One active administrator, as the break-glass list draws them (D82). */
export type BreakGlassAdmin = { id: string; name: string; exempt: boolean }

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
  sso: ['oSso', 'oSsoDesc'],
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
  entra,
  admins,
}: {
  options: Record<OptionKey, boolean>
  defaultLang: 'no' | 'en'
  /** Whether Auth reports Entra ID as configured (lib/auth/entra.ts). */
  entra: boolean
  /** The org's active administrators and their break-glass mark (D82). */
  admins: BreakGlassAdmin[]
}) {
  const t = useTranslations('admin')
  const [saved, setSaved] = useState(options)
  const [optimistic, setOptimistic] = useOptimistic(saved)
  const [exempt, setExempt] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(admins.map((a) => [a.id, a.exempt])),
  )
  const [optimisticExempt, setOptimisticExempt] = useOptimistic(exempt)
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

  const toggleExempt = (id: string) => {
    const next = !optimisticExempt[id]
    startTransition(async () => {
      setOptimisticExempt({ ...optimisticExempt, [id]: next })
      const res = await setSsoExempt(id, next)
      if (res.ok) {
        setExempt((s) => ({ ...s, [id]: next }))
        setError(null)
      } else {
        setError(res)
      }
    })
  }

  /** The one switch the design draws, in its three states: disabled while the
   *  provider is missing, off, on. Markup identical across the three so the
   *  row never shifts. */
  const ssoSwitch = (on: boolean, disabled: boolean, label: string, onClick?: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={
        disabled
          ? 'flex h-[26px] w-[46px] flex-none cursor-not-allowed justify-start rounded-full border-none p-[3px] opacity-50'
          : 'touch-44 flex h-[26px] w-[46px] flex-none cursor-pointer rounded-full border-none p-[3px]'
      }
      style={{
        background: on ? 'var(--ac)' : 'var(--sf2)',
        justifyContent: on ? 'flex-end' : 'flex-start',
      }}
    >
      <span className="block h-5 w-5 rounded-full bg-white" />
    </button>
  )

  return (
    <section className="mt-5 max-w-[720px] rounded-[18px] border border-line bg-sf p-6">
      <h2 className="font-display text-[22px] font-medium">{t('optionsHeading')}</h2>

      <div className="mt-4 flex flex-col gap-3.5">
        {ROW_ORDER.map((key) => {
          // SSO keeps the design's fourth position. Until Auth has an Entra
          // provider configured the switch is drawn disabled and says so — a
          // switch that could be turned on would lock everybody out, which
          // is also why the action refuses it (docs/DEVIATIONS.md D82).
          //
          // Beneath it, the break-glass list (decision 2 of the Phase 6
          // acceptance): one switch per active administrator, "Kan logge inn
          // uten Entra ID". At least one must be on before enforcement can be
          // turned on, and the last one cannot be turned off while it is —
          // both refusals come from the database and are shown here as the
          // reason. Drawn as rows under the option rather than a card in a
          // card (RESPONSIVE.md forbids the latter); no such control exists
          // in the bundle, so this is the minimal one.
          if (key === 'sso') {
            return (
              <div key="sso" className="flex flex-col gap-3">
                <div className="flex items-center gap-3.5">
                  <span className="flex-1">
                    <span className="block text-[14px] font-semibold">{t('oSso')}</span>
                    <span className="mt-0.5 block text-[13px] text-mut">
                      {t('oSsoDesc')}
                      {entra ? null : <> — {t('oSsoNotConfigured')}</>}
                    </span>
                  </span>
                  {entra
                    ? ssoSwitch(optimistic.sso, false, t('oSso'), () => toggle('sso'))
                    : ssoSwitch(false, true, t('oSso'))}
                </div>
                <div className="ml-0 flex flex-col gap-2.5 border-l-2 border-line pl-3.5">
                  <span>
                    <span className="block text-[13px] font-semibold">{t('oSsoBreakGlass')}</span>
                    <span className="mt-0.5 block text-[12.5px] text-mut">{t('oSsoBreakGlassDesc')}</span>
                  </span>
                  {admins.map((a) => (
                    <div key={a.id} className="flex items-center gap-3.5">
                      <span className="min-w-0 flex-1 break-words text-[13px]">{a.name}</span>
                      {ssoSwitch(
                        optimisticExempt[a.id] === true,
                        false,
                        `${t('oSsoBreakGlass')}: ${a.name}`,
                        () => toggleExempt(a.id),
                      )}
                    </div>
                  ))}
                </div>
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
          className="touch-44-field [--field-pad-y:10px] rounded-[10px] border border-line bg-bg px-[13px] py-2.5 text-[13.5px] text-ink outline-none"
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
