'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * G6 — ONE bubble, whose CONTENT a screen may replace.
 *
 * ── WHAT THIS EXISTS TO PREVENT ───────────────────────────────────────────
 *
 * Measured before anything was changed, `/undersokelser` had TWO round buttons
 * doing one job: `TuvaHelper`'s (52px, `bg-sbg`, «?», labelled «Åpne Tuva») and
 * `TuvaPlacement`'s (54px, `bg-ac`, «T», labelled «Vis eller skjul Tuva»). Six
 * differences, two of them the ACCESSIBLE NAME — so a screen reader announced
 * two different controls for the same helper.
 *
 * The bundle has two buttons as well (v6:5942 and v6:2434, differing in
 * background, content, the unread dot and the anchor), and it never shows them
 * together because `tvShow` excludes `surveys`. **We show the helper
 * everywhere, so the bundle's arrangement stops being available and the choice
 * has to be made rather than inherited.** Tor: «One product, one Tuva, and a
 * screen should not have two bubbles for two reasons.»
 *
 * ── THE MECHANISM, AND WHY IT IS A NODE RATHER THAN DATA ──────────────────
 *
 * The bubble is mounted by the SHELL (`app/(app)/layout.tsx`) and the content
 * it must show on `/undersokelser` is computed by the PAGE — `analyse()` runs
 * server-side over data only that route fetches. A page cannot pass props up to
 * its layout, so the page publishes and the shell consumes.
 *
 * A NODE rather than the `Analyst` object, deliberately: `AnalystPanel` is an
 * async SERVER component holding the copy and F1's two headline keys. Passing
 * the object instead would mean a second, client-side renderer of the same
 * sentences — which is exactly how F3's row rate came to have four
 * implementations that agreed by luck.
 *
 * The node is registered in an effect and cleared on unmount, so leaving the
 * route restores the registry's own answer without the shell knowing anything
 * about routes.
 */

type TuvaSlotValue = {
  /** What the panel should render in place of the registry's answer, or null. */
  node: ReactNode | null
  publish: (node: ReactNode | null) => void
}

const Ctx = createContext<TuvaSlotValue>({ node: null, publish: () => {} })

export function TuvaSlotProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<ReactNode | null>(null)
  const publish = useCallback((next: ReactNode | null) => setNode(() => next), [])
  const value = useMemo(() => ({ node, publish }), [node, publish])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Read by the shell's helper. */
export function useTuvaSlot(): ReactNode | null {
  return useContext(Ctx).node
}

/**
 * Rendered by a PAGE. Renders nothing itself.
 *
 * The effect's dependency is the `children` element, whose identity is stable
 * across re-renders caused by the provider's own state — the RSC payload is not
 * re-created by a client-side state change — so publishing does not loop. The
 * ref is belt and braces: it refuses a publish of a node already published,
 * which makes the loop unrepresentable rather than merely unlikely.
 */
export function TuvaSlot({ children }: { children: ReactNode }) {
  const { publish } = useContext(Ctx)
  const last = useRef<ReactNode | null>(null)

  useEffect(() => {
    if (last.current === children) return
    last.current = children
    publish(children)
    return () => {
      last.current = null
      publish(null)
    }
  }, [children, publish])

  return null
}
