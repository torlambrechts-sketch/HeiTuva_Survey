'use client'

import { useActionState } from 'react'
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

/** Firmaopplysninger card — HeiTuva.dc.html:1386-1397. Six fields in a 2-col
 *  grid, in the order the design's `companyFields` array defines them. */
export function CompanyForm({ company }: { company: Company }) {
  const t = useTranslations('admin')
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(saveCompany, null)

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

      <form action={action}>
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

        <button
          type="submit"
          disabled={pending}
          className="mt-4 cursor-pointer rounded-[10px] border-none bg-ac px-[22px] py-3 text-[13.5px] font-bold text-ink disabled:opacity-60"
        >
          {t('saveChanges')}
        </button>
      </form>
    </section>
  )
}
