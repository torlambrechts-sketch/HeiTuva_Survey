'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { STATUS_BG, STATUS_KEY, type MemberStatus } from '@/lib/audiences/member-status'
import { addSuppression, liftSuppression } from './actions'

/**
 * Medlemmer (V2:2570–2593) and Reservasjonsliste (V2:2595–2608) — V2-3b.
 *
 * ── WHAT DIVERGES FROM THE BUNDLE, AND WHY, ALL OF IT ONE RULE ──────────────
 *
 * **The sync line and «Synkroniser nå» are not drawn.** The bundle's subtitle is
 * `memberSync` = «Sist synkronisert i dag 07:10 fra Entra ID» (V2:5011), and the
 * button calls `onSyncNow` (V2:5012). No directory sync exists — `entra_sync`,
 * `google_sync` and `hr_sync` are seeded false and Q62(c) made that gate real —
 * so a sync time is a number this product does not hold and a «synchronise now»
 * button is an action it cannot perform. CLAUDE.md: render the real state. The
 * card says once, in words, that no sync is connected.
 *
 * **«Fjern» per row is not drawn.** (V2:2589). The bundle's `onRemove` hides the
 * row locally; the real action it maps to is deactivating a member, which
 * Brukere already performs with a confirmation and an audit trail. A second,
 * differently-labelled path to the same destructive action is worse than one —
 * so the card says where removal lives instead. **D112.**
 *
 * **The Reservasjonsliste GAINS an add row and a lift**, which the bundle does
 * not draw at all: objections arrive there through an unsubscribe link that is
 * not built. A list nobody can write to is a promise the product cannot keep,
 * and D110's instance 2 in a UI. The controls are styled exactly as «Ny
 * målgruppe» two cards above. **D112.**
 */
export type MemberRow = {
  id: string
  name: string
  email: string
  status: MemberStatus
  /** Already resolved to a sentence server-side — it depends on which status. */
  meta: string
}

export type SuppressionRow = { id: string; email: string; reason: string | null }

const CARD = 'rounded-[18px] border border-line bg-sf px-6 py-[22px]'
const FIELD =
  'box-border min-w-0 rounded-[10px] border border-line bg-sf px-3.5 py-3 text-[13.5px] text-ink outline-none'

export function MembersPanel({
  members,
  suppressions,
  isAdministrator,
}: {
  members: MemberRow[]
  suppressions: SuppressionRow[]
  isAdministrator: boolean
}) {
  const t = useTranslations('admin')
  const [query, setQuery] = useState('')
  const [busy, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(q))
  }, [members, query])

  const add = () => {
    if (!email.trim()) return setError(t('mgSuppressNeedEmail'))
    setError(null)
    startTransition(async () => {
      const res = await addSuppression({ email: email.trim(), reason: reason.trim() || undefined })
      if (!res.ok) {
        setNote(null)
        return setError(res.error === 'duplicate' ? t('mgSuppressDuplicate') : t('mgSuppressFailed'))
      }
      setNote(t('mgSuppressAdded'))
      setEmail('')
      setReason('')
    })
  }

  const lift = (id: string) =>
    startTransition(async () => {
      const res = await liftSuppression(id)
      setError(res.ok ? null : t('mgSuppressFailed'))
      setNote(res.ok ? t('mgSuppressLifted') : null)
    })

  return (
    <>
      {/* ── Medlemmer (V2:2570–2593) ─────────────────────────────────────── */}
      <section className={CARD}>
        <div className="flex flex-wrap items-end justify-between gap-3.5">
          <div className="min-w-0">
            <h2 className="font-display text-[21px] font-medium">{t('mgMembersTitle')}</h2>
            {/* Replaces the bundle's «Sist synkronisert …» — see the header. */}
            <p className="mt-[3px] max-w-[520px] text-[12.5px] leading-[1.5] text-mut">
              {t('mgSyncUnavailable')}
            </p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('mgMembersSearch')}
            aria-label={t('mgMembersSearch')}
            /* `touch-44-FIELD`, not `touch-44`: `::after` does not render on a
               replaced element, so the overlay utility is inert on an <input>
               and this one measured 43-44px. The field variant grows the box
               with a transparent border and paints through `background-clip`,
               so the control keeps the bundle's `padding:11px 14px` (V2:2577)
               at every width — RESPONSIVE.md rule 2's whole point: the hit area
               is about thumbs, the painted size is a token. */
            className="touch-44-field [--field-pad-y:11px] box-border w-[200px] max-w-full rounded-[10px] border border-line bg-bg px-3.5 py-[11px] text-[13px] text-ink outline-none"
          />
        </div>

        {members.length === 0 ? (
          <p className="mt-4 text-[13px] text-mut">{t('mgMembersNone')}</p>
        ) : shown.length === 0 ? (
          <p className="mt-4 text-[13px] text-mut">{t('mgMembersNoMatch')}</p>
        ) : (
          <div className="mt-3.5 flex flex-col">
            {shown.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3.5 border-b border-line py-3"
              >
                <span className="min-w-0 flex-1 basis-[200px]">
                  <span className="block text-[13.5px] font-semibold">{m.name}</span>
                  <span className="mt-0.5 block break-words text-[12px] text-mut">
                    {m.email} · {m.meta}
                  </span>
                </span>
                <span
                  className="rounded-full px-[11px] py-[5px] text-[11px] font-bold md:whitespace-nowrap"
                  style={{ background: STATUS_BG[m.status] }}
                >
                  {t(STATUS_KEY[m.status])}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11.5px] text-mut">{t('mgMembersRemoveNote')}</p>
      </section>

      {/* ── Reservasjonsliste + Behandlingsgrunnlag, side by side as the
              bundle draws them (V2:2595–2621). `min(300px,100%)` rather than a
              bare 300px floor — RESPONSIVE.md global rule 7. ─────────────── */}
      <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
      <section className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[16px] font-bold">{t('mgSuppressTitle')}</h2>
          <span className="text-[11.5px] text-mut">
            {t('mgSuppressedCount', { count: suppressions.length })}
          </span>
        </div>
        <p className="mt-1 max-w-[640px] text-[12.5px] leading-[1.55] text-mut">
          {t('mgSuppressNote')}
        </p>

        {suppressions.length === 0 ? (
          <p className="mt-3 text-[13px] text-mut">{t('mgSuppressNone')}</p>
        ) : (
          <div className="mt-3 flex flex-col">
            {suppressions.map((s) => (
              <div
                key={s.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-line py-[9px]"
              >
                <span className="min-w-0 break-all font-mono text-[11.5px]">{s.email}</span>
                <span className="flex flex-none items-center gap-3">
                  <span className="text-[11px] text-mut">{s.reason ?? t('mgMemberObjected')}</span>
                  {isAdministrator ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => lift(s.id)}
                      className="touch-44 cursor-pointer rounded-[9px] border border-line bg-transparent px-[13px] py-2 text-[11.5px] font-semibold text-mut"
                    >
                      {t('mgSuppressLift')}
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        )}

        {isAdministrator ? (
          <div className="mt-[18px] rounded-[14px] border border-dashed border-line bg-bg p-[18px]">
            {/* THE SCOPE, IN PLAIN WORDS, ABOVE THE CONTROL RATHER THAN BELOW IT.
                Added 2026-09-08 (Tor): «a control discharging a duty should not
                require the operator to infer its scope». This one is invented
                (D112c) and there is no drawing to lean on, so what it does has
                to be said rather than shown — and said BEFORE the field, not as
                a footnote after the button. */}
            <div className="text-[12px] font-bold">{t('mgSuppressScopeTitle')}</div>
            <ul className="mb-3.5 mt-1.5 flex list-disc flex-col gap-1 pl-[18px] text-[11.5px] leading-[1.5] text-mut">
              <li>{t('mgSuppressScope1')}</li>
              <li>{t('mgSuppressScope2')}</li>
              <li>{t('mgSuppressScope3')}</li>
            </ul>
            <div className="flex flex-wrap gap-[9px]">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('mgSuppressEmail')}
                aria-label={t('mgSuppressEmail')}
                className={`${FIELD} flex-1 basis-[200px]`}
              />
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('mgSuppressReason')}
                aria-label={t('mgSuppressReason')}
                className={`${FIELD} flex-1 basis-[170px]`}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={add}
                className="touch-44 cursor-pointer rounded-[10px] border-none bg-ac px-5 py-3 text-[13px] font-bold text-ink"
              >
                {t('mgSuppressAdd')}
              </button>
              {note ? (
                <span
                  role="status"
                  className="rounded-full bg-ac2 px-[15px] py-[9px] text-[12.5px] font-semibold"
                >
                  {note}
                </span>
              ) : null}
              {error ? (
                <span role="alert" className="text-[12.5px] font-semibold text-ink">
                  {error}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <p className="mt-3 text-[11.5px] leading-[1.5] text-mut">{t('mgSuppressHow')}</p>
      </section>

      {/* Behandlingsgrunnlag (V2:2610–2621) — unavailable, Q63. Moved here from
          AudiencePanel with V2-3b, because this is the card the bundle pairs it
          with and the pair is a grid, not two stacked sections. */}
      <section className={CARD}>
        <h2 className="text-[16px] font-bold">{t('mgLawfulBasisTitle')}</h2>
        <p className="mt-1 text-[12.5px] leading-[1.55] text-mut">
          {t('mgLawfulBasisUnavailable')}
        </p>
      </section>
      </div>
    </>
  )
}
