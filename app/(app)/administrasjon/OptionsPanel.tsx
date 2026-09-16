'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setDefaultLang, setOption, setSsoExempt } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'
import { OPTION_KEYS, optionRow, type OptionKey } from '@/lib/org/options'

/** One active administrator, as the break-glass list draws them (D82). */
export type BreakGlassAdmin = { id: string; name: string; exempt: boolean }

/**
 * Row order: v6:8008's five first, in ITS order, then the four this product
 * shipped before v6 rewrote the panel.
 *
 * v2, v3, v4 and v5 all draw the SAME five rows; v6 replaces every one of them
 * and even reverses the tuple order. That is a whole-panel substitution rather
 * than an edit, so neither list is «the» list and both ship (D207). The SSO row
 * keeps its own treatment wherever it lands.
 */
const ROW_ORDER = OPTION_KEYS

const LABEL: Record<OptionKey, [string, string]> = {
  tuva: ['oTuva', 'oTuvaDesc'],
  quiz: ['oQuiz', 'oQuizDesc'],
  live: ['oLive', 'oLiveDesc'],
  klarsprak: ['oKlarsprak', 'oKlarsprakDesc'],
  reminders: ['oReminders', 'oRemindersDesc'],
  /* `weekly_digest` and `allow_self_serve` were here. Removed with their rows
     (G3, D211): both governed features that do not exist. The MESSAGES stay in
     `messages/*.json` deliberately — `verify:i18n` reads every message and a
     deleted key is one more thing to re-add if the decision reverses, while an
     unreferenced message costs nothing and is not user-visible. */
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
  persons,
  options,
  defaultLang,
  entra,
  admins,
}: {
  /* W3 · Q122 — the workspace's word for the person who answers. A plain
     string prop rather than a read here: this is a client component and the
     workspace resolves at SERVER render, because the choice is a cookie. One
     form, not the whole vocabulary, so the call site states which the screen
     needs rather than leaving a reader to guess. */
  persons: string
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
          /* G2 — A SWITCH NOTHING READS IS NOT A SETTING, AND IT SAYS SO.

             Measured 2026-09-16: `organizations.options` had five keys and
             exactly ONE reader. `reminders`, `weekly_digest`,
             `allow_self_serve` and `brand_mail` have been stored, audited and
             drawn as ON since `M:0002` while nothing — not a module, not a
             function in `app` or `public` — read them (D208).

             They are not deleted here: two of them govern features that do not
             exist at all, and removing a shipped control is a product decision
             rather than a fix. What they do instead is stop pretending. The
             reason comes from the registry, so a row cannot lose its notice by
             gaining a reader somewhere the registry does not name. */
          const row = optionRow(key)
          return (
            <div key={key} className="flex items-center gap-3.5">
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">{t(label)}</span>
                <span className="mt-0.5 block text-[13px] text-mut">{t(desc)}</span>
                {row.enforcedAt === null ? (
                  <span className="mt-1 block text-[12.5px] leading-[1.45] text-mut">
                    {t(`oUnread_${row.why}` as 'oUnread_digest-unbuilt')}
                  </span>
                ) : null}
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
        <span className="text-[14px] font-semibold">{t('defaultRespondentLang', { persons })}</span>
        <select
          value={lang}
          aria-label={t('defaultRespondentLang', { persons })}
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
