import Link from 'next/link'
import { Logo, Wordmark } from '@/components/Logo'

/**
 * The two public documents the splash's footer links to. No design exists for
 * them (docs/DEVIATIONS.md D83); they are set in the product's own type on the
 * splash's ground colour, at reading width, with nothing invented beyond a
 * heading, sections and a way back.
 */
export function LegalPage({
  title,
  updated,
  sections,
  back,
  draftNotice,
}: {
  title: string
  updated: string
  sections: { heading: string; paragraphs: string[] }[]
  back: string
  /** Rendered while the text is unreviewed (docs/LEGAL_DRAFTS.md). An empty
   *  string, set by the reviewed text's own commit, removes it. */
  draftNotice: string
}) {
  return (
    <main className="min-h-dvh" style={{ background: '#FCF6E9', color: '#191510' }}>
      <div className="mx-auto max-w-[760px] px-6 py-10 md:px-11">
        <Link href="/" className="touch-44 inline-flex items-center gap-[11px] no-underline">
          <Logo />
          <Wordmark />
        </Link>
        <h1 className="mt-10 text-pretty break-words font-display text-[34px] font-medium leading-[1.15]">{title}</h1>
        <p className="mt-2 text-[13px]" style={{ color: '#5F5849' }}>{updated}</p>
        {draftNotice ? (
          <p role="note" className="mt-4 rounded-[11px] px-[14px] py-[11px] text-[13px] font-semibold" style={{ background: '#FBD5C4' }}>
            {draftNotice}
          </p>
        ) : null}
        {sections.map((s) => (
          <section key={s.heading} className="mt-8">
            <h2 className="break-words text-[17px] font-semibold">{s.heading}</h2>
            {/* `break-words`: legal prose carries long compounds and an email
                address, and at 320px one unbreakable word is a horizontal
                scroll (RESPONSIVE.md rule 1). */}
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-2 break-words text-[14.5px] leading-[1.65]">{p}</p>
            ))}
          </section>
        ))}
        <p className="mt-12 text-[13px]">
          <Link href="/" className="touch-44 font-semibold text-ink">{back}</Link>
        </p>
      </div>
    </main>
  )
}
