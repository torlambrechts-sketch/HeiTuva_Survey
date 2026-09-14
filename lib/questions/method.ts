/**
 * V6-3 — the Metodikk check (v6's «lint»), as an ADVISORY evaluator.
 *
 * The rules are data: rows in `method_rules` (`M:0120`). This module only
 * evaluates them, and each row's `kind` selects an evaluator below — an unknown
 * kind is SKIPPED rather than thrown, so a migration may add one that older
 * deploys ignore. Same contract as `lib/questions/quality.ts`, deliberately.
 *
 * ── IT ADVISES. IT NEVER BLOCKS. (Q178) ────────────────────────────────────
 *
 * v6 draws five of these as «Blokkert» and gates publishing on them
 * (`goSendBlocked = !lint.canPublish`, v6:9857). We do not build that. There is
 * no `canPublish` here, nothing returns a boolean a caller could gate on, and
 * the severity type admits two values of which neither is «blokkert». **A
 * caller cannot accidentally turn this into a bar, because there is nothing to
 * read that would serve as one.**
 *
 * ── THE `rank` FINDING, LOGGED RATHER THAN QUIETLY PATCHED ─────────────────
 *
 * The bundle's rule tests `q.type === "rank"`. Our enum value is `ranking`, and
 * it always has been — so **the rule as drawn would have fired on nothing, in a
 * bundle that also made it a publish blocker.** A rule written against an
 * identifier nobody checked is a rule that silently does nothing, which is the
 * enumeration shape arriving in a lint: the author wrote down the type name
 * they had in mind rather than the one the product uses. The row uses `ranking`
 * and `tests/unit/method-rules.test.ts` asserts every `type_in` rule names a
 * type the enum actually holds, so the next one fails a test instead of
 * evaluating to silence.
 */

/** What the evaluator needs of a question. Structural rather than the row type,
 *  so the Builder can run it on unsaved edits. */
export type MethodQuestion = {
  type: string
  text: string
  /** 0-based, as `survey_questions.position` is. */
  position: number
  config?: { labels?: unknown[]; [k: string]: unknown } | null
  followUpOnLow?: boolean
}

export type MethodRule = {
  key: string
  severity: 'advarsel' | 'forslag'
  kind: string
  config: unknown
  title: string
  why: string
  fix: string
}

export type MethodNote = {
  key: string
  severity: 'advarsel' | 'forslag'
  title: string
  why: string
  fix: string
  /** Which question it is about, 0-based. */
  position: number
}

type Cfg = Record<string, unknown>

const str = (c: Cfg, k: string): string | null =>
  typeof c[k] === 'string' ? (c[k] as string) : null
const num = (c: Cfg, k: string): number | null =>
  typeof c[k] === 'number' ? (c[k] as number) : null

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/**
 * A row's regex, compiled, or `null` when it cannot be.
 *
 * Returning null would silently disable a rule, which is a swallowed failure —
 * so `tests/db/catalogue-invariants.test.ts`'s discipline applies: the test
 * suite compiles EVERY seeded pattern and asserts none of them lands here.
 * The swallow exists because this runs on every keystroke in the Builder and
 * must not throw on a half-typed question.
 */
export function toJsRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'iu')
  } catch {
    return null
  }
}

/**
 * Notes for one survey. `policyLocked` comes from `surveys.policy_locked`.
 *
 * **Q180 — a lint that warns against a lovpålagt template is a lint that is
 * wrong.** In a statutory pack the question ORDER is part of what makes it
 * statutory, so a locked policy exempts any rule whose row says
 * `exempt_policy_locked`. The exemption is read from the ROW rather than
 * hard-coded here, so a second order-sensitive rule inherits it by saying so.
 */
export function methodNotes(
  questions: MethodQuestion[],
  rules: MethodRule[],
  opts: { policyLocked?: boolean } = {},
): MethodNote[] {
  const out: MethodNote[] = []
  for (const q of questions) {
    for (const r of rules) {
      const cfg = (r.config ?? {}) as Cfg
      let hit = false

      switch (r.kind) {
        case 'type_in': {
          const types = Array.isArray(cfg.types) ? (cfg.types as unknown[]) : []
          hit = types.includes(q.type)
          break
        }
        case 'text_regex': {
          const p = str(cfg, 'pattern')
          const re = p ? toJsRegex(p) : null
          hit = !!re && re.test(q.text)
          break
        }
        case 'text_regex_min_words': {
          const p = str(cfg, 'pattern')
          const re = p ? toJsRegex(p) : null
          const min = num(cfg, 'min_words') ?? 0
          hit = !!re && words(q.text).length >= min && re.test(q.text)
          break
        }
        case 'sensitive_position': {
          if (cfg.exempt_policy_locked === true && opts.policyLocked) break
          const p = str(cfg, 'pattern')
          const re = p ? toJsRegex(p) : null
          const max = num(cfg, 'max_position') ?? 0
          hit = !!re && q.position < max && re.test(q.text)
          break
        }
        case 'scale_unlabelled': {
          const labels = q.config?.labels
          hit = q.type === 'scale' && !(Array.isArray(labels) && labels.length > 0)
          break
        }
        case 'text_no_followup': {
          hit = q.type === 'text' && !q.followUpOnLow
          break
        }
        default:
          // An unknown kind is skipped, never thrown. A newer migration may add
          // one this deploy does not know.
          break
      }

      if (hit) {
        out.push({
          key: r.key,
          severity: r.severity,
          title: r.title,
          why: r.why,
          fix: r.fix,
          position: q.position,
        })
      }
    }
  }
  return out
}

/** Counts for the panel's summary line. Advisory: there is deliberately no
 *  `canPublish` and no boolean a caller could gate sending on (Q178). */
export function methodCounts(notes: MethodNote[]): {
  advarsel: number
  forslag: number
} {
  return {
    advarsel: notes.filter((n) => n.severity === 'advarsel').length,
    forslag: notes.filter((n) => n.severity === 'forslag').length,
  }
}
