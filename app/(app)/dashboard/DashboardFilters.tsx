'use client'

import { useRouter } from 'next/navigation'

/**
 * The period and group selects — HeiTuva.dc.html:819-830.
 *
 * Both are `<select>` in the design, so both are `<select>` here; they navigate
 * rather than hold state, which keeps the whole dashboard a server render and
 * means a shared URL reproduces exactly what the sender was looking at.
 */
export function DashboardFilters({
  period,
  group,
  groups,
  selected,
  allCount,
  labels,
}: {
  period: 'q' | 'h' | 'y'
  group: string | null
  groups: { id: string; name: string }[]
  selected: string[]
  allCount: number
  labels: { period: string; group: string; allGroups: string; q: string; h: string; y: string }
}) {
  const router = useRouter()

  function go(patch: { periode?: string; gruppe?: string }) {
    const params = new URLSearchParams()
    const nextPeriod = patch.periode ?? period
    const nextGroup = patch.gruppe !== undefined ? patch.gruppe : (group ?? '')
    if (nextPeriod && nextPeriod !== 'y') params.set('periode', nextPeriod)
    if (nextGroup) params.set('gruppe', nextGroup)
    if (selected.length && selected.length !== allCount) {
      for (const id of selected) params.append('u', id)
    }
    const q = params.toString()
    router.push(q ? `/dashboard?${q}` : '/dashboard')
  }

  const field =
    'touch-44-field rounded-[10px] border border-line bg-sf px-3 py-[10px] text-[13px] text-ink outline-none'

  return (
    <div className="flex flex-wrap items-center gap-[10px]">
      <select
        aria-label={labels.period}
        value={period}
        onChange={(e) => go({ periode: e.target.value })}
        className={field}
      >
        <option value="q">{labels.q}</option>
        <option value="h">{labels.h}</option>
        <option value="y">{labels.y}</option>
      </select>
      <select
        aria-label={labels.group}
        value={group ?? ''}
        onChange={(e) => go({ gruppe: e.target.value })}
        className={field}
      >
        <option value="">{labels.allGroups}</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  )
}
