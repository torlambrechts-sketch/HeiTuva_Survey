'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TUVA_ANSWERS, surveyIdIn, tuvaHref, tuvaKeyFor } from '@/lib/tuva/answers'

/**
 * G4 — Tuva, the global helper, mounted once by the shell (v6:5858-5930).
 *
 * A fixed bubble at the bottom right that opens a 308px panel carrying a
 * headline, a line of context and up to three answers. It renders NOTHING on a
 * route the registry gives no entry, which is most of them — see
 * `lib/tuva/answers.ts` for which and why.
 *
 * ── WHAT THE BUNDLE DRAWS THAT DOES NOT SHIP, AND WHY IT SAYS SO ───────────
 *
 * Three controls in this panel collect something with nowhere to put it. Tor's
 * rule from G2/G3 decides all three: **a switch whose state nothing stores is
 * not a setting, and a rating nothing records is the same shape.** Each is
 * refused ON THE SCREEN with the reason, the way admin-profil and
 * admin-malgrupper already do, rather than being quietly absent.
 *
 *  1. **Thumbs up/down (`tvRated`, v6:5889-5901).** `onTvRateUp` and
 *     `onTvRateDown` are `setState` and nothing else — and the down-vote's own
 *     copy is «Takk. Spørsmålet er logget slik at vi kan lære av det»
 *     (v6:9011). **That sentence asserts a write that does not exist**, which
 *     makes it the sharpest case in the panel: not a control that does nothing,
 *     but a control that says it did something. There is no column and no
 *     endpoint; building the control first and the writer «later» is the shape
 *     invariant 8 exists to refuse.
 *  2. **The ask box (`tvAsk`/`tvAnswer`, v6:5869-5879, v6:6784-6820).** «Spør
 *     Tuva om tallene…» over a FIVE-BRANCH KEYWORD MATCHER — `hit("mangler",
 *     "purre",…)` — whose default branch already admits it cannot answer. Three
 *     of its five branches could not ship anyway: one opens Feltarbeid
 *     (decided-not-built), one recomputes `sum(target || 30)`, the invented
 *     denominator F1 closed and F3 made unrepresentable, and one claims Tuva
 *     fills in statutory reports. A free-text box that mostly returns «I can't
 *     answer that» is a capability claim, and this one would be one over a
 *     `switch`.
 *  3. **«Kom i gang» (`tvTrack`, v6:8976-8995).** Not refused — REDIRECTED.
 *     G3 already shipped this checklist on Oversikt, derived from real state.
 *     The bundle's second copy uses DIFFERENT predicates, so the two could show
 *     different numbers on the same day; and its own `tvTrackLabel` marks steps
 *     one and two done by the same condition (`st.surveys.length > 0` twice,
 *     v6:8991-8992), which is four steps over three predicates — exactly what
 *     G3's onboarding test 2 exists to forbid. So the panel LINKS to the one
 *     that works instead of drawing a rival.
 *
 * `tvTrackOpen` is measured and is NOT telemetry despite the name: it is the
 * disclosure state of that «Kom i gang» section (`tvTrackToggle`, «Skjul kom i
 * gang»). Building it as open-tracking would have been building a different
 * thing entirely.
 *
 * ── THE UNREAD DOT IS `useState`, DELIBERATELY ─────────────────────────────
 *
 * `tvDot` marks the bubble when the panel has not been opened on THIS screen
 * (`(st.tvSeen || "") !== st.screen`). It is a per-viewer nicety with no
 * meaning beyond the session, so it is component state — the same reasoning
 * `TuvaPlacement` records for the bubble's open/shut, and the reason there is
 * no cookie: a cookie is for something the SERVER must render correctly.
 */
export function TuvaHelper({ tuvaOn }: { tuvaOn: boolean }) {
  const pathname = usePathname()
  const t = useTranslations('tuva')
  const [open, setOpen] = useState(false)
  /** The screens whose answer has been read. Session-scoped on purpose. */
  const [seen, setSeen] = useState<string[]>([])

  const key = tuvaKeyFor(pathname)
  // The switch is real (G2): off means no bubble at all, not a disabled one.
  if (!tuvaOn || !key) return null

  const surveyId = surveyIdIn(pathname)
  const answers = TUVA_ANSWERS[key]
    .map((a) => ({ stem: a.stem, href: tuvaHref(a, surveyId) }))
    // A `tab` answer with no survey in scope has no destination, so it is not
    // rendered — rather than rendered pointing at nothing.
    .filter((a): a is { stem: string; href: string } => a.href !== null)

  const unread = !open && !seen.includes(key)

  return (
    <div
      /* FLOATING IS A ≥1280px BEHAVIOUR, and that is RESPONSIVE.md rather than a
         preference. Measured: as a `fixed` bubble at every width, the helper's
         hit area collided with a control on FIVE screens at 390px and 320px —
         seven blockers, «Administrasjon», «Arbeidsmiljø», «Lovpålagt»,
         «Interne notater», two import rows. That is not a position to nudge: a
         fixed corner over full-width content will sit on whatever happens to be
         under it, which is why the first attempt (shrink the bubble to 44px)
         moved the count from two to seven rather than to zero.

         Three rules decide the shape:
          · rule 6 — «Sticky elements: page header only. Do not add sticky
            footers or bottom bars that the design does not have.» Below 1280px
            there IS no design for this bubble.
          · rule 2 — expanded hit areas must not overlap, fixed «once as a
            shared utility/component, not per instance».
          · rule 4 — no feature hidden on mobile: it reflows into the flow at
            the end of the content, it does not disappear.

         So: in flow below `xl`, fixed at `xl` and above, where the bundle's
         1440px canvas is authoritative and the pixel bar applies. The 52px
         bubble and 22px insets are the drawing's, unchanged, where they are
         the drawing's to set. */
      className="mt-6 flex flex-col items-end gap-[10px] xl:fixed xl:bottom-[22px] xl:right-[22px] xl:z-[60] xl:mt-0"
    >
      {open ? (
        <div className="max-h-[calc(100vh-110px)] w-[308px] max-w-[76vw] overflow-y-auto rounded-[17px] border border-line bg-sf px-[18px] py-[17px] shadow-[0_14px_34px_rgba(25,21,16,.16)]">
          <div className="flex items-center gap-[10px]">
            <span
              aria-hidden
              className="block h-[34px] w-[34px] flex-none rounded-full bg-sbg"
            />
            <span className="flex-1 text-[13.5px] font-bold">{t('name')}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('close')}
              className="touch-44 h-7 w-7 cursor-pointer rounded-full border border-line bg-transparent text-[14px] leading-none text-mut"
            >
              ×
            </button>
          </div>

          <p className="mt-[10px] text-[13px] leading-[1.55]">
            {t(`${key}Headline` as 'bibliotekHeadline')}{' '}
            <span className="text-mut">{t(`${key}Short` as 'bibliotekShort')}</span>
          </p>

          <div className="mt-3 flex flex-col gap-[2px]">
            {answers.map((a) => (
              <Link
                key={a.stem}
                href={a.href}
                onClick={() => setOpen(false)}
                className="touch-44 flex flex-col rounded-[11px] border border-line bg-bg px-[13px] py-[10px] no-underline"
              >
                <span className="text-[12.5px] font-bold text-ink">
                  {t(`${a.stem}Label` as 'libValidatedLabel')}
                </span>
                <span className="mt-[2px] text-[11.5px] leading-[1.45] text-mut">
                  {t(`${a.stem}Desc` as 'libValidatedDesc')}
                </span>
              </Link>
            ))}
          </div>

          {/* «Kom i gang» — the one that is derived, on the screen that has it. */}
          <Link
            href="/oversikt"
            onClick={() => setOpen(false)}
            className="touch-44 mt-[10px] flex items-center rounded-[11px] border border-dashed border-line px-[13px] py-[9px] text-[11.5px] font-semibold text-mut no-underline"
          >
            {t('trackElsewhere')}
          </Link>

          {/* The two refusals, stated rather than absent. */}
          <p className="mt-[10px] border-t border-line pt-[9px] text-[11px] leading-[1.45] text-mut">
            {t('noAsk')}
          </p>
          <p className="mt-[6px] text-[11px] leading-[1.45] text-mut">{t('noRating')}</p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setSeen((s) => (s.includes(key) ? s : [...s, key]))
        }}
        aria-label={t('openLabel')}
        aria-expanded={open}
        className="relative h-[52px] w-[52px] cursor-pointer rounded-full border border-line bg-sbg text-[18px] font-bold text-ink shadow-[0_10px_24px_rgba(25,21,16,.18)]"
      >
        ?
        {unread ? (
          <span
            aria-hidden
            className="absolute right-[6px] top-[6px] block h-[9px] w-[9px] rounded-full bg-ac3"
          />
        ) : null}
      </button>
    </div>
  )
}
