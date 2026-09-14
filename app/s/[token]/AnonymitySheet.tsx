'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { anonymitySheet, type SheetInput } from '@/lib/respondent/anonymity-sheet'

/**
 * F1-2 — «Slik behandles svaret ditt» (`rlAnonOpen`, v6:5245-5259).
 *
 * The respondent's own disclosure, and the half of Q187 that had nowhere to
 * land: the manager's Personvern tab interpolates the retention correctly, and
 * until this existed the person whose answers are being kept was told nothing
 * about it at all — neither the bundle's false «24 måneder» nor the true
 * figure.
 *
 * ── THE TRIGGER IS A DEVIATION, AND IT IS THE SMALL ONE ────────────────────
 *
 * v6 draws the control as a pill carrying a shield, the anonymity LABEL
 * («Anonym» / «Valgfritt navn» / «Navngitt») and «hva betyr dette?», in a chip
 * row of its own (v6:5233-5243). Our banner one line up already states the
 * anonymity — generated from the survey's settings by `anonymityPromise`, with
 * the threshold and, below 5, the small-group caveat — so the pill would put a
 * SECOND account of anonymity beside the first, in fewer words. Two accounts of
 * what a respondent was promised is the thing this surface can least afford.
 *
 * So the trigger is the bundle's own words, «hva betyr dette?», attached to the
 * banner that already carries the claim. The SHEET itself is the drawing's:
 * 14px radius, a 1.5px ink border, `--sf`, a 15px/700 title, the 34px round
 * close button, and rows of a fixed label column against a 1px top rule.
 * Logged in DEVIATIONS.
 *
 * Which row says what is decided in `lib/respondent/anonymity-sheet.ts`, never
 * here — six claims about the running product is exactly the kind of thing a
 * component should not be free to improvise.
 */
export function AnonymitySheet({ input, locale }: { input: SheetInput; locale: string }) {
  const t = useTranslations('respondent')
  const [open, setOpen] = useState(false)
  const rows = anonymitySheet(input, locale)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        className="touch-44 mt-2 cursor-pointer rounded-full border-none bg-transparent p-0 text-[12px] font-semibold text-ink underline"
      >
        {t('sheetOpen')}
      </button>

      {open ? (
        /* v6:5246 — `border-radius:14px`, `border:1.5px solid var(--ink)`,
           `background:var(--sf)`, `padding:18px 20px`. */
        <div className="mt-3 rounded-[14px] border-[1.5px] border-ink bg-sf px-5 py-[18px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold">{t('sheetTitle')}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('sheetClose')}
              className="touch-44 flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border border-line bg-transparent p-0 text-[15px] leading-none text-mut"
            >
              ×
            </button>
          </div>
          {/* v6:5251-5257 — a 118px label column against a 1px top rule. It
              stacks below 380px rather than squeezing the value into 60px;
              RESPONSIVE.md's rule for a two-column row, and the drawing has no
              opinion below 380. */}
          <dl className="mt-2.5 flex flex-col gap-0 p-0">
            {rows.map((r) => (
              <div
                key={r.labelKey}
                className="flex flex-col gap-1 border-t border-line py-2.5 min-[380px]:flex-row min-[380px]:items-start min-[380px]:gap-3.5"
              >
                <dt className="flex-none text-[12.5px] text-mut min-[380px]:w-[118px]">
                  {t(r.labelKey as 'sheetStoredLabel')}
                </dt>
                <dd className="m-0 min-w-0 flex-1 text-pretty text-[13px] leading-[1.5]">
                  {t(r.valueKey as 'sheetStoredAnonymous', r.values as never)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </>
  )
}
