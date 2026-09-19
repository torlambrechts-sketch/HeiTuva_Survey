/**
 * G2.6 — «Levering» (v8:1867, rows at v8:7855).
 *
 * THREE ROWS OF v8's SIX, AND THE SPLIT IS THE WHOLE DESIGN. The bundle's
 * `delivery` array is byte-identical in v6 and v8, and four of its six values
 * are invented:
 *
 *   Sendt      String(inv)                  REAL — survey_invitations.sent_at
 *   Åpnet      Math.round(inv * 0.82)       no open tracking exists at all
 *   Startet    Math.round(res * 1.15)       THERE IS NO PARTIAL RESPONSE
 *   Fullført   String(res)                  REAL — responded_at
 *   Bounce     the literal "2"              bounced_at has NO WRITER (D133)
 *   Reservert  the literal "1"              REAL — suppressions, since M:0060
 *
 * «Startet» is the one worth stating in the copy rather than merely omitting,
 * because it is absent BY DESIGN and always will be: `rpc.submit_response` is a
 * single transaction (invariant 2), so a response either exists or does not.
 * There is no partial answer to count, and a «Påbegynt» row could only ever be
 * a guess at one. The others are absent for a duller reason — this account has
 * no transactional webhooks, so no open or bounce event ever arrives.
 *
 * `mail_outbox` does not supply any of the three missing rows. It is a pgmq
 * QUEUE (`select pgmq.create('mail_outbox')`, M:0008) holding messages waiting
 * to be sent; it records nothing about what happened to them afterwards.
 *
 * AND «Sendt» MEANS ACCEPTED BY THE PROVIDER, NOT DELIVERED — CLAUDE.md is
 * explicit that `sent_at` is the provider's acceptance. The sub-label says so
 * rather than letting the number imply an inbox.
 */
export function DeliveryPanel({
  sent,
  done,
  suppressed,
  invited,
  labels,
}: {
  sent: number
  done: number
  suppressed: number
  invited: number
  labels: {
    title: string
    lead: string
    sent: string
    sentSub: string
    done: string
    doneSub: (pct: number) => string
    suppressed: string
    suppressedSub: string
    whyNoStarted: string
  }
}) {
  const pct = invited > 0 ? Math.round((done / invited) * 100) : 0
  const cells = [
    { key: 'sent', label: labels.sent, value: sent, sub: labels.sentSub },
    { key: 'done', label: labels.done, value: done, sub: labels.doneSub(pct) },
    { key: 'sup', label: labels.suppressed, value: suppressed, sub: labels.suppressedSub },
  ]

  return (
    <section className="mt-4 rounded-[20px] border border-line bg-sf">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-[22px] py-[18px]">
        <span className="font-display text-[21px] font-medium">{labels.title}</span>
        <span className="text-[12px] text-mut">{labels.lead}</span>
      </div>
      <div className="grid gap-3 px-[22px] py-5 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        {cells.map((c) => (
          <div key={c.key} className="rounded-[15px] border border-line bg-bg px-[17px] py-[15px]">
            <div className="text-[11px] uppercase tracking-[.09em] text-mut">{c.label}</div>
            <div className="mt-[7px] font-display text-[26px] font-semibold leading-none">
              {c.value}
            </div>
            <div className="mt-[5px] text-[12px] text-mut">{c.sub}</div>
          </div>
        ))}
      </div>
      {/* The three rows that do NOT ship, named. An omitted row reads as one
          nobody finished; a stated absence reads as a decision. */}
      <p className="rounded-b-[19px] border-t border-line bg-bg px-[22px] py-3.5 text-[12px] leading-relaxed text-mut">
        {labels.whyNoStarted}
      </p>
    </section>
  )
}
