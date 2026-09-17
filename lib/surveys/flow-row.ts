import type { MethodNote } from '@/lib/questions/method'

/**
 * V7-5 — THE COMPACT FLOW ROW'S TWO DERIVATIONS, both kept out of the component.
 *
 * ── WHY A MODULE FOR TWO SMALL FUNCTIONS ──────────────────────────────────
 *
 * The same reason `PageHeader` has no `pct` prop and `estimatedMinutes` takes a
 * named object: a value a component can assemble inline is a value the next
 * component can assemble differently. F3 found the row response rate with FOUR
 * implementations, three of which agreed by luck. The status dot is exactly
 * that shape — a colour picked from a severity, which any row could pick its
 * own way — so there is one place that decides it and a test over that place.
 *
 * ── THE DOT IS NOT THE DRAWING'S DOT, AND THE DIFFERENCE IS OURS TO STATE ──
 *
 * v7 (`lintDot`, v7:10118) has four outcomes: `--ac3` for its own «Blokkert»
 * severity, `--sbg` for «Advarsel», `--sf2` for a note of any other kind, and
 * `--ac2` for a clean question. Blocks get `transparent`.
 *
 * `method_rules.severity` admits **two** values, `advarsel` and `forslag`, and
 * `lib/questions/method.ts` says in its own header why there is no third: a
 * methodology note advises, it does not block. So v7's «Blokkert» has no
 * counterpart in our rules — and it does have one in the product: the
 * ANONYMITY BREACH, which `ready_anonymity` already treats as a blocker and
 * which `QuestionCard` already paints. That is what takes `--ac3` here.
 *
 * So the five outcomes below are a mapping onto what this product actually
 * knows, not a copy of the drawing's, and **every tint is the one already in
 * use for that meaning**: `MethodPanel.tsx:68` paints `advarsel` on `--sbg` and
 * `forslag` on `--sf2`. A dot that invented its own palette would be a second
 * answer to a question that screen has already answered.
 */
export type FlowDot = 'block' | 'blocked' | 'warning' | 'suggestion' | 'clean'

/** The theme token each outcome paints, quoted from where it already means that. */
export const DOT_TINT: Record<FlowDot, string> = {
  // v7:10118 gives a block no dot at all rather than a grey one: there is no
  // methodology check to report, and an empty circle reads as «checked, fine».
  block: 'transparent',
  blocked: 'var(--ac3)',
  warning: 'var(--sbg)',
  suggestion: 'var(--sf2)',
  clean: 'var(--ac2)',
}

/**
 * Which dot a flow row shows.
 *
 * `position` is the question's own 0-based index, which is what
 * `MethodNote.position` is numbered by — NOT the flow slot. Conflating them is
 * how a note lands on the wrong row once a block sits between two questions,
 * and it is the same distinction the Builder keeps as `qIndex` versus `slot`.
 */
export function flowDot(input: {
  kind: 'question' | 'block'
  /** The anonymity breach — our only blocking condition. */
  breach?: boolean
  /** Every note for the whole draft; this function selects its own. */
  notes?: MethodNote[]
  position?: number
}): FlowDot {
  if (input.kind === 'block') return 'block'
  if (input.breach) return 'blocked'
  const mine = (input.notes ?? []).filter((n) => n.position === input.position)
  if (mine.some((n) => n.severity === 'advarsel')) return 'warning'
  if (mine.length) return 'suggestion'
  return 'clean'
}

/**
 * The «Flytt til plass» options: every slot except the one the row is in.
 *
 * v7:6847 builds the same list and labels it «Plass N» over the FLOW, which is
 * what `moveInFlow` already takes as an absolute target — so the arrows are the
 * special case of this control rather than the other way round, and no new
 * reorder path is introduced by offering it.
 *
 * Returned as 0-based targets. The caller labels them, because the label is a
 * message and this module holds no copy.
 */
export function moveTargets(length: number, from: number): number[] {
  if (length <= 1) return []
  const out: number[] = []
  for (let i = 0; i < length; i++) if (i !== from) out.push(i)
  return out
}
