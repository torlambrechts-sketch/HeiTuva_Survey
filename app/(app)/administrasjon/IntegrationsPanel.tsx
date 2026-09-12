'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { mintScimToken, revokeScimToken } from './actions'
import { activeCount, type ConnectorGroup, type ConnectorRow, type EntraState } from '@/lib/scim/catalogue'

/**
 * Integrasjoner — HeiTuva.dc.html:2869-2926.
 *
 * The bundle's layout exactly: a --sbg header card with the count chip, then one
 * --sf card per group with rows carrying name, level chip, description, «Henter»
 * line, status chip and a CTA button.
 *
 * What differs and why is in `lib/scim/catalogue.ts` and D163. In one line: the
 * count and the Entra row are READ FROM THE CONNECTION, the other thirteen rows
 * say «Ikke tilgjengelig» with the control disabled rather than «Ikke tilkoblet»
 * with a button that would do nothing, and the API-nøkkel and Webhooks cards are
 * not built because Q89 decided those are not built.
 */
const LEVEL_BG: Record<ConnectorRow['level'], string> = {
  lovpalagt: 'var(--ac3)',
  niva1: 'var(--ac)',
  niva2: 'var(--sf2)',
  niva3: 'var(--sf2)',
}

/** `integrations.entraName` from `entra` + `Name`. Keys are built from the
 *  registry key so a fifteenth connector needs no edit here — but they are
 *  spelled out in `tests/unit/integrations.test.ts`, which asserts every one
 *  resolves in BOTH languages rather than trusting the concatenation. */
const cap = (k: string) => k.charAt(0).toUpperCase() + k.slice(1)

export function IntegrationsPanel({
  groups,
  entra,
  members,
}: {
  groups: ConnectorGroup[]
  entra: EntraState
  members: number
}) {
  const t = useTranslations('integrations')
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const active = activeCount(entra)
  const statusChip: Record<EntraState['status'], { label: string; bg: string; fg: string }> = {
    connected: { label: t('statusConnected'), bg: '#E4F2E0', fg: '#2F5D2A' },
    needs_setup: { label: t('statusNeedsSetup'), bg: 'var(--ac3)', fg: '#8A4B22' },
    failing: { label: t('statusFailing'), bg: 'var(--ac3)', fg: '#8A4B22' },
    absent: { label: t('statusAbsent'), bg: 'var(--sf2)', fg: 'var(--mut)' },
  }

  function mint() {
    setError(null)
    start(async () => {
      const res = await mintScimToken()
      if (res.ok && res.token) setToken(res.token)
      else setError(t('mintFailed'))
    })
  }

  function revoke() {
    setError(null)
    setToken(null)
    start(async () => {
      const res = await revokeScimToken()
      if (!res.ok) setError(t('revokeFailed'))
    })
  }

  return (
    <div className="mt-5 flex flex-col gap-[18px]">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-[18px] border border-line bg-sbg px-6 py-[22px]">
        <div className="min-w-0">
          <h2 className="font-display text-[22px] font-medium">{t('title')}</h2>
          <p className="mt-1 max-w-[620px] text-[13px] leading-[1.6] text-mut">{t('dataFlowNote')}</p>
        </div>
        <span className="flex-none whitespace-nowrap rounded-full bg-sf px-4 py-[9px] text-[12.5px] font-bold">
          {active === 0 ? t('noneActive') : t('activeCount', { count: active })}
        </span>
      </section>

      {groups.map((group) => (
        <section key={group.key} className="rounded-[18px] border border-line bg-sf px-6 py-[22px]">
          <h3 className="text-[11px] uppercase tracking-[.1em] text-mut">
            {t(`group${cap(group.key)}`)}
          </h3>
          {group.rows.map((row) => {
            const live = row.built
            const chip = live
              ? statusChip[entra.status]
              : { label: t('statusUnavailable'), bg: 'var(--sf2)', fg: 'var(--mut)' }
            return (
              <div
                key={row.key}
                className="flex flex-wrap items-center gap-[14px] border-b border-line py-[14px]"
              >
                <span className="min-w-[220px] flex-1">
                  <span className="flex flex-wrap items-center gap-[9px]">
                    <span className="text-[14.5px] font-semibold">{t(`${row.key}Name`)}</span>
                    <span
                      className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold"
                      style={{ background: LEVEL_BG[row.level] }}
                    >
                      {t(`level${cap(row.level)}`)}
                    </span>
                  </span>
                  <span className="mt-[3px] block text-[12.5px] leading-[1.5] text-mut">
                    {t(`${row.key}Desc`)}
                  </span>
                  <span className="mt-1 block text-[11.5px] text-mut">
                    {t('fetches', { fields: t(`${row.key}Fields`) })}
                  </span>
                  {live && entra.status === 'failing' && (
                    <span className="mt-1 block text-[11.5px] font-semibold text-mut">
                      {t('failingDetail', { count: entra.errors })}
                    </span>
                  )}
                  {live && entra.status === 'connected' && (
                    <span className="mt-1 block text-[11.5px] text-mut">
                      {t('membersFromDirectory', { count: members })}
                    </span>
                  )}
                </span>
                <span
                  className="flex-none whitespace-nowrap rounded-full px-3 py-[5px] text-[11.5px] font-bold"
                  style={{ background: chip.bg, color: chip.fg }}
                >
                  {chip.label}
                </span>
                {/* V5-3 — the way into the detail page (v5:3819). Only the
                    built row has one: a link from a row whose status is «Ikke
                    tilgjengelig» would open a page describing a connection that
                    cannot exist. */}
                {live ? (
                  <Link
                    href="/administrasjon/integrasjoner/entra"
                    className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-4 py-[10px] text-[12.5px] font-semibold text-ink no-underline"
                  >
                    {t('detailLink')}
                  </Link>
                ) : null}
                {live ? (
                  <button
                    type="button"
                    onClick={entra.status === 'absent' ? mint : revoke}
                    disabled={pending}
                    className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-4 py-[10px] text-[12.5px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {entra.status === 'absent' ? t('ctaConnect') : t('ctaRevoke')}
                  </button>
                ) : (
                  /* Disabled rather than absent. The row is what the screen is
                     FOR — «what can this talk to» — and the honest answer
                     includes «not yet». A live «Koble til» would be the promise
                     (D163). */
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    title={t('unavailableHint')}
                    className="touch-44 flex-none cursor-not-allowed whitespace-nowrap rounded-[10px] border border-line bg-transparent px-4 py-[10px] text-[12.5px] font-semibold text-mut opacity-60"
                  >
                    {t('ctaConnect')}
                  </button>
                )}
              </div>
            )
          })}
        </section>
      ))}

      {(token || error || entra.status !== 'absent') && (
        <section className="rounded-[18px] border border-line bg-sf px-6 py-[22px]">
          <h3 className="text-[16px] font-semibold">{t('tokenTitle')}</h3>
          {token ? (
            <>
              <p className="mt-1 text-[12.5px] leading-[1.55] text-mut">{t('tokenOnce')}</p>
              <code className="mt-[14px] block overflow-x-auto rounded-[10px] border border-dashed border-line bg-bg px-[14px] py-3 font-mono text-[12.5px]">
                {token}
              </code>
            </>
          ) : (
            <p className="mt-1 text-[12.5px] leading-[1.55] text-mut">
              {entra.prefix ? t('tokenExisting', { prefix: entra.prefix }) : t('tokenNone')}
            </p>
          )}
          {entra.status === 'failing' && entra.lastError && (
            <p className="mt-[11px] text-[11.5px] text-mut">
              {t('lastError', { detail: entra.lastError })}
            </p>
          )}
          {error && <p className="mt-[11px] text-[11.5px] font-semibold text-mut">{error}</p>}
          <p className="mt-[11px] text-[11.5px] text-mut">{t('endpointHint')}</p>
        </section>
      )}
    </div>
  )
}
