'use client'

import type { MethodNote } from '@/lib/questions/method'

/**
 * V6-3 — «Metodikk», the advisory panel (v6:1049 in the Builder, v6:1413 on the
 * survey detail).
 *
 * ── IT ADVISES. IT DOES NOT BLOCK. (Q178) ──────────────────────────────────
 *
 * v6 draws five of its rules as «Blokkert» and gates publishing on them. We do
 * not build that: there is no blocking severity in `method_rules` (the CHECK
 * makes one unrepresentable), no `canPublish` in the evaluator, and nothing
 * here that a Send screen could read as a bar. Tor: «the person sending sees
 * what is questionable and decides.»
 *
 * So this panel has no call to action beyond naming the question. It does not
 * disable anything, it does not offer to «fix» a question on the author's
 * behalf, and an empty list is a sentence rather than a green tick — a check
 * that congratulates you is a check that is claiming more than it measured.
 *
 * ── IT IS IN THE BUILDER FIRST, DELIBERATELY ───────────────────────────────
 *
 * The bundle draws this twice. Advice arrives cheapest next to the thing it is
 * about, and the Builder is where a question is written — so the survey
 * detail's copy of it is a later phase's decision, not an omission here.
 */
export function MethodPanel({
  notes,
  questionTexts,
  labels,
}: {
  notes: MethodNote[]
  /** Question text by 0-based position, so a note can name what it is about. */
  questionTexts: string[]
  labels: {
    title: string
    lead: string
    empty: string
    /** T7 · v8:1203 — the empty state is TWO lines in the drawing: a heading
     *  «Ingen merknader» and a body saying WHY it is empty. Ours carried only
     *  the first, so the state said «nothing to report» without saying what
     *  had been checked. */
    emptyBody: string
    warning: string
    suggestion: string
    question: string
  }
}) {
  const warnings = notes.filter((n) => n.severity === 'advarsel')
  const suggestions = notes.filter((n) => n.severity === 'forslag')
  const ordered = [...warnings, ...suggestions]

  return (
    <section className="mt-5 rounded-2xl border border-line bg-sf px-[22px] py-[18px]">
      <h2 className="font-display text-lg font-medium">{labels.title}</h2>
      <p className="mt-1 text-[13px] text-mut">{labels.lead}</p>

      {ordered.length === 0 ? (
        <div className="mt-4 rounded-[13px] border border-dashed border-line p-[18px] text-center">
          <p className="text-[13.5px] font-semibold text-ink">{labels.empty}</p>
          <p className="mt-1 text-[12.5px] text-mut">{labels.emptyBody}</p>
        </div>
      ) : (
        <ul className="mt-4 flex list-none flex-col gap-3 p-0">
          {ordered.map((n) => (
            <li
              key={`${n.key}-${n.position}`}
              className="rounded-xl border border-line bg-bg px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="whitespace-nowrap rounded-full px-[10px] py-1 text-[11.5px] font-semibold"
                  style={{
                    background:
                      n.severity === 'advarsel' ? 'var(--sbg)' : 'var(--sf2)',
                  }}
                >
                  {n.severity === 'advarsel' ? labels.warning : labels.suggestion}
                </span>
                <span className="text-[13.5px] font-semibold">{n.title}</span>
              </div>
              <p className="mt-1 text-[12.5px] text-mut">
                {labels.question} {n.position + 1}
                {questionTexts[n.position] ? ` · ${questionTexts[n.position]}` : ''}
              </p>
              <p className="mt-2 text-[13px]">{n.why}</p>
              <p className="mt-1 text-[13px] font-semibold">{n.fix}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
