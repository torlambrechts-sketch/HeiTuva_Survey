import { LIVE_FEATURES, type LiveFeature } from '@/lib/surveys/live-features'

/**
 * «Live-innstillinger» — v8:881-897, in the Builder's GENERELT pane, below
 * «Kjøremodus» and shown only when the survey is in live mode, exactly as
 * `QuizPanel` is shown only in quiz mode: it is settings FOR the mode.
 *
 * ── IT HAS NO SWITCHES, AND THAT IS THE MEASUREMENT, NOT A SIMPLIFICATION ──
 *
 * v8 draws ten. `lib/surveys/live-features.ts` records why none of them ships
 * as one: there is no per-survey live storage in the schema, so every one of
 * the ten would be a control that moves, reloads in its old position, and
 * changes nothing. Tor's rule for this phase names that case directly — **no
 * toggle without a value it actually writes** — and D221's third face is the
 * sharper reason: a switch beside a sentence describing what it does is copy
 * asserting a write the code does not perform, which costs more than
 * decoration because the person stops looking for the setting elsewhere.
 *
 * What the ten labels ARE evidence of is what the live stage does, so that is
 * what the card carries. The split is the registry's; this file renders it.
 */
export function LivePanel({
  strings: s,
}: {
  strings: {
    title: string
    alwaysOn: string
    notBuilt: string
    guard: string
    /** Resolved by the registry's own `labelKey` / `descKey`. */
    say: (key: string) => string
  }
}) {
  const always = LIVE_FEATURES.filter((f) => f.state === 'always')
  const absent = LIVE_FEATURES.filter((f) => f.state === 'absent')

  const Row = ({ f, withDesc }: { f: LiveFeature; withDesc: boolean }) => (
    <div
      key={f.key}
      className={
        withDesc
          ? 'rounded-xl border border-line bg-sf px-[15px] py-3'
          : 'rounded-xl border border-dashed border-line bg-bg px-[15px] py-3'
      }
    >
      <span className={`block text-[13.5px] font-bold ${withDesc ? '' : 'text-mut'}`}>
        {s.say(f.labelKey)}
      </span>
      {/* An `absent` row carries no description. v8's own desc sentences state
          what the feature does, and stating that beside «ikke bygget» would
          describe behaviour nobody can reach. */}
      {withDesc && f.descKey ? (
        <span className="mt-[2px] block text-[11.5px] leading-[1.4] text-mut">
          {s.say(f.descKey ?? f.labelKey)}
        </span>
      ) : null}
    </div>
  )

  return (
    <div className="rounded-2xl border border-line bg-sf p-5">
      <div className="text-[11px] uppercase tracking-[.1em] text-mut">{s.title}</div>

      <p className="mt-3 text-[12px] leading-[1.5] text-mut">{s.alwaysOn}</p>
      <div className="mt-2 flex flex-col gap-2">
        {always.map((f) => (
          <Row key={f.key} f={f} withDesc />
        ))}
      </div>

      <p className="mt-4 text-[12px] leading-[1.5] text-mut">{s.notBuilt}</p>
      <div className="mt-2 flex flex-col gap-2">
        {absent.map((f) => (
          <Row key={f.key} f={f} withDesc={false} />
        ))}
      </div>

      {/* v8:895 — `liveGuard`. The one sentence in this card that is a claim
          about behaviour, and it is TRUE of us: the counter is hidden below
          the threshold, the bars are gated and the cloud has its own floor.
          It is `live.guard`, the string the stage already ships, rather than a
          second copy of it in this namespace. */}
      <p className="mt-4 text-[11.5px] leading-[1.5] text-mut">{s.guard}</p>
    </div>
  )
}
