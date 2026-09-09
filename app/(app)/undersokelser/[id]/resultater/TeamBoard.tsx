/**
 * «Lagtavle» — V2:1929-1943, on Resultater for a quiz survey.
 *
 * ── IT RENDERS AN AGGREGATE, AND IT SAYS SO ────────────────────────────────
 *
 * `public.quiz_leaderboard` is k-gated (`M:0086`), because a team score is a
 * per-group breakdown of what people said and a team of two scoring full marks
 * discloses both of them. **A gated board must not look like a complete one**,
 * or a reader counts four teams, knows the company has six, and infers which
 * two did badly — which is the gate leaking through its own silence.
 *
 * So the threshold sentence is always rendered, not only when something is
 * hidden. That is D42's rule (the threshold line is a property of the surface,
 * not a warning that appears when it bites) applied to a leaderboard.
 */
export function TeamBoard({
  teams,
  state,
  strings: s,
}: {
  teams: { team: string; score: number }[]
  // `k` is NOT a prop: the caller formats `gated` with it through next-intl, so
  // passing the number here as well would be a second place it could be wrong.
  state: 'ok' | 'off' | 'not_quiz'
  strings: { title: string; gated: string; empty: string; off: string; notQuiz: string }
}) {
  return (
    <section className="rounded-2xl border border-line bg-sf px-6 py-[22px]">
      <h2 className="text-base font-bold">{s.title}</h2>
      {state === 'not_quiz' ? (
        <p className="mt-3.5 text-[13px] text-mut">{s.notQuiz}</p>
      ) : state === 'off' ? (
        <p className="mt-3.5 text-[13px] text-mut">{s.off}</p>
      ) : (
        <>
          {teams.length === 0 ? (
            <p className="mt-3.5 text-[13px] text-mut">{s.empty}</p>
          ) : (
            <ol className="mt-3.5 flex list-none flex-col gap-2 p-0">
              {teams.map((t, i) => (
                <li
                  key={t.team}
                  className="flex min-w-0 items-center gap-3 rounded-[11px] px-[13px] py-[11px]"
                  style={{ background: i === 0 ? 'var(--sbg)' : 'var(--sf2)' }}
                >
                  <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-sf text-[11px] font-bold">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{t.team}</span>
                  <span className="flex-none text-[13px] font-bold">{t.score}</span>
                </li>
              ))}
            </ol>
          )}
          {/* ALWAYS, not only when a team is missing. See the note above. */}
          <p className="mt-3 text-[12px] text-mut">{s.gated}</p>
        </>
      )}
    </section>
  )
}
