'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { signOut } from '@/app/(auth)/logg-inn/actions'

type Labels = { menu: string; profile: string; administration: string; privacy: string }

export function UserMenu({
  name,
  initials,
  role,
  labels,
  langSlot,
  wideSlot,
  workspaceSlot,
  workspaceLabel,
  workspaceHint,
}: {
  name: string
  initials: string
  role: string
  labels: Labels
  /* W1 · V4:192-205 — the language picker and the width toggle MOVE OUT of the
     header row and into this dropdown, on one line under the name. The header
     went `flex-wrap:nowrap` and gained the Arbeidsflate chip; two controls had
     to leave, and v4 chose these two. Passed as slots rather than rebuilt here
     so each keeps its own component and its own tests. */
  langSlot: React.ReactNode
  wideSlot: React.ReactNode
  /** N3 — the Arbeidsflate chip, which v8 moved out of the header row and into
   *  this menu. Null when the registry has not been seeded: the section is
   *  ABSENT rather than drawn empty, because a labelled «Arbeidsflate» heading
   *  over nothing is a claim that there is a choice to make. */
  workspaceSlot?: React.ReactNode
  workspaceLabel?: string
  workspaceHint?: string
}) {
  const t = useTranslations('common')
  const tRole = useTranslations('role')
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  // Close on outside click and on Escape — the design shows no explicit close
  // affordance, so these are the expected dismissals.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The rows are ~39px tall and sat flush against each other, so their 44px
  // touch areas overlapped by 840px² at 320px — a thumb aimed at "Min profil"
  // could land on "Administrasjon". The row keeps its exact painted size; only
  // the spacing between rows grows, and only below md.
  const item =
    'touch-44 mb-[6px] block w-full cursor-pointer rounded-[10px] border-none bg-transparent px-3 py-2.5 text-left text-[13.5px] text-ink no-underline last:mb-0 md:mb-0'

  return (
    <div ref={wrap}>
      {/* v2 (HeiTuva.dc.html:195): the button loses its visible name and
          becomes a 38px avatar. The name does not disappear — it moves into
          `aria-label` AND `title`, and the dropdown below already carries it
          with the role line under it (:199-200).

          THE ACCESSIBLE NAME IS THE POINT, and it is the same lesson Q31's
          language chips carry: a control whose visible label is two initials
          needs its real name in an attribute, or it announces as "T B". So
          `userMenu` is parameterised on the name rather than left as a bare
          "Brukermeny" — the bundle writes «Brukermeny for {{ userName }}» and
          that is what a screen reader should hear. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={labels.menu}
        title={name}
        aria-expanded={open}
        aria-haspopup="menu"
        className="touch-44 inline-flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full border border-line bg-ac3 p-0 text-[12.5px] font-bold text-ink"
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[52px] z-[60] w-[242px] rounded-[14px] border border-line bg-sf p-2"
          style={{ boxShadow: '0 18px 44px rgba(25,21,16,.16)' }}
        >
          <div className="px-3 pb-3 pt-2.5">
            <div className="text-[14px] font-semibold">{name}</div>
            <div className="mt-0.5 text-[12.5px] text-mut">{tRole(role)}</div>
          </div>

          {/* N3 · v8:189-204 — THE ARBEIDSFLATE SECTION, and it is a MOVE rather
              than an addition. v7 drew the chip in the header row between «?»
              and the avatar (v7:182); v8 draws the identical chip here
              (v8:192), under an 11px uppercase label and over a hint line, and
              the header row is left with two 34px circles.

              Measured rather than inferred: `docs/fidelity/bundle-geometry-diff.json`
              reports ten `_shell` properties CHANGED between v7 and v8 and
              `v7_only_values` EMPTY in every one of them — every delta is a
              count going up. A multiset of literal values cannot see a move,
              so ten «changes» were one relocation plus what it gained. The
              chip's own declarations (`height:34px`, `padding:0 11px 0 10px`,
              `border-radius:999px`, `12.5px/600`) are unchanged and
              `WorkspaceChip` is untouched.

              The four values here are v8:189-204's own:
                section  padding:8px 12px 12px · border-top:1px solid var(--line)
                label    font-size:11px · uppercase · letter-spacing:.09em · var(--mut)
                row      display:flex · align-items:center · gap:8px · margin-top:7px
                hint     font-size:11.5px · var(--mut) · margin-top:7px · line-height:1.45 */}
          {workspaceSlot ? (
            <div className="border-t border-line px-3 pb-3 pt-2">
              <div className="text-[11px] uppercase tracking-[.09em] text-mut">
                {workspaceLabel}
              </div>
              <div className="mt-[7px] flex items-center gap-2">{workspaceSlot}</div>
              {/* The hint is the registry's own `workspaces.hint`, which has
                  existed since W0 and was rendered nowhere in the shell. v8
                  gives it a home. Absent rather than blank when the row has
                  none — this is a sentence about the workspace, not a
                  placeholder. */}
              {workspaceHint ? (
                <div className="mt-[7px] text-[11.5px] leading-[1.45] text-mut">
                  {workspaceHint}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* V4:196 — `justify-between`, `gap:10px`, `padding:8px 12px 10px`.
              Two controls that used to sit in the header, now one row here.
              `flex-wrap` and a `gap-y` are ours: below 1280px no bundle draws
              this menu, and two 32px controls side by side in a 242px panel is
              the narrow-row case docs/RESPONSIVE.md decides by whether they
              fit — they do at 242px, so the row stays a row and the wrap is
              the safety net rather than the layout. */}
          <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-3 px-3 pb-2.5 pt-2">
            {langSlot}
            {wideSlot}
          </div>

          <Link href="/profil" className={item} role="menuitem" onClick={() => setOpen(false)}>
            {labels.profile}
          </Link>
          <Link
            href="/administrasjon"
            className={item}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            {labels.administration}
          </Link>
          <Link
            href="/administrasjon/personvern"
            className={item}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            {labels.privacy}
          </Link>

          <div className="my-1.5 h-px bg-line" />

          <form action={signOut}>
            <button type="submit" role="menuitem" className={`${item} font-semibold`}>
              {t('logout')}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
