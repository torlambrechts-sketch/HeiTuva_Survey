'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { LOCALES, type Locale } from '@/lib/i18n/locales'
import { setLocale } from '@/app/(app)/actions'

/** The globe with a language-code badge, per the design header. The native
 *  select is laid over the whole control at opacity 0 so the control stays
 *  keyboard-operable and screen-reader labelled while looking custom. */
export function LangPicker({ current }: { current: Locale }) {
  const t = useTranslations('lang')
  const tc = useTranslations('common')
  const [pending, startTransition] = useTransition()

  return (
    <span
      className="relative inline-flex h-[38px] w-[38px] items-center justify-center rounded-full border border-line"
      title={tc('language')}
      style={{ opacity: pending ? 0.6 : 1 }}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden="true"
        className="pointer-events-none text-mut"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
      </svg>
      <span className="pointer-events-none absolute -bottom-px -right-0.5 rounded-full bg-ac px-1 py-px text-[8.5px] font-bold tracking-[.02em]">
        {current.toUpperCase()}
      </span>
      <select
        defaultValue={current}
        onChange={(e) => {
          const next = e.target.value as Locale
          startTransition(() => void setLocale(next))
        }}
        aria-label={tc('language')}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none border-none bg-transparent font-[inherit] opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(`${l}Full`)}
          </option>
        ))}
      </select>
    </span>
  )
}
