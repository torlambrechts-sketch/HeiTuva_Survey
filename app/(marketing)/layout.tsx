import type { ReactNode } from 'react'

/**
 * The public shell — deliberately not `(app)`'s.
 *
 * `(app)/layout.tsx` calls `requireViewer()` and paints the signed-in header;
 * a visitor who has never heard of HeiTuva has neither. This layout adds
 * nothing at all: the splash is one full-bleed page and supplies its own
 * header and footer, exactly as the design draws it.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return children
}
