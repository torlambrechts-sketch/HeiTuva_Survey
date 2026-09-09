/**
 * Question quality heuristics (the Norwegian wedge, plan line 36).
 *
 * The rules are data: rows in `quality_rules`, seeded in supabase/seed.sql from
 * the design's own heuristics. This module is only the evaluator — adding or
 * retuning a rule is a row, not a code change. Each row carries a `rule.kind`
 * that selects an evaluator below, so an unknown kind is skipped rather than
 * throwing: a future migration can add a kind that older deploys ignore.
 *
 * Deliberately pure and synchronous. It runs on every keystroke in the Builder,
 * and the flag list is also needed server-side for the send-readiness check, so
 * it must not depend on a request or a client.
 */

export type QualityRule = {
  key: string
  pattern: string | null
  rule: unknown
  message: string
}

export type QualityFlag = { key: string; message: string }

type RuleKind =
  | { kind: 'regex' }
  | { kind: 'regex_min_words'; min_words: number }
  | { kind: 'max_words'; max: number }
  | { kind: 'leading_words'; words: string[] }

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/**
 * Postgres regexes use \m and \M for word boundaries; JavaScript's `\b` is the
 * obvious translation and it is the WRONG one. **`\b` is ASCII-only: `æ`, `ø`
 * and `å` are non-word characters to it, so it puts a word boundary in the
 * middle of a Norwegian word.** These patterns are evaluated against Norwegian
 * a customer types, which makes that a live defect and not a pedantry.
 *
 * Found by audit after `verify:copy` was blind to «åtte» for the same reason
 * (D113). The two sites fail in OPPOSITE DIRECTIONS, and which one you get is
 * decided by where the non-ASCII letter sits:
 *
 *   - **Non-ASCII in the PATTERN** (`\båtte\b`) — `\b` never holds before `å`
 *     after a space, so the rule matches NOTHING. Silent. That was D113.
 *   - **Non-ASCII in the DATA**, which is this file: every alternative here is
 *     ASCII (`du`, `og`, `ikke`), so `\b` is strictly more permissive than the
 *     correct boundary and the rule can only ever OVER-match — a pronoun
 *     warning on a word that merely contains `du` next to an `å`. Loud.
 *
 * Measured before fixing, over every Norwegian string this repo holds — the
 * question bank, its translations, `ui_messages`, the help articles, all of
 * `messages/no.json` and the prose of all three design bundles: 2227 strings,
 * 96 634 characters, **zero divergence between the two translations**. So this
 * repairs a defect that had not yet fired on shipped copy. It is fixed anyway,
 * because the input this actually runs on is a question a customer writes, and
 * that corpus does not exist yet.
 *
 * Exported so `policy-warnings.ts` uses this boundary rather than its own copy:
 * the two files each carried this function, which is how one of them would have
 * been repaired and the other left behind.
 */
export function toJsRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(
      pattern.replace(/\\m/g, '(?<![\\p{L}\\p{N}_])').replace(/\\M/g, '(?![\\p{L}\\p{N}_])'),
      'iu',
    )
  } catch {
    // A malformed pattern is a seed bug, not a reason to break the editor —
    // this runs on every keystroke in the Builder. But a catch that returns
    // null makes the rule VANISH, which is the failure class D115 names: it is
    // only sound because `tests/unit/quality.test.ts` compiles every seeded
    // pattern from the catalogue and asserts none of them lands here.
    console.error(`quality_rules: unusable pattern ${pattern}`)
    return null
  }
}

function asRuleKind(raw: unknown): RuleKind | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  switch (r.kind) {
    case 'regex':
      return { kind: 'regex' }
    case 'regex_min_words':
      return typeof r.min_words === 'number' ? { kind: 'regex_min_words', min_words: r.min_words } : null
    case 'max_words':
      return typeof r.max === 'number' ? { kind: 'max_words', max: r.max } : null
    case 'leading_words':
      return Array.isArray(r.words) ? { kind: 'leading_words', words: r.words.map(String) } : null
    default:
      return null
  }
}

/**
 * Flags for one question's text, in the order the rules are given so the
 * display order is controlled by the data rather than by evaluation order.
 * An empty or whitespace-only question raises nothing: it is caught by the
 * readiness check as a missing question, and flagging it as well would put two
 * complaints on one problem.
 */
export function qualityFlags(text: string, rules: QualityRule[]): QualityFlag[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const lower = trimmed.toLowerCase()
  const wordCount = words(trimmed).length
  const out: QualityFlag[] = []

  for (const row of rules) {
    const spec = asRuleKind(row.rule)
    if (!spec) continue

    let hit = false
    switch (spec.kind) {
      case 'regex': {
        const re = row.pattern ? toJsRegex(row.pattern) : null
        hit = re ? re.test(lower) : false
        break
      }
      case 'regex_min_words': {
        // "Two questions in one" only reads as a real fault once the sentence
        // is long enough that the conjunction is joining clauses, not words.
        //
        // `min_words` is inclusive: 7 means "seven words is enough". The design
        // writes the same threshold as `split(" ").length > 6`
        // (HeiTuva.dc.html:2497), so an exclusive comparison here would move the
        // flag one word later than the bundle.
        const re = row.pattern ? toJsRegex(row.pattern) : null
        hit = re ? re.test(lower) && wordCount >= spec.min_words : false
        break
      }
      case 'max_words':
        hit = wordCount > spec.max
        break
      case 'leading_words':
        hit = spec.words.some((w) => lower.includes(w.toLowerCase()))
        break
    }

    if (hit) out.push({ key: row.key, message: row.message })
  }

  return out
}
