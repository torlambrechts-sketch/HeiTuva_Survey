'use client'

import { useActionState, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { createGroup, deleteGroup } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'

export type AdminGroup = { id: string; name: string; count: number; lead: string | null }

/** The design fills each group's bar as count/40. Nothing states 40 is a real
 *  ceiling, so the bar is relative to the largest group instead — a bar that
 *  silently caps at an invented number would misread at a glance. */
const TINTS = ['var(--ac)', 'var(--ac2)', 'var(--ac3)', 'var(--sbg)']

/** Grupper card — HeiTuva.dc.html:1441-1470. */
export function GroupsPanel({ groups }: { groups: AdminGroup[] }) {
  const t = useTranslations('admin')
  const [state, action, pending] = useActionState<AdminResult | null, FormData>(createGroup, null)
  const [rowError, setRowError] = useState<AdminResult | null>(null)
  const [, startTransition] = useTransition()

  const max = Math.max(1, ...groups.map((g) => g.count))

  return (
    <section className="mt-5 rounded-[18px] border border-line bg-sf p-6">
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div>
          <h2 className="font-display text-[22px] font-medium">{t('groupsHeading')}</h2>
          <p className="mt-0.5 text-[13px] text-mut">{t('groupThresholdNote')}</p>
        </div>
        <form action={action} className="flex gap-[9px]">
          <input
            name="name"
            required
            maxLength={120}
            placeholder={t('groupPlaceholder')}
            aria-label={t('groupPlaceholder')}
            className="w-[200px] rounded-[10px] border border-line bg-bg px-3.5 py-[11px] text-[13.5px] text-ink outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-5 py-[11px] text-[13px] font-semibold text-ink disabled:opacity-60"
          >
            {t('createGroup')}
          </button>
        </form>
      </div>

      {state && !state.ok ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {t(ADMIN_ERROR_KEY[state.error])}
        </p>
      ) : null}
      {rowError && !rowError.ok ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {t(ADMIN_ERROR_KEY[rowError.error])}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="mt-[18px] text-[13px] text-mut">{t('groupsEmpty')}</p>
      ) : (
        <div className="mt-[18px] grid grid-cols-2 gap-3.5">
          {groups.map((g, i) => (
            <div key={g.id} className="rounded-[14px] border border-line bg-bg p-[18px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-semibold">{g.name}</span>
                <button
                  type="button"
                  aria-label={`${t('deleteGroup')}: ${g.name}`}
                  onClick={() =>
                    startTransition(async () => setRowError(await deleteGroup(g.id)))
                  }
                  className="cursor-pointer border-none bg-transparent text-[16px] leading-none text-mut"
                >
                  ×
                </button>
              </div>
              <div className="mt-[3px] text-[13px] text-mut">
                {t('groupMembers', { count: g.count })} ·{' '}
                {g.lead ? `${t('groupLead')} ${g.lead}` : t('groupNoLead')}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-sf2">
                <div
                  className="h-full rounded-full"
                  style={{
                    background: TINTS[i % TINTS.length],
                    width: `${Math.round((g.count / max) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
