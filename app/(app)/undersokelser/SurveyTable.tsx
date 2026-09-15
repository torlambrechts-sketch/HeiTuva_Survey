'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { STATUS_BAR, STATUS_DOT, type ListRow } from '@/lib/surveys/list-row'
import { STATUS_COLORS } from './keys'

/**
 * F4 — the SIX-COLUMN TABLE (v6:2301-2392), which is what `svView === 'liste'`
 * renders and therefore the drawing's DEFAULT view. The app had only the card
 * grid, so the bundle's default was the one view that did not exist.
 *
 * Columns: Undersøkelse · Svar · Sendt · Status · Eier · Handling.
 *
 * ── THE EXPANDED ROW IS COMPONENT STATE, NOT A COOKIE ──────────────────────
 *
 * `r.open` (v6:9066) is which row is expanded. That is ephemeral — it answers
 * «what am I looking at right now», not «how do I like my list» — so it is
 * `useState` here rather than a third cookie. Q122's mechanism is for choices
 * that should survive a reload; this one should not.
 *
 * ── «Svar» RENDERS THE COUNT WHEN THERE IS NO DENOMINATOR ──────────────────
 *
 * v6:9058 prints `{responses} / {target || 30}`. A cell reading «6 / 30» for a
 * survey nobody set a recipient count on is a fabricated figure in a table, and
 * a table is exactly where a number gets quoted. `pct === null` is the honest
 * state and every branch below handles it.
 *
 * ── AND THE OWNER'S EMAIL IS THE REAL ONE OR NOTHING ───────────────────────
 *
 * v6:9057 builds an address: `owner.split(" ")[0].toLowerCase() + "@nordiskstudio.no"`.
 * We have `org_members.email`, so the title attribute carries the real address;
 * where there is no owner there is no monogram and no title, rather than a
 * placeholder person.
 */
export function SurveyTable({
  rows,
  menus,
  labels,
}: {
  rows: ListRow[]
  /**
   * The row menus, built by the PAGE (which has the translations and the
   * schedule sentence) and mounted here. The drawing's row has no menu; six
   * actions live only there, so the column carries the drawn icons AND it —
   * see `RowMenu`'s header.
   *
   * **An OBJECT of elements, not a function of id.** This component is
   * `'use client'`, and a function prop from a server component is refused at
   * SERIALISATION — a 500 at render time that the type checker, the linter and
   * the production build all let through. Elements serialise; closures do not.
   */
  menus: Record<string, ReactNode>
  labels: {
    colSurvey: string
    colResponses: string
    colSent: string
    colStatus: string
    colOwner: string
    colAction: string
    noSent: string
    noOwner: string
    responsesOnly: string
    open: string
    build: string
    results: string
    report: string
    more: string
    less: string
    invited: string
    answered: string
    missing: string
    questions: string
    statusLabel: Record<string, string>
  }
}) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    /* v6:2302 — the table scrolls horizontally inside the card rather than
       squeezing: `min-width:760px`. RESPONSIVE.md allows exactly this for a
       table, and it is the one element permitted to be wider than the page.

       THE 804 IS THE 760 PLUS THE TOUCH CLUSTER, AND THE ARITHMETIC IS WRITTEN
       DOWN BECAUSE A COPIED CONSTANT CARRIES ITS CONTEXT INVISIBLY (CLAUDE.md,
       row 10 of the enumeration table). The action column holds FIVE 30px
       controls. A 30px control with a 44px hit area overflows (44 − 30) / 2 =
       7px each side, so adjacent ones need 14px between painted edges —
       `.touch-cluster`, which `globals.css` scopes to max-width 767px because
       above it the pointer is a mouse and the overlay does not exist.

       5 × 30 + 4 × 14 = 206, so the column is 210 below md and the drawing's
       166 above it; the table's minimum moves by the same 44px. Measured
       before this: 276 overlapping pairs at 390px and 320px, at 440px² and
       352px² each. The column width is the fix; the control is a token and is
       not touched. */
    <div className="overflow-x-auto rounded-b-[19px]">
      <div className="min-w-[804px] md:min-w-[760px]">
        <div className="flex items-center gap-4 border-y border-line bg-bg px-[22px] py-[11px] text-[11px] uppercase tracking-[.09em] text-mut">
          <span className="min-w-[150px] flex-[2.2_1_200px]">{labels.colSurvey}</span>
          <span className="w-[84px] flex-none text-right">{labels.colResponses}</span>
          <span className="w-[84px] flex-none">{labels.colSent}</span>
          <span className="w-[92px] flex-none">{labels.colStatus}</span>
          <span className="min-w-[110px] flex-[1.2_1_140px]">{labels.colOwner}</span>
          <span className="w-[210px] flex-none text-right md:w-[166px]">{labels.colAction}</span>
        </div>

        {rows.map((r) => {
          const pill = STATUS_COLORS[r.status as keyof typeof STATUS_COLORS]
          const isOpen = open === r.id
          return (
            <div
              key={r.id}
              className="border-b border-line"
              style={{ background: isOpen ? 'var(--bg)' : 'transparent' }}
            >
              <div className="flex items-center gap-4 px-[22px] py-[14px]">
                <span className="min-w-[150px] flex-[2.2_1_200px]">
                  <Link
                    href={`/undersokelser/${r.id}/bygg`}
                    className="touch-44 block truncate text-[14px] font-semibold text-ink no-underline"
                  >
                    {r.title}
                  </Link>
                  <span className="mt-0.5 block truncate text-[12px] text-mut">{r.audience}</span>
                </span>

                {/* The cell. With a denominator it is «n / m»; without one it is
                    the count and says so, because «6 / 30» would be a number
                    nobody chose. */}
                <span className="w-[84px] flex-none whitespace-nowrap text-right text-[13.5px]">
                  {r.target === null
                    ? labels.responsesOnly.replace('{n}', String(r.responses))
                    : `${r.responses} / ${r.target}`}
                </span>

                <span className="w-[84px] flex-none whitespace-nowrap text-[12.5px] text-mut">
                  {r.sentLabel ?? labels.noSent}
                </span>

                <span className="w-[92px] flex-none">
                  <span
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11.5px] font-bold"
                    style={{ background: pill?.bg, color: pill?.fg }}
                  >
                    <span
                      aria-hidden="true"
                      className="block h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_DOT[r.status] }}
                    />
                    {labels.statusLabel[r.status]}
                  </span>
                </span>

                <span
                  className="flex min-w-[110px] flex-[1.2_1_140px] items-center gap-[9px]"
                  title={r.ownerEmail ?? undefined}
                >
                  {r.initials ? (
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-sbg text-[11px] font-bold">
                      {r.initials}
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate text-[13px]">
                    {r.ownerName ?? labels.noOwner}
                  </span>
                </span>

                <span className="touch-cluster flex w-[210px] flex-none items-center justify-end gap-1 md:w-[166px]">
                  {(
                    [
                      [`/undersokelser/${r.id}/bygg`, labels.build, 'build'],
                      [`/undersokelser/${r.id}/resultater`, labels.results, 'results'],
                      [`/undersokelser/${r.id}/rapport`, labels.report, 'report'],
                    ] as const
                  ).map(([href, label, kind]) => (
                    <Link
                      key={kind}
                      href={href}
                      title={label}
                      aria-label={`${label}: ${r.title}`}
                      className="touch-44 flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] border border-line text-mut no-underline"
                    >
                      <Icon kind={kind} />
                    </Link>
                  ))}
                  {menus[r.id]}
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : r.id)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? labels.less : labels.more}: ${r.title}`}
                    className="touch-44 ml-0.5 flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded-[9px] border border-line bg-transparent text-mut"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={{ transform: `rotate(${isOpen ? 180 : 0}deg)` }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </span>
              </div>

              {/* v6:2357 — the expanded row. Three panes in the drawing; the
                  middle one is «snitt av maks 5,0», which is a svar-derived
                  value and is NOT here: the only gated path to an average is
                  `results_summary`, and calling it per row would be one RPC per
                  visible survey. The detail panel (one survey at a time) is
                  where that number belongs, and it has it. */}
              {isOpen ? (
                <div className="grid gap-0 px-[22px] pb-5 pt-1 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
                  <div className="border-r border-line py-[14px] pr-5">
                    <div className="font-display text-[19px] font-semibold">
                      {r.target === null
                        ? labels.responsesOnly.replace('{n}', String(r.responses))
                        : labels.invited.replace('{n}', String(r.target))}
                    </div>
                    {r.pct === null ? null : (
                      <>
                        <div className="mt-3 flex items-baseline gap-[14px]">
                          <span>
                            <span className="block text-[11.5px] text-mut">{labels.answered}</span>
                            <span className="mt-0.5 block text-[17px] font-bold">{r.pct} %</span>
                            <span className="block text-[11.5px] text-mut">{r.responses}</span>
                          </span>
                          <span>
                            <span className="block text-[11.5px] text-mut">{labels.missing}</span>
                            <span className="mt-0.5 block text-[17px] font-bold">
                              {100 - r.pct} %
                            </span>
                            <span className="block text-[11.5px] text-mut">{r.missing}</span>
                          </span>
                        </div>
                        <div className="mt-3 flex gap-1 pr-5">
                          <span
                            className="block h-2 rounded-full"
                            style={{ width: `${r.pct}%`, background: STATUS_BAR[r.status] }}
                          />
                          <span className="block h-2 flex-1 rounded-full bg-sf2" />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="py-[14px] pl-5">
                    <div className="text-[11.5px] text-mut">{labels.questions}</div>
                    <div className="mt-1 text-[13.5px]">{r.questionCount}</div>
                    {r.ownerName ? (
                      <div className="mt-2.5 text-[12.5px] text-mut">
                        {r.ownerName}
                        {r.ownerEmail ? ` · ${r.ownerEmail}` : ''}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The three row icons, quoted from v6:2340-2348. */
function Icon({ kind }: { kind: 'build' | 'results' | 'report' }) {
  if (kind === 'build') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" />
      </svg>
    )
  }
  if (kind === 'results') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
        <path d="M5 19V11M12 19V5M19 19v-6" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  )
}
