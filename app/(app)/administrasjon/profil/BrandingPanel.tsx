'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { setBranding, uploadLogo, type LogoSlot } from '../actions'

/**
 * «Profil og avsender» — the two cards that stand on their own
 * (HeiTuva.dc.html:2313-2347 in the v2 bundle).
 *
 * The three cards this screen does NOT render — sender domains with DNS
 * verification state, sender profiles, and the per-template lock rows that name
 * a sender — are V2-11's, and the reason is CLAUDE.md's never-fabricate rule
 * rather than scope: every one of them shows a verification STATUS, and there
 * is no provider behind it to ask. A chip reading «Verifisert» over nothing is
 * indistinguishable in review from a real one. The tab says so in one sentence
 * instead of drawing them empty (docs/DEVIATIONS.md D108).
 */
export type Accent = { key: string; hex: string; contrast: string; sort_order: number }
export type TypePair = 'playfair' | 'bricolage'

export type BrandingState = {
  accent: string | null
  type: TypePair | null
  logos: Record<LogoSlot, { path: string | null; url: string | null }>
}

/** The design's own default when nothing is chosen (V2:4897, `st.brandAccent
 *  || "#F5C64A"`). NULL stays NULL in the database — see the column comment. */
const DEFAULT_HEX = '#F5C64A'

/** Slot -> the message keys the design gives it (V2:4909). The order is the
 *  bundle's, and the three are a fixed set rather than a table: each has a
 *  distinct purpose named in the design, and a fourth would render nowhere. */
const SLOTS: { slot: LogoSlot; label: string; spec: string }[] = [
  { slot: 'light', label: 'brandLogoLight', spec: 'brandLogoLightSpec' },
  { slot: 'dark', label: 'brandLogoDark', spec: 'brandLogoDarkSpec' },
  { slot: 'icon', label: 'brandLogoIcon', spec: 'brandLogoIconSpec' },
]

const TYPE_PAIRS: { key: TypePair; name: string; desc: string }[] = [
  { key: 'playfair', name: 'typePlayfair', desc: 'typePlayfairDesc' },
  { key: 'bricolage', name: 'typeBricolage', desc: 'typeBricolageDesc' },
]

/** The registry key -> its next-intl name. Q48(b): the registry holds keys, the
 *  message catalogue holds text, so «Varm gul» is translatable and the table
 *  stays language-free. */
const ACCENT_NAME: Record<string, string> = {
  varm_gul: 'accentVarmGul',
  rav: 'accentRav',
  salvie: 'accentSalvie',
  fersken: 'accentFersken',
  lavendel: 'accentLavendel',
}

const MAX_BYTES = 2 * 1024 * 1024
const TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']

/** No `orgId` prop, deliberately: the storage prefix is derived from the
 *  session inside `uploadLogo`, so the browser never holds it and cannot send
 *  it. A component that does not have the value cannot leak it into a path. */
export function BrandingPanel({
  accents,
  initial,
}: {
  accents: Accent[]
  initial: BrandingState
}) {
  const t = useTranslations('admin')
  const [state, setState] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()
  const inputs = useRef<Partial<Record<LogoSlot, HTMLInputElement | null>>>({})

  const chosenHex = accents.find((a) => a.key === state.accent)?.hex ?? DEFAULT_HEX

  const save = (next: { accent: string | null; type: TypePair | null }) => {
    const previous = { accent: state.accent, type: state.type }
    setState((s) => ({ ...s, ...next }))
    startTransition(async () => {
      const res = await setBranding(next)
      if (res.ok) setError(null)
      else {
        // Optimistic UI is only honest if it takes the value BACK when the
        // write is refused. Leaving the new swatch selected would show the
        // administrator a choice the organisation does not have.
        setState((s) => ({ ...s, ...previous }))
        setError(t('brandSaveFailed'))
      }
    })
  }

  const upload = (slot: LogoSlot, file: File) => {
    // Checked here for the MESSAGE and again in the action and the bucket for
    // the RULE. A limit enforced only in the browser is a suggestion.
    if (file.size > MAX_BYTES) return setError(t('brandTooLarge'))
    if (!TYPES.includes(file.type)) return setError(t('brandWrongType'))
    setError(null)

    // The file goes to a server action, which uploads it under the viewer's own
    // session and derives the storage path from their organisation. The path
    // never crosses the boundary from this side: in an org-scoped bucket a path
    // is an authorisation claim, not a parameter.
    const body = new FormData()
    body.set('slot', slot)
    body.set('file', file)

    startTransition(async () => {
      const res = await uploadLogo(body)
      if (!res.ok) return setError(t('brandUploadFailed'))
      setState((s) => ({
        ...s,
        logos: { ...s.logos, [slot]: { path: slot, url: res.url ?? null } },
      }))
    })
  }

  const card = 'rounded-[18px] border border-line bg-sf px-6 py-[22px]'

  return (
    <div className="mt-5 flex flex-col gap-[18px]">
      {/* ── Logo (V2:2313-2325) ─────────────────────────────────────────── */}
      <section className={card}>
        <h2 className="font-display text-[22px] font-medium">{t('brandLogoTitle')}</h2>
        <div className="mt-3.5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {SLOTS.map(({ slot, label, spec }) => {
            const held = state.logos[slot]
            return (
              <div
                key={slot}
                className="rounded-[14px] border border-dashed border-line bg-bg p-[18px] text-center"
              >
                <div className="text-[13px] font-semibold">{t(label)}</div>
                <div className="mt-1 text-[11.5px] leading-[1.45] text-mut">{t(spec)}</div>

                {/* The uploaded file, when there is one. The design draws the
                    empty slot only — it is a prototype with no storage — so
                    this is the state it has no drawing for, rendered in the
                    slot's own frame rather than invented elsewhere. */}
                {held.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={held.url}
                    alt=""
                    className="mx-auto mt-3 max-h-[46px] max-w-full object-contain"
                  />
                ) : null}

                <input
                  ref={(el) => {
                    inputs.current[slot] = el
                  }}
                  type="file"
                  accept={TYPES.join(',')}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) upload(slot, file)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputs.current[slot]?.click()}
                  className="touch-44 mt-3 inline-block cursor-pointer rounded-[9px] border border-line bg-sf px-3.5 py-[9px] text-[12px] font-semibold text-ink"
                >
                  {held.url ? t('brandReplace') : t('brandUpload')}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Farge og typografi (V2:2327-2347) ───────────────────────────── */}
      <section className={card}>
        <h2 className="font-display text-[22px] font-medium">{t('brandTypeTitle')}</h2>

        <div className="mt-3.5 flex flex-wrap gap-2.5">
          {accents.map((a) => {
            const on = a.hex === chosenHex && (state.accent !== null || a.hex === DEFAULT_HEX)
            return (
              <button
                key={a.key}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => save({ accent: a.key, type: state.type })}
                className="flex min-w-[120px] cursor-pointer flex-col items-start gap-[7px] rounded-[13px] bg-sf p-3 text-left text-ink"
                style={{ border: `1.5px solid ${on ? 'var(--ink)' : 'var(--line)'}` }}
              >
                <span
                  className="box-border flex h-[34px] w-full items-center justify-end rounded-[9px] pr-2 text-[12px] font-bold"
                  style={{ background: a.hex }}
                >
                  {on ? '✓' : ''}
                </span>
                <span className="text-[12.5px] font-semibold">
                  {t(ACCENT_NAME[a.key] ?? 'brandTypeTitle')}
                </span>
                <span className="text-[11px] text-mut">
                  {t('brandContrast', { contrast: a.contrast })}
                </span>
              </button>
            )
          })}
        </div>

        <p className="mt-3 text-[11.5px] leading-[1.5] text-mut">{t('brandAccentNote')}</p>

        <div className="mt-4 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {TYPE_PAIRS.map((p) => {
            const on = (state.type ?? 'playfair') === p.key
            return (
              <button
                key={p.key}
                type="button"
                disabled={busy}
                aria-pressed={on}
                onClick={() => save({ accent: state.accent, type: p.key })}
                className="flex cursor-pointer flex-col items-start gap-[3px] rounded-[13px] px-4 py-3.5 text-left text-ink"
                style={{
                  border: `1.5px solid ${on ? 'var(--ink)' : 'var(--line)'}`,
                  background: on ? 'var(--sbg)' : 'var(--sf)',
                }}
              >
                <span className="text-[13.5px] font-bold">{t(p.name)}</span>
                <span className="text-[11.5px] text-mut">{t(p.desc)}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* The three cards V2-11 owns. Stated, not drawn — see the file header. */}
      <p className="text-[12.5px] leading-[1.55] text-mut">{t('brandSenderDeferred')}</p>

      {error ? (
        <p role="alert" className="text-[12.5px] font-semibold text-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}
