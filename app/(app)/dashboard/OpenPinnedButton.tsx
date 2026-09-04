'use client'

import { useTransition } from 'react'
import { openPinnedReport } from './actions'

/**
 * "Åpne rapport (n)" — HeiTuva.dc.html:831, 3054-3056.
 *
 * The count comes from the stored pins. The action re-reads them server-side
 * rather than trusting the number in this button, so what lands in the report
 * is what the database holds.
 */
export function OpenPinnedButton({
  count,
  label,
  title,
}: {
  count: number
  label: string
  title: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await openPinnedReport(title)))}
      className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] border-none bg-ac px-[18px] py-[10px] text-[13px] font-semibold text-acf"
    >
      {count > 0 ? `${label} (${count})` : label}
    </button>
  )
}
