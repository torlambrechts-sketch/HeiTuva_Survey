'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { disconnectEntra } from './actions'
import { activeCount, type ConnectorGroup, type ConnectorRow, type EntraState } from '@/lib/directory/catalogue'

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
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const active = activeCount(entra)
  const statusChip: Record<EntraState['status'], { label: string; bg: string; fg: string }> = {
    connected: { label: t('statusConnected'), bg: '#E4F2E0', fg: '#2F5D2A' },
    needs_setup: { label: t('statusNeedsSetup'), bg: 'var(--ac3)', fg: '#8A4B22' },
    failing: { label: t('statusFailing'), bg: 'var(--ac3)', fg: '#8A4B22' },
    absent: { label: t('statusAbsent'), bg: 'var(--sf2)', fg: 'var(--mut)' },
  }

  /* I2: one action, and it is the destructive one. Under push the customer held
     a bearer token we minted; under pull their administrator consents in Entra
     and holds nothing. Connecting therefore leaves this screen — it is a
     redirect to Microsoft — and only disconnecting happens here. */
  function disconnect() {
    setError(null)
    start(async () => {
      const res = await disconnectEntra()
      if (!res.ok) setError(t('disconnectFailed'))
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
                    onClick={entra.status === 'absent' ? undefined : disconnect}
                    disabled={pending || entra.status === 'absent'}
                    /* «Koble til» is NOT a button here: consent is a redirect to
                       Microsoft, and the consent route is I2's remaining half —
                       it needs AZURE_CLIENT_ID, which this deployment does not
                       have yet. A live button that cannot complete is the
                       promise D163 refuses, so the control is disabled with the
                       reason beside it rather than wired to nothing. */
                    title={entra.status === 'absent' ? t('connectPending') : undefined}
                    className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-4 py-[10px] text-[12.5px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {entra.status === 'absent' ? t('ctaConnect') : t('ctaDisconnect')}
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

      {(error || entra.status !== 'absent') && (
        <section className="rounded-[18px] border border-line bg-sf px-6 py-[22px]">
          <h3 className="text-[16px] font-semibold">{t('connectionTitle')}</h3>
          {/* NO TOKEN IS SHOWN, because under pull the customer holds none. What
              they hold is a consent in their own tenant; what we hold is a
              refresh token in the vault that no screen can reach (M:0115). */}
          <p className="mt-1 text-[12.5px] leading-[1.55] text-mut">
            {entra.status === 'absent'
              ? t('connectionNone')
              : t('connectionHeld', { tenant: entra.tenantId ?? '—' })}
          </p>
          {entra.status === 'failing' && entra.lastError && (
            <p className="mt-[11px] text-[11.5px] text-mut">
              {t('lastError', { detail: entra.lastError })}
            </p>
          )}
          {error && <p className="mt-[11px] text-[11.5px] font-semibold text-mut">{error}</p>}
        </section>
      )}

      {/* ── API-nøkkel and Webhooks (v5:3520-3560) — REFUSED ON THE SCREEN ──
          Q89 answered the public API and the webhooks: NO, DO NOT BUILD IT,
          and expressly «not deferred for capacity and must not be read as
          scheduling». Re-read 2026-09-16; it stands.

          Q151 then decided these two cards were «not built, at all — not even
          disabled», because the bundle draws a FABRICATED key
          (`ht_live_9f2c··············a41`) and a FABRICATED rotation date, and
          a disabled control still advertises the capability.

          BOTH STILL HOLD, AND THIS IS NOT A REVERSAL OF EITHER. What changes is
          the treatment of the gap: absent with no notice is the one outcome
          that is not acceptable, so the screen says the thing rather than
          leaving a reader to wonder whether they have missed a tab. A SENTENCE
          is not a control — it advertises nothing, it closes a question, and it
          is the same form `mgPopulationsUnavailable` has carried since V2-3a.

          Deliberately one card for both: they are one decision. */}
      <section className="rounded-[18px] border border-line bg-sbg px-6 py-[22px]">
        <h2 className="text-[16px] font-bold">{t('apiTitle')}</h2>
        <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.55] text-mut">
          {t('apiUnavailable')}
        </p>
      </section>
    </div>
  )
}
