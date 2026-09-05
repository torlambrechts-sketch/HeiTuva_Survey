'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addLoopAction } from './actions'

/**
 * "Legg til tiltak" — HeiTuva.dc.html:295.
 *
 * The prototype's handler inserts a row reading "Nytt tiltak — skriv hva dere
 * gjorde", i.e. a placeholder standing in for text nobody has written. That
 * would be a fabricated entry in a list whose whole point is that it records
 * something real the organisation did, so the button opens an input instead and
 * the row is created when there is something to put in it.
 */
export function LoopActionForm({ label }: { label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border border-line bg-transparent px-4 py-[9px] text-[12.5px] font-semibold text-ink"
      >
        {label}
      </button>
    )
  }

  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const value = text.trim()
        if (!value) return
        startTransition(async () => {
          const result = await addLoopAction({ text: value })
          if (result.ok) {
            setText('')
            setOpen(false)
            router.refresh()
          }
        })
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={label}
        autoFocus
        maxLength={280}
        className="touch-44-field min-w-0 flex-1 rounded-[10px] border border-line bg-bg px-3 py-[9px] text-[13px] text-ink outline-none"
      />
      <button
        type="submit"
        disabled={pending || text.trim().length === 0}
        className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-4 py-[9px] text-[12.5px] font-semibold text-acf disabled:cursor-not-allowed disabled:opacity-40"
      >
        {label}
      </button>
    </form>
  )
}
