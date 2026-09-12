import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

/**
 * The footer — v5's shell, on every signed-in page (V5:5145-5179).
 *
 * THE MOST-READ COPY IN THE PRODUCT, and therefore the place where a false claim
 * costs the most. Four of the drawing's assertions do not ship, each for a
 * measured reason rather than a stylistic one (V5-1, D164):
 *
 *   1. «Data lagres i Norge og EØS» -> «Data lagres i EØS». NOTHING is in
 *      Norway: Supabase is eu-central-1 (Frankfurt), Vercel answers from fra1,
 *      Brevo is French. Writing a country we have no infrastructure in onto
 *      every page is the never-fabricate rule applied to a residency promise —
 *      the one claim a Norwegian buyer is most likely to check.
 *   2. «DPIA gjennomført» is GONE. The DPIA has not been started.
 *   3. «Alle tjenester kjører normalt» is GONE. It was a string literal with no
 *      health source; a status indicator that cannot report trouble is worse
 *      than none, because it is believed.
 *   4. «Versjon 2.4 · september 2026» is GONE. There is no version anywhere:
 *      zero version columns, `package.json` says 0.1.0, zero «Versjon» in
 *      shipped copy. It is the example the never-fabricate rule actually gives.
 *
 * And the legal line changed SUBJECT. The drawing says «{company} er
 * behandlingsansvarlig» — a claim about the CUSTOMER'S legal role, and
 * `organizations` has no column holding it (name, orgnr, address, contact_name,
 * contact_email, dpo, …). Tor's rule: either the column exists or the sentence
 * does not. A column would be the wrong answer — its value is the same for every
 * customer, so it is a constant wearing a column's clothes. So the sentence
 * asserts what we DO hold: **HeiTuva is the processor**, which is a property of
 * the product and true by construction. The full role statement lives in the
 * databehandleravtale, which is where a legal statement belongs and which the
 * badge links to.
 */
export async function AppFooter() {
  const t = await getTranslations('footer')

  const columns = [
    {
      title: t('colWork'),
      links: [
        { label: t('linkSurveys'), href: '/undersokelser' },
        { label: t('linkTasks'), href: '/oppgaver' },
        { label: t('linkInsight'), href: '/dashboard' },
        { label: t('linkLibrary'), href: '/bibliotek' },
      ],
    },
    {
      title: t('colAccount'),
      links: [
        { label: t('linkProfile'), href: '/profil' },
        { label: t('linkAdmin'), href: '/administrasjon' },
        { label: t('linkUsers'), href: '/administrasjon/brukere' },
        { label: t('linkIntegrations'), href: '/administrasjon/integrasjoner' },
      ],
    },
    {
      title: t('colHelp'),
      links: [
        { label: t('linkHelp'), href: '/hjelp' },
        { label: t('linkPrivacy'), href: '/administrasjon/personvern' },
        { label: t('linkAnonymity'), href: '/administrasjon/personvern' },
        { label: t('linkDpa'), href: '/databehandleravtale' },
      ],
    },
  ]

  return (
    /* `frame` rather than re-stating the widths: the drawing's
       `width:calc(100% - 72px); max-width:{{ frameMax }}` IS this class, and
       reusing it means the footer tracks Q32's wide toggle for free instead of
       drifting from the screens above it the first time that cap moves. */
    <footer className="frame mb-5 mt-14 rounded-[16px] border border-line bg-sf px-7 pb-5 pt-[26px]">
      <div className="grid gap-[26px] md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
        <div className="min-w-0">
          <div className="flex items-center gap-[9px]">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] bg-ac">
              <span className="block h-[7px] w-[7px] rounded-full bg-ink" />
            </span>
            <span className="font-display text-[17px] font-semibold">HeiTuva</span>
          </div>
          <p className="mt-2.5 max-w-[320px] text-[12.5px] leading-[1.6] text-mut">{t('pitch')}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {/* TWO badges, not three. Each is a claim and each is true:
                «Data i EØS» — Frankfurt, fra1 and France are all EØS; and
                «Databehandleravtale» claims ONLY that the document exists and is
                reachable, which it is (/databehandleravtela is a real public
                route). It does NOT claim the text has been reviewed — it has
                not, and the page carries its own draft banner saying so. */}
            {[t('badgeEea'), t('badgeDpa')].map((label) => (
              <span
                key={label}
                className="whitespace-nowrap rounded-full border border-line bg-bg px-2.5 py-1 text-[11px] text-mut"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
        {columns.map((col) => (
          <div key={col.title} className="min-w-0">
            <h2 className="text-[11px] uppercase tracking-[.1em] text-mut">{col.title}</h2>
            {/* RESPONSIVE.md global rule 2, applied by its own prescription:
                «where two controls sit close enough that their 44px regions
                would collide, increase the SPACING between them at mobile —
                spacing is layout and may change; the control is a token and may
                not.» The drawing's gap is 7px and a 13px link is ~19px painted,
                so a 44px area overflows (44-19)/2 ~ 12px each side and adjacent
                links need ~25px between painted edges. 28px at mobile, the
                drawn 7px from md up. `verify:responsive` found this at 320px
                with two blockers before the fix — the same arithmetic
                globals.css already writes out for 30px chips. */}
            <div className="mt-[11px] flex flex-col gap-y-7 md:gap-y-[7px]">
              {col.links.map((l) => (
                <Link
                  key={l.label + l.href}
                  href={l.href}
                  className="touch-44 cursor-pointer text-left text-[13px] text-ink no-underline hover:text-[#8A6A12]"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* The drawing's bottom row is `space-between` with a status and a version
          on the right. Both were literals and neither ships, so the row carries
          one child and reads left-aligned. That is the honest consequence of
          items 3 and 4 rather than a layout choice, and it is logged (D164). */}
      <div className="mt-6 flex flex-wrap items-center gap-3.5 border-t border-line pt-4 text-[12px] text-mut">
        <span>{t('legal', { year: new Date().getFullYear() })}</span>
      </div>
    </footer>
  )
}
