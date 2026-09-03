'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A full-screen overlay that is genuinely modal.
 *
 * Two problems it solves, both found by the responsive sweep once it started
 * measuring click-reachable states:
 *
 * 1. **Focus escaped.** The wizard and the Builder's sheet are routes and
 *    components rendered *inside* the app shell, so the header and the page
 *    behind them stayed in the tab order. An `aria-modal` dialog whose
 *    background is still reachable with Tab is not modal.
 * 2. **Duplicate controls.** The Builder's sheet repeats the three tab labels
 *    that are also on the pinned button row beneath it, so "Vis" existed twice
 *    at the same moment — reported as `"Vis" / "Vis"` overlapping by 4320px².
 *
 * The overlay is portalled to `document.body` so it is not inside the subtree
 * it inerts, and everything else under `body` is marked `inert` while it is
 * open: not focusable, not hit-testable, not exposed to assistive tech.
 *
 * `inert` is restored rather than blanket-cleared on unmount, so two nested
 * overlays cannot leave the shell permanently disabled.
 *
 * It adds no element of its own: the caller keeps `role="dialog"`,
 * `aria-modal` and the label on its own positioned element. A wrapper here
 * would be a second dialog node with no box, which reads as hidden to
 * anything measuring visibility.
 */
export function ModalLayer({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const node = document.createElement('div')
    node.setAttribute('data-modal-layer', '')
    document.body.appendChild(node)
    setHost(node)

    const inerted: HTMLElement[] = []
    for (const sibling of Array.from(document.body.children)) {
      if (sibling === node) continue
      if (!(sibling instanceof HTMLElement)) continue
      if (sibling.hasAttribute('inert')) continue
      sibling.setAttribute('inert', '')
      inerted.push(sibling)
    }

    return () => {
      for (const el of inerted) el.removeAttribute('inert')
      node.remove()
    }
  }, [])

  if (!host) return null
  return createPortal(children, host)
}
