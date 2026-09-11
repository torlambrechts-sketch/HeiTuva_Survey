'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { addBankQuestion } from '@/app/(app)/bibliotek/actions'

export type BankRow = {
  id: string
  text: string
  /** Already resolved to the type's label, so the picker holds no registry. */
  typeLabel: string
  category: string
  isOwn: boolean
}

/**
 * «Fra spørsmålsbanken» — the overlay, V2:650-693.
 *
 * ── WHY THIS IS A MODAL AND NOT A LINK ─────────────────────────────────────
 *
 * The control existed before this phase and carried the bundle's own label and
 * colour — as a `<Link href="/bibliotek?fane=bank">`. It left the Builder. The
 * destination then had to *rediscover* which draft was meant, and did it by
 * guessing: «the org's most recently touched draft» (D26). So the app already
 * implemented this overlay's semantics, on another screen, having thrown away
 * the one piece of state that made them exact.
 *
 * Here the survey is a prop. There is no guess, and D26's heuristic does not
 * apply to this path at all.
 *
 * ── WHAT THE DATABASE ENFORCES, RATHER THAN THIS COMPONENT ─────────────────
 *
 * `addBankQuestion` calls `requireEditor()`, and the insert lands under
 * `sq_cud_ins`, whose WITH CHECK is `app.can_edit_survey(survey_id)`. So a
 * `leser` is refused twice and a survey in another org is refused by the
 * database even if the id is typed by hand. Nothing here is a permission check;
 * the disabled state is only there so a reader is not offered a button that
 * will fail.
 */
export function BankPicker({
  surveyId,
  surveyTitle,
  rows,
  canEdit,
  onAdded,
}: {
  surveyId: string
  surveyTitle: string
  rows: BankRow[]
  canEdit: boolean
  /**
   * Appends the inserted question to the Builder's own list.
   *
   * `revalidatePath` alone is not enough and it took a fix pass to see why:
   * `Builder` holds `useState<BuilderDraft>(initial)`, and `useState` IGNORES a
   * new initial value. The server component re-rendered, handed down a fresh
   * `initial`, and the list on screen did not move — an insert that succeeds
   * and shows nothing, which is precisely the failure this overlay exists to
   * stop happening on the Library route.
   */
  onAdded: (q: { id: string; type: string; text: string; config: unknown }) => void
}) {
  const t = useTranslations('builder')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<string>('__all')
  const [added, setAdded] = useState(0)
  const [failed, setFailed] = useState(false)
  const [pending, start] = useTransition()
  const closeRef = useRef<HTMLButtonElement>(null)

  /* Escape closes, and focus lands inside on open. A modal that traps neither
     is a modal only visually — RESPONSIVE.md § Modals and the wizard. */
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  /* V2:6204 — the chips are BUILT from the categories present, not listed. A
     fixed list would show a chip that filters to nothing the day a category is
     renamed in the seed. «Alle» and «Egne» are the two that are not categories:
     they are held as sentinels rather than as the Norwegian words, so the
     filter does not break when the label is translated. */
  const cats = [...new Set(rows.map((r) => r.category))]
  const q = query.trim().toLowerCase()
  const shown = rows.filter(
    (r) =>
      (cat === '__all' || (cat === '__own' ? r.isOwn : r.category === cat)) &&
      r.text.toLowerCase().includes(q),
  )

  return (
    <>
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        className="touch-44 mt-3 block w-full cursor-pointer rounded-[10px] border-none bg-ac3 py-[11px] text-center text-[13px] font-semibold text-ink disabled:opacity-50"
      >
        {t('fromBank')}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('pickerTitle')}
          className="fixed inset-0 z-[60] flex items-center justify-center p-7 max-md:p-4"
          style={{ background: 'rgba(25,21,16,.42)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="flex max-h-[82vh] w-full max-w-[660px] flex-col overflow-hidden rounded-[20px] border border-line bg-sf shadow-[0_30px_70px_rgba(25,21,16,.3)]">
            <div className="border-b border-line px-6 pb-4 pt-[22px]">
              <div className="flex items-start justify-between gap-3.5">
                <div className="min-w-0">
                  <div className="font-display text-[22px] font-medium">{t('pickerTitle')}</div>
                  <div className="mt-[3px] text-[12.5px] text-mut">
                    {t('pickerInto', {
                      title: surveyTitle,
                      count: t('pickerCount', { count: shown.length }),
                    })}
                  </div>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label={t('pickerClose')}
                  onClick={() => setOpen(false)}
                  className="touch-44 h-[34px] w-[34px] flex-none cursor-pointer rounded-[10px] border border-line bg-transparent text-[16px] leading-none text-ink"
                >
                  ×
                </button>
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('pickerSearch')}
                aria-label={t('pickerSearch')}
                className="touch-44-field mt-3.5 box-border w-full rounded-[10px] border border-line bg-bg px-[15px] py-3 text-[13.5px] text-ink outline-none"
              />
              <div className="mt-[11px] flex flex-wrap gap-1.5">
                {[
                  { key: '__all', label: t('pickerAll') },
                  { key: '__own', label: t('pickerOwn') },
                  ...cats.map((c) => ({ key: c, label: c })),
                ].map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={cat === c.key}
                    onClick={() => setCat(c.key)}
                    className="touch-44 cursor-pointer whitespace-nowrap rounded-full border border-line px-[13px] py-[7px] text-[12px] font-semibold text-ink"
                    style={{ background: cat === c.key ? 'var(--ac)' : 'transparent' }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-auto px-6 py-2">
              {shown.length === 0 ? (
                <p className="py-6 text-[13px] text-mut">{t('pickerEmpty')}</p>
              ) : (
                shown.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-3.5 border-b border-line py-[13px]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium leading-[1.4]">{r.text}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold"
                          style={{ background: r.isOwn ? 'var(--sf2)' : 'var(--ac2)' }}
                        >
                          {r.isOwn ? t('pickerBadgeOwn') : t('pickerBadgeStandard')}
                        </span>
                        <span className="text-[11.5px] text-mut">
                          {r.category} · {r.typeLabel}
                        </span>
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={pending || !canEdit}
                      onClick={() =>
                        start(async () => {
                          setFailed(false)
                          const res = await addBankQuestion(r.id, surveyId)
                          if (res.ok) {
                            onAdded(res.question)
                            setAdded((n) => n + 1)
                          } else setFailed(true)
                        })
                      }
                      className="touch-44 flex-none cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-sbg px-4 py-[9px] text-[12.5px] font-semibold text-ink disabled:opacity-50"
                    >
                      {t('pickerAdd')}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-line bg-bg px-6 py-4">
              <span className="text-[12.5px] text-mut">
                {/* The count is not reset by adding more: the bundle's note is
                    cumulative for the life of the overlay (V2:6200), which is
                    what makes «Ferdig» meaningful. */}
                {failed
                  ? t('pickerFailed')
                  : added === 0
                    ? t('pickerAddedNone')
                    : t('pickerAdded', { count: added })}
              </span>
              <span className="flex flex-wrap gap-[9px]">
                <Link
                  href="/bibliotek?fane=bank"
                  className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-[17px] py-[11px] text-[12.5px] font-semibold text-ink no-underline"
                >
                  {t('pickerLibrary')}
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-5 py-[11px] text-[13px] font-bold text-ink"
                >
                  {t('pickerDone')}
                </button>
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
