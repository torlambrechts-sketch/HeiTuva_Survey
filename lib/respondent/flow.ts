import { BLOCK_TYPES, type BlockType } from '@/lib/surveys/blocks'
import { safeVideoUrl } from '@/lib/surveys/media'
import type { RespondentQuestion } from './answers'

/**
 * V7-3c — WHAT A ROUND'S SNAPSHOT ENTRY IS.
 *
 * Since M:0127 `survey_rounds.question_snapshot` carries both kinds, each entry
 * tagged with `kind`. This is the only place that decides which is which, so
 * the page, the flow and the submit path cannot form three answers.
 *
 * ── THE RULE IS STATED AS A PROPERTY, NOT AS A LIST OF KINDS ───────────────
 *
 * An entry is a BLOCK iff `kind === 'block'`. Everything else is a question —
 * and that default is load-bearing rather than lazy: **every round sent before
 * M:0127 has entries with no `kind` at all**, and a rule written as
 * `kind === 'question'` would have emptied every historical survey the moment
 * it shipped. The property is «a block announces itself»; a question is what an
 * untagged entry has always been.
 *
 * An entry whose `kind` is present and is NEITHER is dropped, and so is a block
 * whose `type` this build does not know. Two different reasons:
 *
 *  - An unknown `kind` can only come from a future writer, and guessing it is a
 *    question would create an answer key for something that may not be one.
 *  - An unknown block TYPE would mean inventing a treatment for something no
 *    bundle draws. A block carries no answer, so dropping it cannot lose data —
 *    which is exactly why dropping is safe here and would not be for a question.
 */
export type RespondentBlock = {
  id: string
  type: BlockType
  title: string | null
  body: string | null
  caption: string | null
  /** Already checked: `https:` with a host, or null. Never the raw field. */
  url: string | null
  /**
   * WHETHER there is a picture — never WHERE it is.
   *
   * `survey_blocks.media_key` is a storage path, and a path is an
   * authorisation claim. The browser gets `/s/<token>/media/<block_id>`
   * instead, so the key never crosses the boundary at all (M:0128).
   */
  hasMedia: boolean
}

export type FlowStep =
  | { kind: 'question'; question: RespondentQuestion }
  | { kind: 'block'; block: RespondentBlock }

const isBlockType = (v: unknown): v is BlockType =>
  typeof v === 'string' && (BLOCK_TYPES as readonly string[]).includes(v)

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v : null

/**
 * The flow, in snapshot order.
 *
 * The snapshot is already ordered by `position` (`send_round`, M:0127), so this
 * preserves the array rather than re-sorting it: the round is frozen, and a
 * second ordering rule here would be a second answer to a question the database
 * already settled.
 */
export function respondentFlow(entries: unknown): FlowStep[] {
  if (!Array.isArray(entries)) return []
  const out: FlowStep[] = []
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    if (typeof e['id'] !== 'string') continue

    if (e['kind'] === 'block') {
      if (!isBlockType(e['type'])) continue
      out.push({
        kind: 'block',
        block: {
          id: e['id'],
          type: e['type'],
          title: text(e['title']),
          body: text(e['body']),
          caption: text(e['caption']),
          /* CHECKED HERE, not at render: a refusal that lives in the renderer
             is one every future renderer has to remember. `safeVideoUrl`
             returns null for anything but `https:` with a host. */
          url: safeVideoUrl(text(e['url'])),
          hasMedia: typeof e['media_key'] === 'string' && e['media_key'].trim() !== '',
        },
      })
      continue
    }
    if (e['kind'] !== undefined && e['kind'] !== 'question') continue
    out.push({ kind: 'question', question: raw as RespondentQuestion })
  }
  return out
}

/** The questions alone — for anything that counts or validates answers. */
export function questionsOf(flow: FlowStep[]): RespondentQuestion[] {
  return flow.flatMap((s) => (s.kind === 'question' ? [s.question] : []))
}

/**
 * ── THE STEP LABEL, DERIVED HERE SO A SCREEN CANNOT FORM IT ───────────────
 *
 * `stepLabel` is «Spørsmål {step} av {total}». Written over the FLOW it reads
 * «Spørsmål 1 av 7» on a survey with three questions and four blocks — **a
 * sentence that became untrue when its denominator changed meaning, with
 * nobody touching the sentence.** The same shape as `send_round`'s
 * `jsonb_array_length(v_snapshot) = 0`, which meant «no questions» only while
 * the snapshot held nothing else: the NAME was right and the implementation
 * stopped matching it.
 *
 * v7 answers it in one expression (v7:10440-10443), and the answer is two
 * labels, each counted over the population it names:
 *
 *     const qIdx = rq.filter((x,j) => j <= stepIdx && x.rIsQ).length
 *     const qTot = rq.filter(x => x.rIsQ).length
 *     if (cur.rIsBlock) return "Les · steg " + (stepIdx+1) + " av " + rq.length
 *     return "Spørsmål " + qIdx + " av " + qTot
 *
 * **It is a function here rather than two lines in the component for F1's
 * reason**: `PageHeader` has no `pct` prop, so a ratio over two populations
 * cannot be expressed. Neither can this — a screen hands over the flow and the
 * step, and there is nothing to pass wrongly. The progress BAR is a separate
 * quantity and stays over the flow (`stepPct`, v7:10444), because a block IS a
 * step the respondent walks through.
 */
export type StepLabel = { key: 'stepLabel' | 'blockReadStep'; step: number; total: number }

export function stepLabelFor(flow: FlowStep[], step: number): StepLabel {
  const isQuestion = (s: FlowStep) => s.kind === 'question'
  if (flow[step]?.kind === 'block') {
    return { key: 'blockReadStep', step: step + 1, total: flow.length }
  }
  return {
    key: 'stepLabel',
    step: flow.slice(0, step + 1).filter(isQuestion).length,
    total: flow.filter(isQuestion).length,
  }
}
