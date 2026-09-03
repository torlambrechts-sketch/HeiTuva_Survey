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
}: {
  name: string
  initials: string
  role: string
  labels: Labels
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={labels.menu}
        aria-expanded={open}
        aria-haspopup="menu"
        className="touch-44 flex cursor-pointer items-center gap-[9px] rounded-full border border-line bg-transparent py-1.5 pl-1.5 pr-3 text-[12.5px] font-semibold text-ink"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ac3 text-[11.5px] font-bold">
          {initials}
        </span>
        {name}
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
