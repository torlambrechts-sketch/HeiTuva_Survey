'use client'

import { useState } from 'react'

/**
 * "Del med teamet" — HeiTuva.dc.html:2283.
 *
 * The prototype's handler only flips a "copied" flag; the honest version of
 * that is putting the theme summary on the clipboard, which is what the panel's
 * own copy promises ("del sammendraget med teamet"). Nothing about a respondent
 * is in the string: it is the theme labels and their counts, both of which
 * already survived the contributor gate.
 */
export function ShareThemes({
  label,
  copiedLabel,
  summary,
}: {
  label: string
  copiedLabel: string
  summary: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // A denied clipboard permission is not an error worth surfacing here.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={!summary}
      className="touch-44 mt-4 cursor-pointer rounded-[10px] border border-line bg-transparent px-[18px] py-[11px] text-[13px] font-semibold disabled:opacity-50"
    >
      {copied ? copiedLabel : label}
    </button>
  )
}
