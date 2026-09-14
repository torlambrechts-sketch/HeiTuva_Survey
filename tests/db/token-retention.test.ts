import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, serviceClient, type Client } from './clients'
import { createOrg, createRound, createSurvey, dropOrg } from './factories'

/**
 * F1-2 — the token carries the organisation's RETENTION, and only that.
 *
 * ── WHY THIS IS A MIGRATION AND NOT A READ IN THE PAGE ─────────────────────
 *
 * `/s/[token]` has no session. It is built with the ANON key and its only data
 * access is two SECURITY DEFINER RPCs (`app/s/[token]/page.tsx:14-22`), which
 * is what keeps invariant 1 true on the one surface a stranger can open. So a
 * retention figure cannot be read from `organizations` there — the honest way
 * to get it is through the function that already resolves the token.
 *
 * ── AND WHY ONLY TWO FIELDS ────────────────────────────────────────────────
 *
 * CLAUDE.md invariant 3's corollary: **no per-organisation value may reach a
 * respondent-facing surface unless a decision says so by name.** Q187 names the
 * retention, and names it in both places. It does not name `organizations.privacy`,
 * which is a settings object carrying IP logging, consent and EU-only flags —
 * returning the whole column because the value we need lives inside it would be
 * an enumeration of what we happened to want standing in for what we are
 * allowed to send. So the function resolves the ONE boolean and returns it.
 *
 * The last test is the one that matters most and it is stated as a property
 * rather than as a list: the payload's keys are compared against what the
 * surface is allowed to know, so a later edit that widens the object fails here
 * rather than on a respondent's screen.
 */
const TAG = `f1-retention-${randomUUID().slice(0, 8)}`
const ORG = `Retensjon ${TAG}`

const svc: Client = serviceClient()
const anon: Client = anonClient()

let orgId = ''
let token = ''

beforeAll(async () => {
  const org = await createOrg(ORG)
  orgId = org.id
  const survey = await createSurvey(orgId, `Retensjonspuls ${TAG}`, [
    { type: 'scale', text: 'Hvordan har uken vært?' },
  ])
  const round = await createRound(survey, 1)
  token = round.tokens[0]!
}, 120_000)

afterAll(async () => {
  await dropOrg(ORG, svc)
})

async function payload(): Promise<Record<string, unknown>> {
  const { data, error } = await anon.rpc('get_survey_for_token', { p_token: token } as never)
  if (error) throw new Error(`get_survey_for_token: ${error.message}`)
  return data as unknown as Record<string, unknown>
}

async function setOrg(patch: Record<string, unknown>) {
  const { error } = await svc.from('organizations').update(patch as never).eq('id', orgId)
  if (error) throw new Error(`organizations update: ${error.message}`)
}

describe('F1-2 — the token payload carries retention', () => {
  it('the fixture resolves at all — so every assertion below is not vacuous', async () => {
    const p = await payload()
    expect(p.error, `token did not resolve: ${JSON.stringify(p.error)}`).toBeUndefined()
    expect(p.survey_id).toBeTruthy()
  })

  it('a months value reaches the surface, and it is the ORGANISATION’s', async () => {
    await setOrg({ retention_months: 6 })
    const p = await payload()
    expect(p.retention_months).toBe(6)
    // Absent `auto_delete` means deletion is ON — `app.apply_retention` reads
    // `coalesce((privacy->>'auto_delete')::boolean, true)`, and a payload that
    // inverted that default would tell a respondent her answers are kept
    // forever when they are not.
    expect(p.retention_auto_delete).toBe(true)
  })

  it('«aldri» is carried as a FACT, not left for the page to infer', async () => {
    await setOrg({ retention_months: 0 })
    expect((await payload()).retention_months).toBe(0)

    await setOrg({ retention_months: 24, privacy: { auto_delete: false } })
    const p = await payload()
    expect(p.retention_months).toBe(24)
    expect(p.retention_auto_delete).toBe(false)
  })

  it('the whole `privacy` object does NOT reach a respondent surface', async () => {
    /*
      The security half. `organizations.privacy` carries settings that are none
      of a respondent's business, and the tempting implementation — return the
      column and let the page pick — would have shipped all of them.
    */
    await setOrg({
      retention_months: 12,
      privacy: { auto_delete: true, ip_logging: true, eu_only: false, consent: 'nei' },
    })
    const p = await payload()
    expect(p.privacy, 'the privacy column reached the token payload').toBeUndefined()
    expect(JSON.stringify(p)).not.toContain('ip_logging')
    expect(JSON.stringify(p)).not.toContain('eu_only')
  })

  it('the payload’s keys are the ones this surface is allowed to know', async () => {
    /*
      Stated as a closed set rather than as «and not X», because the failure
      this guards against is a field ARRIVING, and a list of forbidden names can
      only ever be as long as the last thing somebody thought of.
    */
    const allowed = new Set([
      'survey_id', 'round_id', 'title', 'org_id', 'org_name', 'org_default_lang',
      'invitation_lang', 'anonymity', 'run_mode', 'feedback_mode', 'k_threshold',
      'respondent_kind', 'engage', 'lang', 'langs', 'already_responded',
      'has_thread', 'questions', 'retention_months', 'retention_auto_delete',
    ])
    const extra = Object.keys(await payload()).filter((k) => !allowed.has(k))
    expect(extra, `unexpected keys on the respondent payload: ${extra.join(', ')}`).toEqual([])
  })
})
