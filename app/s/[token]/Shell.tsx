/**
 * The respondent surface's frame.
 *
 * The design draws this screen inside a phone (HeiTuva.dc.html:1940) because
 * the prototype shows it on a desktop page. The real thing IS the phone, so the
 * frame is not recreated — what carries over is the column it defines: a
 * max-width the design sets at 420px, on the page ground, with the app shell
 * (nav, user menu, "Ny undersøkelse") deliberately absent. A respondent is not
 * a user of this product and must not be shown its chrome.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="animate-enter mx-auto w-full max-w-[420px] px-4 pb-16 pt-6">{children}</main>
  )
}
