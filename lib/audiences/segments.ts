import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Evaluating a segment — DECISIONS **Q65** and **Q92**.
 *
 * A segment is a RULE, not a membership list (Q92), so its size is computed
 * when asked rather than stored. This is that computation, and it is the only
 * place a predicate turns into a query.
 *
 * ── HOW A STORED PREDICATE BECOMES A QUERY WITHOUT BECOMING SQL ─────────────
 *
 * Never by string building. Each clause's `field` is looked up in
 * `segment_fields` to get a REAL COLUMN NAME, and the value goes through the
 * query builder as a bound parameter. A field the registry does not hold — or
 * holds as unavailable — never reaches a query at all, because the database
 * refuses to store such a predicate in the first place
 * (`app.validate_segment_predicate`). This function is the second line, not the
 * first: `tests/db/segments.test.ts` asserts no function in the schema EXECUTEs
 * anything derived from a predicate, and the operator set is closed here for
 * the same reason it is closed there.
 *
 * ── AND WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────
 *
 * It returns a COUNT OF PEOPLE, which Q28 expressly permits — «the threshold
 * hides svarutledete tall, not counts of people». It never touches `responses`
 * or `answers`, and a segment is never a breakdown axis (Q92), so no aggregate
 * is segment-scoped in this phase. If one ever is, it is a new k-gated surface
 * with its own negative tests at n=1 and n=2.
 */
export type SegmentClause = { field: string; op: string; value: unknown }

/** The operators the database also accepts. Kept in step by a test rather than
 *  by memory — a set that drifts is how a stored rule starts meaning something
 *  the editor did not show. */
export const SEGMENT_OPS = ['eq', 'ne', 'in', 'lt', 'gt'] as const

export type FieldRow = { key: string; source_column: string | null; available: boolean }

/**
 * Count the members a predicate selects.
 *
 * Returns `null` when the rule cannot be evaluated — an unknown field, an
 * unavailable one, an unknown operator. **`null` is not zero**, and the caller
 * must render it as «kan ikke beregnes» rather than as an empty segment:
 * CLAUDE.md's never-fabricate rule, and a 0 here would be indistinguishable
 * from a real segment nobody matches.
 */
export async function countSegmentMembers(
  supabase: SupabaseClient<Database>,
  orgId: string,
  predicate: SegmentClause[],
  fields: FieldRow[],
): Promise<number | null> {
  let q = supabase
    .from('org_members')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'active')

  for (const clause of predicate) {
    const field = fields.find((f) => f.key === clause.field)
    if (!field || !field.available || !field.source_column) return null
    if (!(SEGMENT_OPS as readonly string[]).includes(clause.op)) return null

    const col = field.source_column
    const v = clause.value
    switch (clause.op) {
      case 'eq':
        q = q.eq(col, v as never)
        break
      case 'ne':
        q = q.neq(col, v as never)
        break
      case 'in':
        q = q.in(col, (Array.isArray(v) ? v : [v]) as never[])
        break
      case 'lt':
        q = q.lt(col, v as never)
        break
      case 'gt':
        q = q.gt(col, v as never)
        break
      default:
        return null
    }
  }

  const { count, error } = await q
  if (error) {
    console.error(`segment count failed: ${error.message}`)
    return null
  }
  return count ?? 0
}

/**
 * The rule as a person reads it — **generated from the predicate** (Q65), never
 * stored beside it.
 *
 * Stored display text would be untranslatable and free to drift from the
 * predicate it claims to describe. The caller supplies the field and operator
 * words from next-intl, so `en` works and the sentence cannot disagree with
 * what the database holds.
 */
export function renderRule(
  predicate: SegmentClause[],
  label: (kind: 'field' | 'op', key: string) => string,
  and: string,
): string {
  return predicate
    .map((c) => `${label('field', c.field)} ${label('op', c.op)} ${formatValue(c.value)}`)
    .join(` ${and} `)
}

function formatValue(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  return String(v ?? '')
}
