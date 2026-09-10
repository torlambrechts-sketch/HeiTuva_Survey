import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
  Q50 — `organizations.timezone` HAS A WRITER, and this pins the three places
  it has to appear together.

  The column has existed since `M:0051`: `not null`, defaulting to
  `Europe/Oslo`, validated by a trigger against `pg_timezone_names`, and read by
  all three scheduling sites (`app.resume_schedule`, `app.run_due_schedules`,
  `public.send_round`). Every angle said finished except the one that mattered —
  **nothing set it.** A customer outside Oslo time could not say so, and their
  «09:00» pulse went out at 09:00 Oslo, silently, forever.

  This is the FIFTH instance of «who writes this column», and the fourth where
  the column existed and was read. Which is why the test is not «the column
  exists» — it is «the form offers it, the action accepts it, and the update
  writes it», the three parts that have to be present at once for a value a
  human typed to reach a scheduled send.
*/
const ACTIONS = 'app/(app)/administrasjon/actions.ts'
const FORM = 'app/(app)/administrasjon/CompanyForm.tsx'
const actions = readFileSync(ACTIONS, 'utf8')
const form = readFileSync(FORM, 'utf8')

/** `saveCompany`'s body — the action that owns Firmaopplysninger. */
const saveCompany = (() => {
  const start = actions.indexOf('export async function saveCompany')
  const rest = actions.slice(start)
  return rest.slice(0, rest.search(/\n\}/))
})()

describe('Q50 — the timezone writer', () => {
  it('the Firmaopplysninger form offers a timezone control', () => {
    expect(form).toMatch(/name="timezone"/)
  })

  it('saveCompany reads timezone off the submitted form', () => {
    expect(saveCompany).toMatch(/formData\.get\('timezone'\)/)
  })

  it('saveCompany writes timezone in the organizations update', () => {
    const update = saveCompany.slice(saveCompany.indexOf('.update('))
    expect(update).toMatch(/timezone:/)
  })

  it('the input is validated rather than passed through', () => {
    // An unknown zone is refused by the DB trigger at write time, but a server
    // boundary validates first (CLAUDE.md invariant 6) so the user gets the
    // form's own error rather than a 500 from a raised exception.
    // `z\b` and not `z\.`: prettier wraps the chain onto the next line, and a
    // test that pins formatting fails on a reformat while the property holds.
    expect(actions).toMatch(/timezone:\s*z\b/)
  })

  it('is administrator-only, by sharing saveCompany rather than adding a route', () => {
    // requireAdmin() already gates this action; the assertion is that the
    // timezone did NOT arrive as a new ungated action beside it.
    expect(saveCompany).toMatch(/requireAdmin\(\)/)
    const timezoneActions = [...actions.matchAll(/^export async function (\w*[Tt]imezone\w*)/gm)]
    expect(timezoneActions.map((m) => m[1])).toEqual([])
  })

  it('never writes an empty string — the column is NOT NULL with a real default', () => {
    const update = saveCompany.slice(saveCompany.indexOf('.update('))
    // `orgnr` and friends coalesce to null; timezone must not, or the trigger
    // raises and the whole company form fails on an unrelated field.
    expect(update).not.toMatch(/timezone:[^,\n]*\|\|\s*null/)
  })
})
