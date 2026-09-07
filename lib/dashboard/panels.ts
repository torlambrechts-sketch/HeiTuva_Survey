import type { Attributed } from '@/lib/results/types'
import { isNegative, roleOf, type RoledQuestion } from '@/lib/questions/roles'

/**
 * The two dashboard panels that are not aggregates over people —
 * HeiTuva.dc.html:1138-1163.
 *
 * Pure, and read by one caller each, for the reason V1-3 keeps proving: a
 * derivation that lives in the page is a derivation nothing can test without a
 * browser.
 */
export type RegisterStat = { key: string; value: string; label: string }

/**
 * «Svar per virksomhet» as three counts (NEW:3697).
 *
 * NO THRESHOLD APPLIES and that is not an oversight: `app.k_for` returns 0 for
 * an organisation survey because an organisation is not a natural person
 * (Q17/Q47). These are counts of BUSINESSES, and the register they summarise is
 * the aktsomhetsvurdering itself.
 *
 * The breach count uses the pack's `brudd` role rather than a text match, so it
 * follows the designation Q35 put on the pack (`lib/questions/roles.ts`). The
 * bundle matches `/brudd/i` against the question text; a role on the row is the
 * same rule with the drift removed.
 */
export function registerStats(
  data: Attributed | null,
  labels: { answered: string; breaches: string; overdue: string },
): RegisterStat[] | null {
  if (!data) return null

  const rows = data.rows ?? []
  const answered = rows.filter((r) => r.status === 'svart').length

  const bruddQ = (data.questions as RoledQuestion[]).find((q) => roleOf(q) === 'brudd')
  const breaches = bruddQ
    ? rows.filter((r) =>
        (r.answers ?? []).some(
          (a) => a.question_id === bruddQ.id && isNegative('brudd', a.value),
        ),
      ).length
    : 0

  // «forfalt etter påminnelse»: reminded and still silent. `paaminnet` is the
  // status the send pipeline sets, so this is a fact about what was sent, not
  // an inference from a date.
  const overdue = rows.filter((r) => r.status === 'paaminnet').length

  return [
    { key: 'answered', value: `${answered} av ${rows.length}`, label: labels.answered },
    { key: 'breaches', value: String(breaches), label: labels.breaches },
    { key: 'overdue', value: String(overdue), label: labels.overdue },
  ]
}

export type DutyRow = {
  key: string
  title: string
  law: string
  owner: string | null
  due: string | null
  tone: string
}

type DutyDefinition = { key: string; title: string; law: string }
type DutyState = {
  definition_key: string
  next_due_at: string | null
  org_members?: { name: string | null } | { name: string | null }[] | null
}

/**
 * «Lovpålagte frister» (NEW:3702).
 *
 * The bundle picks its dot colour by matching the DUE TEXT — `/ikke|forfall/i`
 * for red, `/om \d+ måned|neste/i` for blue. That is a string test standing in
 * for a date comparison because the prototype had no dates. Here the dates are
 * real, so the tone comes from the date: overdue or unset is `--ac3`, within
 * ninety days is `--ac`, further out is `--ac2`. Same three tones, same
 * meaning, derived rather than parsed.
 *
 * An unset deadline shares the red tone with an overdue one deliberately: both
 * mean "this duty is not under control", and giving "not set" its own calm
 * colour would let a duty nobody has scheduled look finished.
 */
export function dutyRows(
  definitions: DutyDefinition[],
  state: DutyState[],
  locale: string,
): DutyRow[] {
  const byKey = new Map(state.map((s) => [s.definition_key, s]))
  const now = Date.now()
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000

  return definitions.map((d) => {
    const row = byKey.get(d.key)
    const due = row?.next_due_at ?? null
    const member = Array.isArray(row?.org_members) ? row?.org_members[0] : row?.org_members

    const ms = due ? new Date(due).getTime() : null
    const tone =
      ms === null || ms < now
        ? 'var(--ac3)'
        : ms - now <= NINETY_DAYS
          ? 'var(--ac)'
          : 'var(--ac2)'

    return {
      key: d.key,
      title: d.title,
      law: d.law,
      owner: member?.name ?? null,
      due: due
        ? new Date(due).toLocaleDateString(locale === 'en' ? 'en-GB' : 'nb-NO', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : null,
      tone,
    }
  })
}
