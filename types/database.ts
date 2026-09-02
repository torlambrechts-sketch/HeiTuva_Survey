/**
 * Placeholder schema type.
 *
 * `supabase gen types typescript` should replace this once the CLI can
 * authenticate to the project (it currently fails against the local container
 * with "password authentication failed for user postgres"). Until then the
 * Supabase clients are generically typed but unvalidated, so a wrong column
 * name is a runtime error rather than a compile error. Regenerate before
 * building Phase 1 screens against real tables.
 */
export type Database = Record<string, unknown>
