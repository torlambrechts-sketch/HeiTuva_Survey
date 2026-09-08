'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { belowThreshold } from '@/lib/questions/policy-warnings'
import { SEGMENT_OPS, type SegmentClause } from '@/lib/audiences/segments'
import { createAudience } from './actions'

/**
 * Målgrupper — the v2 bundle's `adminMalgrupper` section (V2:2405–2658).
 *
 * ── WHAT IS NOT DRAWN, AND WHY, BECAUSE IT IS MOST OF THE DIVERGENCE ────────
 *
 * **The population pill is absent from every card** (drawn at V2:2437 and
 * V2:2458). `groups` has no population column and `segments` has none either —
 * populations are catalogue-blocked (**Q63**) — so the pill has no true value
 * to render. CLAUDE.md: render the real state, render nothing, or render the
 * design's empty treatment; a coloured chip reading «Ansatte» over a column
 * that does not exist is the fabrication that rule forbids. The Populasjoner
 * card above says so once, in words, rather than every card saying it in a
 * chip (docs/DEVIATIONS.md D111).
 *
 * **The rule input is a structured builder, not the bundle's free-text box**
 * (V2:2482). **Q65** decided the predicate is `{field, op, value}` over an
 * allowlisted set, never free text — and CLAUDE.md's control-substitution rule
 * covers exactly this case: the prototype's control cannot express a real
 * schema constraint, so the real control is used, styled as that control class
 * is styled elsewhere in the bundle. The rendered rule is GENERATED from the
 * predicate, so it translates and cannot drift from what is stored.
 *
 * **Fields the product has no column for are OFFERED AND DISABLED**, with the
 * reason on them. Q65: «the rule editor must say so rather than offering fields
 * that can never match». Omitting them would leave the editor silently shorter
 * than the design with no explanation; showing them enabled would let a person
 * build a rule that can never match.
 */
export type Audience = {
  id: string
  name: string
  /** Real for a group (members with this group_id). For a segment this is the
   *  rule's match count, or NULL when the rule cannot be evaluated — never 0,
   *  which would be indistinguishable from a segment nobody matches. */
  count: number | null
  source: string | null
  updated: string
  rule: string | null
}

export type Field = { key: string; available: boolean }

const FIELD_KEY: Record<string, string> = {
  role: 'mgFieldRole',
  status: 'mgFieldStatus',
  group: 'mgFieldGroup',
  member_since: 'mgFieldMemberSince',
  stillingsprosent: 'mgFieldStillingsprosent',
  startdato: 'mgFieldStartdato',
  land: 'mgFieldLand',
}
const OP_KEY: Record<string, string> = {
  eq: 'mgOpEq',
  ne: 'mgOpNe',
  in: 'mgOpIn',
  lt: 'mgOpLt',
  gt: 'mgOpGt',
}

const CARD = 'rounded-[18px] border border-line bg-sf px-6 py-[22px]'

export function AudiencePanel({
  groups,
  segments,
  fields,
  orgThreshold,
  canCreate,
}: {
  groups: Audience[]
  segments: Audience[]
  fields: Field[]
  /** Q95: there is no survey in scope on an admin tab, so the badge compares
   *  against the organisation's default — and the LABEL names it. */
  orgThreshold: number
  canCreate: boolean
}) {
  const t = useTranslations('admin')
  const [busy, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [field, setField] = useState('')
  const [op, setOp] = useState<(typeof SEGMENT_OPS)[number]>('eq')
  const [value, setValue] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Q95 — the badge, and the label that makes its number checkable.
   *
   * `belowThreshold` is the shared predicate (`lib/questions/policy-warnings`),
   * not a fifth copy of the bundle's `count < 5`. An audience of unknown size
   * gets no badge at all: a warning derived from a number we could not compute
   * is a guess wearing a warning's clothes.
   */
  const badge = (count: number | null) =>
    count !== null &&
    belowThreshold({
      count,
      k: orgThreshold,
      respondentKind: 'person',
      anonymity: 'anonymous',
    })

  const submit = () => {
    if (!name.trim()) return setError(t('mgNeedName'))
    setError(null)
    const predicate: SegmentClause[] =
      field && value.trim() ? [{ field, op, value: value.trim() }] : []
    startTransition(async () => {
      const res = await createAudience({ name: name.trim(), predicate })
      if (!res.ok) {
        setNote(null)
        return setError(res.error === 'duplicate' ? t('mgDuplicate') : t('mgSaveFailed'))
      }
      setNote(res.kind === 'segment' ? t('mgCreatedSegment') : t('mgCreatedGroup'))
      setName('')
      setField('')
      setValue('')
    })
  }

  return (
    <div className="mt-5 flex flex-col gap-[18px]">
      {/* ── Populasjoner (V2:2408–2423) — the unavailable treatment, Q63 ─── */}
      <section className="rounded-[18px] border border-line bg-sbg px-6 py-[22px]">
        <h2 className="font-display text-[22px] font-medium">{t('mgPopulationsTitle')}</h2>
        <p className="mt-1 max-w-[640px] text-[13px] leading-[1.6] text-mut">
          {t('mgPopulationsUnavailable')}
        </p>
      </section>

      {/* ── Grupper (V2:2425–2447) ───────────────────────────────────────── */}
      <section className={CARD}>
        <h2 className="font-display text-[21px] font-medium">{t('mgGroupsTitle')}</h2>
        <p className="mt-[3px] text-[12.5px] text-mut">{t('mgGroupsDesc')}</p>
        {groups.length === 0 ? (
          <p className="mt-4 text-[13px] text-mut">{t('mgNoGroups')}</p>
        ) : (
          <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {groups.map((g) => (
              <div
                key={g.id}
                className="min-w-0 rounded-[14px] border border-line bg-bg px-[18px] py-4"
              >
                <span className="block truncate text-[14px] font-semibold">{g.name}</span>
                <div className="mt-[5px] text-[12px] text-mut">
                  {t('mgPeople', { count: g.count ?? 0, source: g.source ?? t('mgSourceManual') })}
                </div>
                <div className="mt-[3px] text-[11.5px] text-mut">
                  {t('mgUpdated', { when: g.updated })}
                </div>
                {badge(g.count) ? (
                  <div className="mt-2.5 rounded-[9px] bg-ac3 px-[11px] py-[7px] text-[11px] font-semibold leading-[1.4]">
                    {t('mgBelowThreshold', { k: orgThreshold })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Segmenter (V2:2449–2494) ─────────────────────────────────────── */}
      <section className={CARD}>
        <h2 className="font-display text-[21px] font-medium">{t('mgSegmentsTitle')}</h2>
        <p className="mt-[3px] text-[12.5px] text-mut">{t('mgSegmentsDesc')}</p>

        {segments.length === 0 ? (
          <p className="mt-4 text-[13px] text-mut">{t('mgNoSegments')}</p>
        ) : (
          <div className="mt-3.5 flex flex-col gap-0.5">
            {segments.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-3.5 border-b border-line py-[13px]"
              >
                <span className="min-w-[220px] flex-1">
                  <span className="text-[14px] font-semibold">{s.name}</span>
                  {/* The rule, GENERATED from the predicate (Q65) — monospace as
                      the bundle draws it, wrapping rather than truncating,
                      because a rule you cannot read is a rule you cannot check. */}
                  <span className="mt-[5px] block break-words font-mono text-[11.5px] text-mut">
                    {s.rule}
                  </span>
                </span>
                <span className="whitespace-nowrap text-[12.5px] text-mut">
                  {s.count === null
                    ? t('mgMatchesUnknown')
                    : t('mgMatches', { count: s.count })}
                </span>
                {badge(s.count) ? (
                  <span className="whitespace-nowrap rounded-full bg-ac3 px-[11px] py-[5px] text-[11px] font-bold">
                    {t('mgBelowThreshold', { k: orgThreshold })}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {canCreate ? (
          <div className="mt-[18px] rounded-[14px] border border-dashed border-line bg-bg p-[18px]">
            <div className="text-[13.5px] font-bold">{t('mgNewTitle')}</div>
            <p className="mt-[3px] text-[12px] text-mut">{t('mgNewDesc')}</p>

            <div className="mt-3 flex flex-wrap gap-[9px]">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('mgNamePlaceholder')}
                aria-label={t('mgNamePlaceholder')}
                className="box-border min-w-[170px] flex-1 rounded-[10px] border border-line bg-sf px-3.5 py-3 text-[13.5px] text-ink outline-none"
              />
            </div>

            {/* The structured builder that replaces the bundle's free-text rule
                box. Unavailable fields are OFFERED AND DISABLED with the reason
                — Q65 requires the editor to say so. */}
            <fieldset className="mt-[9px]">
              <legend className="text-[12px] text-mut">{t('mgRuleLegend')}</legend>
              <div className="mt-2 flex flex-wrap gap-[9px]">
                <select
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  aria-label={t('mgFieldPlaceholder')}
                  className="box-border rounded-[10px] border border-line bg-sf px-3.5 py-3 text-[13.5px] text-ink outline-none"
                >
                  <option value="">{t('mgFieldPlaceholder')}</option>
                  {fields.map((f) => (
                    <option key={f.key} value={f.key} disabled={!f.available}>
                      {f.available
                        ? t(FIELD_KEY[f.key] ?? 'mgFieldPlaceholder')
                        : t('mgFieldUnavailable', {
                            field: t(FIELD_KEY[f.key] ?? 'mgFieldPlaceholder'),
                          })}
                    </option>
                  ))}
                </select>
                <select
                  value={op}
                  onChange={(e) => setOp(e.target.value as (typeof SEGMENT_OPS)[number])}
                  aria-label={t('mgRuleLegend')}
                  className="box-border rounded-[10px] border border-line bg-sf px-3.5 py-3 text-[13.5px] text-ink outline-none"
                >
                  {SEGMENT_OPS.map((o) => (
                    <option key={o} value={o}>
                      {t(OP_KEY[o] ?? 'mgOpEq')}
                    </option>
                  ))}
                </select>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={t('mgValuePlaceholder')}
                  aria-label={t('mgValuePlaceholder')}
                  className="box-border min-w-[140px] flex-1 rounded-[10px] border border-line bg-sf px-3.5 py-3 font-mono text-[12.5px] text-ink outline-none"
                />
              </div>
            </fieldset>

            <div className="mt-3.5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="touch-44 cursor-pointer rounded-[10px] border-none bg-ac px-5 py-3 text-[13px] font-bold text-ink"
              >
                {t('mgCreate')}
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
      </section>

      {/* ── Behandlingsgrunnlag (V2:2610–2621) — unavailable, Q63 ────────── */}
      <section className={CARD}>
        <h2 className="font-display text-[21px] font-medium">{t('mgLawfulBasisTitle')}</h2>
        <p className="mt-1 max-w-[640px] text-[13px] leading-[1.6] text-mut">
          {t('mgLawfulBasisUnavailable')}
        </p>
      </section>
    </div>
  )
}
