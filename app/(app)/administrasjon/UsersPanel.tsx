'use client'

import { useActionState, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { inviteMember, setMemberRole, setMemberStatus } from './actions'
import { ADMIN_ERROR_KEY, type AdminResult } from './types'
import type { MemberRole } from '@/lib/auth/session'

export type AdminUser = {
  id: string
  name: string
  email: string
  group: string | null
  role: MemberRole
  status: 'invited' | 'active' | 'inactive'
  initials: string
}

/** Brukere card — HeiTuva.dc.html:1409-1436. Avatar tint by role
 *  (--ac administrator, --ac2 redaktør, --sf2 leser), status column 74px. */
export function UsersPanel({ users, count }: { users: AdminUser[]; count: { active: number; total: number } }) {
  const t = useTranslations('admin')
  const tRole = useTranslations('role')
  const [invite, inviteAction, inviting] = useActionState<AdminResult | null, FormData>(
    inviteMember,
    null,
  )
  const [rowError, setRowError] = useState<AdminResult | null>(null)
  const [, startTransition] = useTransition()

  const roleBg = (role: MemberRole) =>
    role === 'administrator' ? 'var(--ac)' : role === 'redaktor' ? 'var(--ac2)' : 'var(--sf2)'

  const statusLabel = (s: AdminUser['status']) =>
    s === 'active' ? t('statusActive') : s === 'invited' ? t('statusInvited') : t('statusInactive')

  return (
    <section className="mt-5 rounded-[18px] border border-line bg-sf p-6">
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div>
          <h2 className="font-display text-[22px] font-medium">{t('usersHeading')}</h2>
          <p className="mt-0.5 text-[13px] text-mut">
            {t('userCount', { active: count.active, total: count.total })}
          </p>
        </div>
        <form action={inviteAction} className="flex w-full gap-[9px] md:w-auto">
          <input
            name="email"
            type="email"
            required
            placeholder={t('invitePlaceholder')}
            aria-label={t('invite')}
            className="w-full rounded-[10px] border border-line bg-bg px-3.5 py-[11px] text-[13.5px] text-ink outline-none md:w-[230px]"
          />
          <button
            type="submit"
            disabled={inviting}
            className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-5 py-[11px] text-[13px] font-semibold text-ink disabled:opacity-60"
          >
            {t('invite')}
          </button>
        </form>
      </div>

      {invite?.ok ? (
        <p role="status" className="mt-3 text-[12.5px] font-semibold text-ink">
          {t('inviteSent')}
        </p>
      ) : null}
      {invite && !invite.ok ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {t(ADMIN_ERROR_KEY[invite.error])}
        </p>
      ) : null}
      {rowError && !rowError.ok ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {t(ADMIN_ERROR_KEY[rowError.error])}
        </p>
      ) : null}

      {users.length === 0 ? (
        <p className="mt-4 text-[13px] text-mut">{t('usersEmpty')}</p>
      ) : null}

      {users.map((u) => (
        // RESPONSIVE.md § Data tables: below md the row becomes a card — the
        // name is the title, the rest are label/value pairs, controls beneath.
        // No horizontal scrolling table.
        <div
          key={u.id}
          className="flex flex-col gap-3 border-b border-line py-3.5 md:flex-row md:items-center md:gap-3.5"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <span
              className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full text-[13px] font-semibold"
              style={{ background: roleBg(u.role) }}
            >
              {u.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold">{u.name}</span>
              <span className="mt-0.5 block break-words text-[13px] text-mut">
                {[u.email, u.group].filter(Boolean).join(' · ')}
              </span>
            </span>
          </div>
          <span
            className="flex-none text-[12.5px] md:w-[74px]"
            style={{ color: u.status === 'inactive' ? 'var(--ac3)' : 'var(--mut)' }}
          >
            {statusLabel(u.status)}
          </span>
          <div className="flex items-center gap-3.5 md:contents">
          <select
            defaultValue={u.role}
            aria-label={`${t('tabBrukere')}: ${u.name}`}
            onChange={(e) => {
              const next = e.target.value
              startTransition(async () => setRowError(await setMemberRole(u.id, next)))
            }}
            className="touch-44-field flex-none rounded-[10px] border border-line bg-bg px-[11px] py-[9px] text-[13px] text-ink outline-none"
          >
            <option value="administrator">{tRole('administrator')}</option>
            <option value="redaktor">{tRole('redaktor')}</option>
            <option value="leser">{tRole('leser')}</option>
          </select>
          <button
            type="button"
            onClick={() =>
              startTransition(async () =>
                setRowError(await setMemberStatus(u.id, u.status === 'inactive')),
              )
            }
            className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-[15px] py-[9px] text-[12.5px] font-semibold text-ink"
          >
            {u.status === 'inactive' ? t('activate') : t('deactivate')}
          </button>
          </div>
        </div>
      ))}

      <p className="mt-4 text-[13px] leading-[1.6] text-mut">{t('usersRoleNote')}</p>
    </section>
  )
}
