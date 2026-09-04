'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createReport, createReportShare, deleteReport } from './editor-actions'

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

/**
 * "Del" on a saved report row — HeiTuva.dc.html:1081.
 *
 * The prototype's button toggles a `sharedWith` marker on local state; here it
 * mints a real share link at the report's own `share_scope` and copies it. The
 * label then reads "Delt ✓" as the design's does, but it means something: a
 * `report_shares` row exists and `compose_report` will honour it.
 *
 * The URL is shown as well as copied. `navigator.clipboard` is unavailable over
 * plain HTTP and inside some embedded browsers, and a button that silently does
 * nothing is the worst of the three outcomes — so the link is rendered whether
 * or not the copy succeeded.
 */
export function ShareReportButton({
  reportId,
  scope,
  label,
  sharedLabel,
  failedLabel,
  className,
}: {
  reportId: string
  scope: 'ledelse' | 'ledere_eget_team' | 'alle_ansatte'
  label: string
  sharedLabel: string
  failedLabel: string
  className: string
}) {
  const [pending, startTransition] = useTransition()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setFailed(false)
            const result = await createReportShare({ reportId, scope })
            if (!result.ok) {
              setFailed(true)
              return
            }
            const absolute = new URL(result.url, window.location.origin).toString()
            setUrl(absolute)
            try {
              await navigator.clipboard.writeText(absolute)
            } catch {
              // Rendered below regardless; see the note above.
            }
          })
        }
        className={className}
      >
        {url ? sharedLabel : label}
      </button>
      {failed ? (
        <span role="alert" className="text-[12px] font-semibold text-ink">
          {failedLabel}
        </span>
      ) : null}
      {url ? (
        <input
          readOnly
          value={url}
          aria-label={sharedLabel}
          onFocus={(e) => e.currentTarget.select()}
          className="touch-44-field min-w-0 flex-1 rounded-[9px] border border-line bg-bg px-3 py-2 font-mono text-[11.5px] text-mut outline-none"
        />
      ) : null}
    </>
  )
}
