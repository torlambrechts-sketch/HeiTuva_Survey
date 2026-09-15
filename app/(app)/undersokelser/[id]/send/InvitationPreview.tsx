import { getTranslations } from 'next-intl/server'
import { invitationMessage } from '@/lib/mail'

/**
 * F5-4 — «Invitasjon» (v6:1795-1849): what the recipient actually receives.
 *
 * ── THE PREVIEW *IS* THE TEMPLATE, AND THAT IS THE WHOLE DESIGN ───────────
 *
 * It calls `invitationMessage()` — the SAME function the mail worker calls at
 * `supabase/functions/mail-worker/index.ts:175` — and renders what comes back.
 * Nothing is re-typed and nothing is stored.
 *
 * The alternative was a `surveys.invitation_subject` column, and it is the
 * wrong shape for a reason this project has a name for: two writers for one
 * fact. The template would change in code and the preview would keep showing
 * what somebody saved, and the preview would be a lie exactly when it mattered
 * — after an edit. Measured: `surveys` has no subject, sender, purpose or body
 * column, and F5 does not add one.
 *
 * ── THE EMBEDDED QUESTION IS NOT BUILT, AND IT IS NOT A LAYOUT GAP ────────
 *
 * v6:1820-1844 draws question 1 inside the email with its options, and a card
 * headed «Derfor ligger spørsmålet i e-posten» explaining the rule («ett valg,
 * høyst fem alternativer, ikke sensitivt»). **Our invitation embeds no
 * question at all** — `lib/mail/copy.ts:44-72` is a greeting, one sentence,
 * the link, the anonymity promise, where to ask, and the do-not-forward line.
 *
 * So drawing that card would explain a rule for a feature that does not exist,
 * which is a false claim about the product rather than a missing panel. Said on
 * the screen, in the pattern Live and Målgruppe use.
 *
 * ── THE LINK IS A PLACEHOLDER, LABELLED, AND THE ORIGIN IS NEVER INVENTED ─
 *
 * The real link is `${NEXT_PUBLIC_APP_URL}/s/${token}` (worker:172). A preview
 * has no recipient, so it has no token, and inventing one would put a string
 * that looks like a working personal link on screen. The placeholder is
 * obviously not a token and the caption says the link is unique per person.
 *
 * **And where the origin is not configured the preview SAYS SO rather than
 * guessing one.** That is the `heituva.no` lesson exactly: a host is a claim,
 * not a specification, and a plausible invented origin is the easiest false
 * thing to ship because it reads as a fact.
 */
export async function InvitationPreview({
  orgName,
  surveyTitle,
  anonymous,
}: {
  orgName: string
  surveyTitle: string
  anonymous: boolean
}) {
  const t = await getTranslations('surveys')
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? null

  const { subject, text } = invitationMessage({
    orgName,
    surveyTitle,
    // No recipient, so no name: the template's own «Hei!» branch is what an
    // imported row without a name really gets, which is the honest default to
    // show.
    name: null,
    lang: 'no',
    url: origin ? `${origin}/s/${t('invTokenPlaceholder')}` : t('invNoOrigin'),
    anonymous,
  })

  return (
    <section
      aria-label={t('invTitle')}
      className="mt-[18px] rounded-2xl border border-line bg-sf px-[22px] py-[18px]"
    >
      <h2 className="font-display text-[21px] font-medium">{t('invTitle')}</h2>
      <p className="mt-1 text-[13px] text-mut">{t('invLead')}</p>

      <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
        <dt className="text-mut">{t('invSubject')}</dt>
        <dd className="m-0 min-w-0 font-semibold">
          {subject}{' '}
          {/* v6:1805 draws the subject's length beside it, and it is a real
              property of a real string rather than an invented score. */}
          <span className="font-normal text-mut">{t('invSubjectLen', { n: subject.length })}</span>
        </dd>
      </dl>

      <pre className="mt-3.5 overflow-x-auto whitespace-pre-wrap rounded-xl border border-line bg-bg px-4 py-3.5 font-body text-[13px] leading-[1.6] text-ink">
        {text}
      </pre>

      <p className="mt-2.5 text-[12px] text-mut">
        {origin ? t('invLinkNote') : t('invOriginMissing')}
      </p>

      {/* The panel the drawing has and this one must not. */}
      <p className="mt-3.5 border-t border-line pt-3.5 text-[12.5px] leading-[1.55] text-mut">
        {t('invNoEmbeddedQuestion')}
      </p>
    </section>
  )
}
