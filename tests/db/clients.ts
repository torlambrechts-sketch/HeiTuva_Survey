import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { DEMO_PASSWORD, PERSONAS, type PersonaName } from './personas'

/**
 * ── THE STANDING QUESTIONS ──────────────────────────────────────────────────
 *
 * Before writing a check, ask all three. The first two are halves of one thing
 * — a check that reaches the wrong control, and a check that reaches the wrong
 * row — and V1-2 hit each of them twice. The third is about a check that
 * reaches the right thing and only looks at part of it; V1-3 found it, and
 * V1-4 found it again rotated onto a new axis (see 2b).
 *
 *   1. What ELSE could refuse this before the check I am testing gets a chance?
 *   2. What could have MOVED the state my selector assumes?
 *   3. Am I asserting over the SET — of values, AND of the sites that can
 *      violate the property — or over the ones I happened to pick?
 *
 * ── 1. WHAT ELSE COULD REFUSE THIS ──────────────────────────────────────────
 *
 * Twice in two phases the answer was "something", and both times the test
 * believed it was exercising the last control when an earlier one had already
 * ended the request:
 *
 *   V1-1  A guard test for `threshold_admin_only` ran as a redaktør on a survey
 *         RLS would not show them. `surveys_upd` filtered the row, the update
 *         matched nothing, PostgREST returned NO error — and the assertion was
 *         simply wrong about which control had acted. Written the other way
 *         round it would have passed with the guard deleted.
 *
 *   V1-2  A Q30 test used a `ledere_eget_team` share with no group. Such a
 *         share is refused outright at `M:0034:255`, so the payload was
 *         `{error:forbidden}` and the assertion ran against a document with no
 *         sections at all.
 *
 *   V1-4  A Q25 test asserted that a member cannot write a colleague's layout,
 *         using `insert(...).select('id')` and an error assertion. It passed
 *         with `dashboard_layouts_ins` widened to `is_org_member` alone,
 *         because PostgreSQL applies the SELECT policy to an INSERT's
 *         RETURNING — the refusal came from `_sel` wearing a write test's
 *         name. A BARE insert is accepted under the widened policy, measured
 *         rather than reasoned about. Mutation caught it; reading it did not.
 *
 * THREE VARIANTS OF ONE ROOT CAUSE, AND THE GENERAL FORM IS THE USEFUL PART:
 * THE THING THAT REFUSED IS NOT THE THING UNDER TEST. It was refused by an
 * EARLIER check (V1-1's guard, behind RLS), by an OUTER control (V1-2's
 * group-less share, refused before the payload existed), and by a CO-LOCATED
 * policy (V1-4's SELECT policy, invoked by the RETURNING of an INSERT). The
 * third is the one reading cannot find: nothing in the statement mentions the
 * read policy. Only removing the control you believe is acting, and watching
 * the test go red, tells you which one was.
 *
 * Three of three says the answer is rarely nothing. The layers in this schema
 * stack: auth → RLS → a guard trigger → a CHECK → the function's own rule, and
 * a fixture that trips an early one never reaches the late one. So arrange the
 * fixture so ONLY the rule under test can produce the result, and where both
 * layers matter, write two tests — one proving the outer control acts (and
 * that zero rows is not a denial, Gate 2b), one removing it so the inner one
 * has to.
 *
 * The same question has a positive form, and V1-2 needed it twice: what else
 * could SATISFY this assertion? `.every()` over an empty table is true, a
 * serialised `[]` contains no forbidden substring, and "the body has no
 * supplier name" is satisfied by a 404 page, by a login form and by the route
 * not existing. Three audit assertions passed against a route that had not
 * been written. A check that cannot fail is not a check, so guard the ones
 * whose subject might be absent on the subject EXISTING — `written`,
 * `rows.length > 0`, a positive control beside the denial.
 *
 * ── 2. WHAT COULD HAVE MOVED THE STATE MY SELECTOR ASSUMES? ─────────────────
 *
 * The first question is about a request reaching the wrong control. This one
 * is about a check reaching the wrong ROW, and it bites hardest in the
 * harness, where a selector runs against whatever the database happens to hold
 * rather than against a fixture the check built.
 *
 *   V1-2  `verify:respondent` chose its round as "the oldest OPEN round in the
 *         database" — no organisation filter, no anonymity filter — and then
 *         asserted the anonymity banner, an anonymous response row and an
 *         hour-truncated timestamp. On a stack where the db suite had run
 *         first it picked an ATTRIBUTED fixture in another organisation, and
 *         three checks failed for the only reason they could.
 *
 *   V1-2  `verify:send` drained the queue with `mail-worker --once`, which
 *         drains ONE BATCH of ten, and then asserted that a specific SMS job
 *         had been sent. Ten reminders queued earlier filled the batch, so the
 *         SMS job was never reached and three checks reported "nothing
 *         captured" — which reads like a broken provider rather than a queue
 *         the check never got to the end of.
 *
 * Neither was caused by the change that exposed it. Both had been fragile for
 * phases; V1-2's fixtures only changed which row was oldest and how full the
 * queue was. That is the tell: a selector that depends on ORDERING or on
 * COUNT, rather than on the properties the assertions need, is already broken
 * and simply has not been unlucky yet.
 *
 * So: name every property the assertions depend on, in the query. If the check
 * needs an anonymous survey in the demo organisation with questions and an
 * open round, say all four — and fail loudly when nothing matches, rather than
 * silently testing something else. If the check needs a queue drained, drain
 * until it reports empty rather than assuming one pass is enough.
 *
 * ── 2b. THE SAME QUESTION ROTATED: THE ROWS, NOT THE ROLES ──────────────────
 *
 * Question 2 asks what could have MOVED the row my check reads. This is its
 * other axis, and V1-4 walked into it: I asserted over the ROLES THAT READ and
 * not over the ROWS THEY MAY REACH.
 *
 *   V1-4  `dashboard_layouts_sel` is `is_org_member AND (user_id is null OR
 *         user_id = auth.uid())` — two clauses, because a member sees the
 *         organisation's shared presets AND their own layouts, and nobody
 *         else's. Every read assertion covered a role: an outsider sees
 *         nothing, a redaktør reads a preset, a leser reads a preset. Widening
 *         the policy to `is_org_member` alone failed NO test, because no
 *         assertion had ever tried to read a COLLEAGUE'S PERSONAL row — the
 *         only row the second clause exists to hide.
 *
 * THE RULE: WHEN A POLICY PROTECTS A ROW RATHER THAN A TABLE, ENUMERATING THE
 * ROLES IS NOT ENUMERATING THE CASES. A predicate with a disjunction has one
 * case per branch and one for the rows no branch admits, and it is that last
 * one the policy is usually for. Read the predicate, list the row shapes it
 * distinguishes, and write an assertion per shape — the same discipline
 * question 3 applies to values, applied to rows.
 *
 * This will recur wherever a table holds rows of more than one ownership. It
 * already applies to `dashboard_pins`, and it will apply to anything that
 * mixes shared and personal rows in one table.
 *
 * ── 3. ASSERT THE RELATION OVER THE SET, NOT THE MEMBERS ────────────────────
 *
 * Where a set of values must each satisfy the same relation, write the
 * assertion over the SET. Sampling two of them tests two of them.
 *
 *   V1-3  `app.run_due_schedules` computed the next run from a CASE with four
 *         arms and `else interval '7 days'`, so `annual` — in the enum since
 *         M:0001:20 — re-sent every seven days. Q20 was adding two cadences,
 *         and a test of the two NEW values would have passed: they were about
 *         to be given correct arms. The assertion that caught it was the
 *         relation — "a cadence whose next run is sooner than its own name is
 *         wrong" — evaluated over every value in the vocabulary, including the
 *         four that had been wrong for months and were in nobody's sample.
 *
 * This is the enumeration-versus-sampling rule arriving in test design rather
 * than in coverage, and it is the same rule Gate 5a3 applies to the catalogue
 * and Q28 applies to its exemption list: enumerate the set from its source,
 * assert the property over all of it, and let a new member fail until someone
 * adds it deliberately. A list of examples grows only when someone remembers
 * to grow it, which is exactly when it stops covering the case that matters.
 *
 * ── 3b. THERE ARE TWO SETS, AND THE SECOND ONE IS THE SITES ─────────────────
 *
 * The same phase then made the same mistake one level up, which is why this
 * half is written out separately.
 *
 *   V1-3  The cadence test enumerated the VALUES correctly — every cadence, the
 *         relation asserted over all of them — and drove ONE of the two places
 *         that compute a next run. `send_round` held a second copy of the CASE
 *         with the same `else interval '7 days'`, so after the fix the sweep
 *         advanced an annual survey by a year while its FIRST next run was
 *         still a week out. Enumerating the values while sampling the call
 *         sites is the same error in a different dimension.
 *
 * So, the general form:
 *
 *   A property that must hold EVERYWHERE must be asserted at every site that
 *   can violate it, and THE SET OF SITES IS DERIVED, NOT REMEMBERED.
 *
 * Derived means a query against the catalogue, not a list in a test file and
 * not a note in a comment. `tests/invariants/threshold-policy.test.ts` has two
 * of these now — nothing may still call `app.k_threshold()`, and nothing but
 * `app.cadence_interval` may do interval arithmetic on a cadence — and both are
 * `select … from pg_proc`, so a function added next month is in the set without
 * anyone adding it.
 *
 * Worth knowing why that matters more than it sounds: migration 0044's comment
 * PREDICTED the second copy, in as many words, and the second copy survived it
 * anyway. A comment warning about a class of bug does not go looking for other
 * instances of the class. Only a query does. If you find yourself writing "and
 * make sure nobody does this elsewhere" in a comment, that sentence is the
 * specification for a sweep, not a substitute for one.
 *
 * ── AND THE CONVERSE, WHICH IS THE SAME RULE FROM THE OTHER SIDE ────────────
 *
 * Do not BECOME what else exists. Gate 5a2's rule is usually read as "do not
 * depend on a pristine database"; its other half is that a check must not leave
 * the database changed for the next one. `tests/db/policy-panel.test.ts` cleans
 * up because its fixtures changed which survey `/resultater` opened and broke a
 * focus assertion four steps away; `verify:roundtrip` now deletes the group it
 * creates, because one accumulated per run in the DEMO organisation and turned
 * up in a V1-2 capture as a team row nobody had made.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export type Client = SupabaseClient<Database>

/**
 * No session at all — the respondent surface and any unauthenticated probe.
 * A fresh instance per call so one test cannot leak a session into another.
 */
export function anonClient(): Client {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
}

/**
 * SERVICE ROLE — bypasses every RLS policy and the k-anonymity gate.
 *
 * Use this ONLY to arrange fixtures. Asserting an access rule with this client
 * proves nothing: it would pass whether or not the policy exists. Every
 * assertion about who can see what must go through a persona client below.
 */
export function serviceClient(): Client {
  return createClient<Database>(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

/**
 * A real signed-in session for a seeded persona — a genuine JWT, so RLS and
 * auth.uid() behave exactly as they do for a real user in the browser.
 */
export async function personaClient(persona: PersonaName): Promise<Client> {
  const { email } = PERSONAS[persona]
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
  if (error) {
    throw new Error(
      `personaClient(${persona}) could not sign in as ${email}: ${error.message}. ` +
        `Run "npm run seed:demo" against the local stack first.`,
    )
  }
  return client
}

export const adminClient = () => personaClient('administrator')
export const redaktorClient = () => personaClient('redaktor')
export const leserClient = () => personaClient('leser')
export const outsiderClient = () => personaClient('outsider')
