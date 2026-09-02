'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setProfileLocale } from './actions'
import type { Locale } from '@/lib/i18n/locales'

/** Språk card sits on --sbg per the design (HeiTuva.dc.html:1342).
 *  sv/da are rendered but disabled with a "kommer" badge: they are seeded in
 *  ui_messages yet nowhere near complete, so offering them would ship a
 *  half-translated UI. */
export function LanguageCard({
  heading,
  note,
  current,
  locales,
  comingLabel,
  failedLabel,
}: {
  heading: string
  note: string
  current: Locale
  locales: { value: Locale; active: boolean }[]
  comingLabel: string
  failedLabel: string
}) {
  const t = useTranslations('lang')
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  return (
    <section className="rounded-[18px] border border-line bg-sbg p-6">
      <h2 className="text-[16px] font-semibold">{heading}</h2>
      <p className="mt-1 text-[13px] leading-[1.55] text-mut">{note}</p>
      <div className="mt-3.5 flex flex-wrap gap-[7px]">
        {locales.map((l) => {
          const selected = l.value === current
          return (
            <button
              key={l.value}
              type="button"
              disabled={!l.active || pending}
              aria-pressed={selected}
              onClick={() =>
                startTransition(async () => {
                  const res = await setProfileLocale(l.value)
                  setFailed(!res.ok)
                })
              }
              title={l.active ? undefined : comingLabel}
              className="cursor-pointer rounded-full border border-line px-[15px] py-[9px] text-[12.5px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: selected ? 'var(--ac)' : 'transparent' }}
            >
              {t(l.value)}
              {!l.active ? (
                <span className="ml-1.5 text-[10.5px] font-normal text-mut">{comingLabel}</span>
              ) : null}
            </button>
          )
        })}
      </div>
      {failed ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {failedLabel}
        </p>
      ) : null}
    </section>
  )
}
