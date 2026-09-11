'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/**
 * The bank's confirmation pill — V2:2960-2962, cleared at V2:4432.
 *
 * ── WHY THIS IS NOT STATE ON THE BUTTON ────────────────────────────────────
 *
 * It used to be. `BankRow` set `state = 'added'`, the button read «Lagt til ✓»
 * and then stayed disabled for the life of the page. Three consequences, and
 * only the first is cosmetic:
 *
 *  - the confirmation did not name the draft, so «Lagt til ✓» never said WHERE;
 *  - after three additions three buttons were spent and the header said nothing,
 *    which is the reverse of what the bundle does;
 *  - **a question could be added exactly once.** Nothing in the schema asks for
 *    that — `survey_questions` takes as many copies as an editor wants, and
 *    wanting the same scale question about two teams is ordinary. It was a
 *    side effect of using the button as a status light.
 *
 * The pill is shared, so it is context rather than a prop drilled through every
 * row. `2200` is the bundle's own number (V2:4432) and is written once here.
 */
const AUTO_CLEAR_MS = 2200

type Ctx = { note: string | null; announce: (text: string) => void }
const BankNoteContext = createContext<Ctx | null>(null)

export function BankNoteProvider({ children }: { children: React.ReactNode }) {
  const [note, setNote] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const announce = useCallback((text: string) => {
    setNote(text)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setNote(null), AUTO_CLEAR_MS)
  }, [])

  /* A timer that outlives the tree calls setState on an unmounted component.
     Cheap to get right, invisible when it is wrong. */
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return <BankNoteContext.Provider value={{ note, announce }}>{children}</BankNoteContext.Provider>
}

export function useBankNote(): Ctx {
  const ctx = useContext(BankNoteContext)
  if (!ctx) throw new Error('useBankNote outside BankNoteProvider')
  return ctx
}

export function BankNotePill() {
  const { note } = useBankNote()
  if (!note) return null
  return (
    <span
      /* Announced, not just drawn: the pill is the only feedback an addition
         gets now, and it disappears after 2200ms. A screen reader that never
         hears it is worse off than before this change. */
      role="status"
      aria-live="polite"
      className="flex-none whitespace-nowrap rounded-full px-[13px] py-[7px] text-[12px] font-semibold"
      style={{ background: 'var(--ac2)' }}
    >
      {note}
    </span>
  )
}
