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
    // RESPONSIVE.md rule 1: a select's intrinsic width comes from its longest
    // option, so at 320px this row was 26px wider than the viewport. The label
    // wraps above the control and the control fills the row — the same two
    // elements in the same order, which is the reflow the spec allows, not a
    // substituted control.
    <label className="flex max-w-full flex-wrap items-center gap-[9px] text-[12.5px] text-mut">
      {label}
      <select
        value={current}
        onChange={(e) => router.push(`/undersokelser/${e.target.value}/resultater`)}
        className="touch-44-field w-full min-w-0 rounded-[10px] border border-line bg-sf px-[13px] py-[10px] text-[13px] text-ink outline-none md:w-auto md:max-w-[300px]"
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
