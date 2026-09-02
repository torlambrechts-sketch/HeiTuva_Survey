'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { saveCompany } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'

export type Company = {
  name: string
  orgnr: string
  address: string
  contact_name: string
  contact_email: string
  dpo: string
}

const label = 'block text-[11px] uppercase tracking-[.09em] text-mut'
const field =
  'mt-1.5 box-border w-full rounded-[10px] border border-line bg-bg px-[13px] py-[11px] text-[14px] text-ink outline-none'

/**
 * Firmaopplysninger card — HeiTuva.dc.html:1386-1397. Six fields in a 2-col
 * grid, in the order the design's `companyFields` array defines them.
 *
 * The design has no save button on this card, so there is none here: it saves
 * when a changed field loses focus. The only addition is the "Lagret ✓" chip in
 * the header, which is the same treatment Profil's Om meg card uses — see
 * docs/DEVIATIONS.md D23.
 */
export function CompanyForm({ company }: { company: Company }) {
  const t = useTranslations('admin')
  const form = useRef<HTMLFormElement>(null)
  const dirty = useRef(false)
  const [state, setState] = useState<AdminResult | null>(null)
  const [pending, startTransition] = useTransition()

  // The action is called directly rather than through a form submission.
  // requestSubmit() from inside a focusout handler did not reach the action —
  // the capture harness caught it: the field saved nothing and no chip
  // appeared. Calling it with the form's own FormData has no such dependency.
  const save = () => {
    if (!form.current) return
    const data = new FormData(form.current)
    startTransition(async () => setState(await saveCompany(null, data)))
  }

  const fields: { name: keyof Company; label: string; type?: string }[] = [
    { name: 'name', label: t('fName') },
    { name: 'orgnr', label: t('fOrgnr') },
    { name: 'address', label: t('fAddress') },
    { name: 'contact_name', label: t('fContact') },
    { name: 'contact_email', label: t('fEmail'), type: 'email' },
    { name: 'dpo', label: t('fDpo') },
  ]

  return (
    <section className="rounded-[18px] border border-line bg-sf p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[22px] font-medium">{t('companyHeading')}</h2>
        {state?.ok ? (
          <span
            role="status"
            className="rounded-full bg-ac2 px-[15px] py-[9px] text-[12.5px] font-semibold"
          >
            {t('saved')}
          </span>
        ) : null}
      </div>

      <form
        ref={form}
        onSubmit={(e) => {
          // Enter in a field, and the visually hidden submit below.
          e.preventDefault()
          dirty.current = false
          save()
        }}
        onChange={() => {
          dirty.current = true
        }}
        onBlur={(e) => {
          // Only when focus actually leaves the card — moving between two of
          // its own fields is not a moment to save.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          if (!dirty.current) return
          dirty.current = false
          save()
        }}
      >
        <div className="mt-[18px] grid grid-cols-2 gap-3.5">
          {fields.map((f) => (
            <label key={f.name} className="block">
              <span className={label}>{f.label}</span>
              <input
                name={f.name}
                type={f.type ?? 'text'}
                defaultValue={company[f.name]}
                required={f.name === 'name'}
                className={field}
              />
            </label>
          ))}
        </div>

        <p className="mt-4 text-[13px] leading-[1.6] text-mut">{t('companyNote')}</p>

        {state && !state.ok ? (
          <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
            {t(ADMIN_ERROR_KEY[state.error])}
          </p>
        ) : null}

        {/* Submit exists for keyboard users who press Enter in a field, and as
            the non-JS fallback; it is not part of the design's layout. */}
        <button type="submit" disabled={pending} className="sr-only">
          {t('saveChanges')}
        </button>
      </form>
    </section>
  )
}
