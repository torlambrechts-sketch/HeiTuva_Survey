'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createReport, deleteReport } from './editor-actions'

/**
 * The Mine rapporter row controls and the two ways into a new report —
 * HeiTuva.dc.html:1066-1085 ("Ny rapport", Del / PDF / Åpne / ×) and 1589-1648
 * ("Bruk mal" on a standard template).
 *
 * PDF is a link rather than a button because the export is a route: a GET the
 * browser can follow, resume and print, not a mutation.
 */
export function NewReportButton({
  label,
  title,
  baseTemplate,
  sections,
  className,
  disabled,
  surveys,
  role,
}: {
  label: string
  title: string
  baseTemplate: string | null
  sections: string[]
  className: string
  disabled?: boolean
  surveys?: string[]
  role?: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(() => {
          // createReport redirects to the new report's editor on success.
          void createReport({ title, baseTemplate, sections, surveys })
        })
      }
      className={className}
      role={role}
    >
      {label}
    </button>
  )
}

export function DeleteReportButton({
  reportId,
  label,
  className,
  disabled,
}: {
  reportId: string
  label: string
  className: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={disabled || pending}
      aria-label={label}
      title={label}
      onClick={() =>
        startTransition(async () => {
          const result = await deleteReport(reportId)
          if (result.ok) router.refresh()
        })
      }
      className={className}
    >
      ×
    </button>
  )
}
