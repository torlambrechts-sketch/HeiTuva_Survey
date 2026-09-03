'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Search box and sort select (HeiTuva.dc.html:750-757).
 *
 * Both write to the URL so the server does the filtering and a filtered view is
 * shareable. Search is debounced; the sort applies immediately, because a
 * select has no intermediate states to wait for.
 */
export function SurveySearch({
  query,
  sort,
  placeholder,
  sortLabel,
  sortOptions,
}: {
  query: string
  sort: string
  placeholder: string
  sortLabel: string
  sortOptions: { value: string; label: string }[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [value, setValue] = useState(query)

  useEffect(() => {
    if (value === query) return
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (value) next.set('sok', value)
      else next.delete('sok')
      const qs = next.toString()
      router.replace(qs ? `/undersokelser?${qs}` : '/undersokelser', { scroll: false })
    }, 250)
    return () => clearTimeout(id)
  }, [value, query, params, router])

  function onSort(v: string) {
    const next = new URLSearchParams(params.toString())
    if (v && v !== 'nyeste') next.set('sorter', v)
    else next.delete('sorter')
    const qs = next.toString()
    router.replace(qs ? `/undersokelser?${qs}` : '/undersokelser', { scroll: false })
  }

  return (
    <span className="flex flex-wrap items-center gap-[9px]">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        // 220px is the design's width; below md it takes the row so the
        // control is never clipped (RESPONSIVE.md global rule 1).
        className="touch-44-field w-full rounded-[10px] border border-line bg-sf px-[13px] py-[10px] text-[13px] text-ink outline-none md:w-[220px]"
      />
      <select
        value={sort}
        onChange={(e) => onSort(e.target.value)}
        aria-label={sortLabel}
        className="touch-44-field rounded-[10px] border border-line bg-sf px-3 py-[10px] text-[13px] text-ink outline-none"
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )
}
