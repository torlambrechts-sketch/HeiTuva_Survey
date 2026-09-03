'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { createDsr, setDsrStatus } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'
import { DSR_TYPES, DSR_STATUSES, type DsrRequest, type DsrStatus, type DsrType } from './keys'

const ROW: Record<DsrType, { title: string; desc: string; cta: string }> = {
  innsyn: { title: 'dsrInnsyn', desc: 'dsrInnsynDesc', cta: 'dsrHandle' },
  retting: { title: 'dsrRetting', desc: 'dsrRettingDesc', cta: 'dsrHandle' },
  sletting: { title: 'dsrSletting', desc: 'dsrSlettingDesc', cta: 'dsrHandle' },
  portabilitet: { title: 'dsrPortabilitet', desc: 'dsrPortabilitetDesc', cta: 'dsrExport' },
}

const STATUS_KEY: Record<DsrStatus, string> = {
  mottatt: 'sMottatt',
  under_behandling: 'sUnderBehandling',
  fullfort: 'sFullfort',
  avvist: 'sAvvist',
}

/**
 * Forespørsler fra registrerte — HeiTuva.dc.html:1503-1517.
 *
 * The prototype's "Behandle" button only writes a label into local state; there
 * is no request to process. Here it opens the subject-email field the row needs
 * to create a real `dsr_requests` row, and the open requests it produces are
 * listed under the design's "Under behandling:" line with a status control, so
 * the 30-day deadline is actually trackable — docs/DEVIATIONS.md D18.
 */
export function DsrPanel({ requests }: { requests: DsrRequest[] }) {
  const t = useTranslations('admin')
  const [openForm, setOpenForm] = useState<DsrType | null>(null)
  const [error, setError] = useState<AdminResult | null>(null)
  const [, startTransition] = useTransition()

  const open = requests.filter((r) => r.status === 'mottatt' || r.status === 'under_behandling')

  return (
    <section className="rounded-[18px] border border-line bg-sf p-6">
      <h2 className="text-[16px] font-semibold">{t('dsrTitle')}</h2>
      <p className="mt-[3px] text-[13px] text-mut">{t('dsrDeadline')}</p>

      {DSR_TYPES.map((type) => {
        const row = ROW[type]
        return (
          <div key={type} className="border-b border-line py-[13px]">
            <div className="flex items-center gap-3.5">
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">{t(row.title)}</span>
                <span className="mt-0.5 block text-[13px] text-mut">{t(row.desc)}</span>
              </span>
              <button
                type="button"
                aria-expanded={openForm === type}
                onClick={() => setOpenForm(openForm === type ? null : type)}
                className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-4 py-[9px] text-[12.5px] font-semibold text-ink"
              >
                {openForm === type ? t('dsrCancel') : t(row.cta)}
              </button>
            </div>

            {openForm === type ? (
              <form
                className="mt-3 flex gap-[9px]"
                action={(formData) => {
                  startTransition(async () => {
                    const res = await createDsr(null, formData)
                    setError(res.ok ? null : res)
                    if (res.ok) setOpenForm(null)
                  })
                }}
              >
                <input type="hidden" name="type" value={type} />
                <input
                  name="subject_email"
                  type="email"
                  required
                  placeholder={t('dsrSubjectPlaceholder')}
                  aria-label={t(row.title)}
                  className="flex-1 rounded-[10px] border border-line bg-bg px-3.5 py-2.5 text-[13.5px] text-ink outline-none"
                />
                <button
                  type="submit"
                  className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-5 py-2.5 text-[13px] font-semibold text-ink"
                >
                  {t('dsrRegister')}
                </button>
              </form>
            ) : null}
          </div>
        )
      })}

      {error && !error.ok ? (
        <p role="alert" className="mt-3.5 text-[12.5px] font-semibold text-ink">
          {t(ADMIN_ERROR_KEY[error.error])}
        </p>
      ) : null}

      <p className="mt-3.5 text-[13px] text-mut">
        {open.length === 0
          ? t('dsrProcessing', { value: t('dsrNone') })
          : t('dsrProcessing', { value: open.map((r) => t(ROW[r.type].title)).join(', ') })}
      </p>

      {open.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {open.map((r) => (
            <div key={r.id} className="flex items-center gap-3.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">
                  {r.subject_email}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-mut">
                  {t(ROW[r.type].title)} · {t('dsrDue', { date: r.due_at })}
                </span>
              </span>
              <select
                defaultValue={r.status}
                aria-label={`${t('dsrOpenHeading')}: ${r.subject_email}`}
                onChange={(e) => {
                  const next = e.target.value
                  startTransition(async () => {
                    const res = await setDsrStatus(r.id, next)
                    setError(res.ok ? null : res)
                  })
                }}
                className="touch-44-field flex-none rounded-[10px] border border-line bg-bg px-[11px] py-[10px] text-[13px] text-ink outline-none"
              >
                {DSR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(STATUS_KEY[s])}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
