'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

/** The bank search box. Debounced into the URL so the filtered list is
 *  shareable and the server does the filtering. */
export function BankSearch({ placeholder, initial }: { placeholder: string; initial: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(initial)

  useEffect(() => {
    if (value === initial) return
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (value) next.set('sok', value)
      else next.delete('sok')
      router.replace(`/bibliotek?${next.toString()}`, { scroll: false })
    }, 250)
    return () => clearTimeout(id)
  }, [value, initial, params, router])

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full flex-1 rounded-[10px] border border-line bg-bg px-[15px] py-3 text-[13.5px] text-ink outline-none"
    />
  )
}
