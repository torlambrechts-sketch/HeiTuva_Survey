'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

/**
 * "Bytt undersøkelse" — HeiTuva.dc.html:2143.
 *
 * A plain select that navigates. The design's own control is a `<select>`, so
 * this is the same control rather than a substitute; it is a client component
 * only because a select needs an onChange.
 */
export function SurveyPicker({
  label,
  current,
  surveys,
}: {
  label: string
  current: string
  surveys: { id: string; title: string; status: string }[]
}) {
  const router = useRouter()
  const tNav = useTranslations('surveyNav')

  const statusLabel = (status: string) =>
    tNav(
      status === 'aktiv' ? 'statusAktiv' : status === 'lukket' ? 'statusLukket' : 'statusUtkast',
    )

  return (
    <label className="flex items-center gap-[9px] text-[12.5px] text-mut">
      {label}
      <select
        value={current}
        onChange={(e) => router.push(`/undersokelser/${e.target.value}/resultater`)}
        className="touch-44-field max-w-[300px] rounded-[10px] border border-line bg-sf px-[13px] py-[10px] text-[13px] text-ink outline-none"
      >
        {surveys.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title} · {statusLabel(s.status)}
          </option>
        ))}
      </select>
    </label>
  )
}
