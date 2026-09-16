import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serviceClient, type Client } from './clients'
import { createOrg, createSurvey, dropOrg } from './factories'
import { OPTION_DEFAULTS, OPTION_KEYS, OPTION_ROWS, optionsOf, runModeAllowed } from '../../lib/org/options'

/**
 * G2 — «Alternativer» governs what the product does, and the database is where
 * that is true.
 *
 * ── WHY THE GUARD IS NOT IN THE SERVER ACTION ─────────────────────────────
 *
 * Tor's test for a toggle: «a feature that is OFF but still reachable by URL is
 * a switch that describes rather than controls.» `/undersokelser/<id>/live`
 * renders from `surveys.run_mode`, so the honest way to empty the route is to
 * make the STATE unreachable rather than to add a second gate that has to agree
 * with the first one. Tests 3-6 are over the column, through the SERVICE role,
 * so they prove the refusal survives a caller RLS does not filter — which is
 * what «not even psql» means.
 *
 * ── AND THE FINDING THAT REFRAMED THE PHASE ───────────────────────────────
 *
 * Test 1 is the one worth reading. `organizations.options` had five switches
 * and exactly ONE reader (`sso`); the other four were stored, audited and drawn
 * as ON while nothing in the product or the catalogue named them. A switch
 * whose state nothing READS is not a setting either, and it is the worse half —
 * it survives every test that checks the value round-trips. So the registry
 * carries the enforcement point, and this asserts the enforcement point EXISTS
 * in the source rather than trusting the string beside it.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

const TAG = `g2-opts-${randomUUID().slice(0, 8)}`
const ORG = `Valg ${TAG}`
const svc: Client = serviceClient()

let orgId = ''
let surveyId = ''

async function setOptions(patch: Record<string, boolean>) {
  const { data } = await svc.from('organizations').select('options').eq('id', orgId).single()
  const next = { ...((data as { options: Record<string, boolean> }).options), ...patch }
  return svc.from('organizations').update({ options: next } as never).eq('id', orgId)
}

beforeAll(async () => {
  const org = await createOrg(ORG)
  orgId = org.id
  const s = await createSurvey(orgId, `Modus ${TAG}`, [{ type: 'scale', text: 'Et spørsmål' }])
  surveyId = s.id
}, 120_000)

afterAll(async () => {
  await dropOrg(ORG, svc)
})

describe('G2 — every switch names the place the product reads it', () => {
  it('1. every ENFORCED key has a reader in the source, read back from the files', () => {
    // Derived, not listed: the registry says `path:symbol` and this opens the
    // path. CLAUDE.md's «a grant is a fact about the catalogue and must be read
    // back from the catalogue», aimed at a setting rather than at a privilege —
    // the only form of the rule that does not depend on remembering.
    const missing: string[] = []
    for (const row of OPTION_ROWS) {
      if (row.enforcedAt === null) continue
      const [path, symbol] = row.enforcedAt.split(/:(?=[^:]*$)/)
      const hits = execFileSync(
        'bash',
        ['-c', `ls ${JSON.stringify(path!)}* 2>/dev/null | head -1`],
        { encoding: 'utf8' },
      ).trim()
      if (!hits) {
        missing.push(`${row.key}: no such file ${path}`)
        continue
      }
      const body = execFileSync('cat', [hits], { encoding: 'utf8' })
      if (!body.includes(symbol!)) missing.push(`${row.key}: ${hits} has no ${symbol}`)
    }
    expect(missing, 'an enforced option names a reader that is not there').toEqual([])
  })

  it('2. and every key is in the registry exactly once, with a reason when unenforced', () => {
    expect(OPTION_ROWS.map((r) => r.key).sort()).toEqual([...OPTION_KEYS].sort())
    expect(new Set(OPTION_ROWS.map((r) => r.key)).size).toBe(OPTION_KEYS.length)
    const silent = OPTION_ROWS.filter((r) => r.enforcedAt === null && !r.why).map((r) => r.key)
    expect(silent, 'an unenforced switch must say why, on the screen and here').toEqual([])
  })
})

describe('G2 — a disallowed run mode cannot be reached, even from psql', () => {
  it('3. the column default IS the registry, key for key and value for value', () => {
    /*
      NOT «every organisation has the keys», which is what this asserted first
      and which was the wrong property twice over: it is order-dependent (any
      test that writes a whole `options` object leaves a counterexample behind)
      and it measures a one-off event — the backfill — long after it ran.

      The stable statement is the CATALOGUE's: the column default carries every
      registry key at the registry's value. That is what a new organisation
      gets, and `optionsOf` reads an absent key as OFF, so a key missing here is
      a shipped feature silently disabled for everyone created after it.
    */
    const def = psql(
      `select column_default from information_schema.columns
        where table_schema='public' and table_name='organizations' and column_name='options'`,
    )[0]![0]!
    // `jsonb_build_object('tuva', true, 'quiz', true, …)` — parsed into pairs
    // rather than string-matched, so a key present with the WRONG value fails.
    const pairs = new Map(
      [...def.matchAll(/'([a-z_]+)',\s*(true|false)/g)].map((m) => [m[1]!, m[2] === 'true']),
    )
    expect([...pairs.keys()].sort(), 'the column default and the registry disagree')
      .toEqual([...OPTION_KEYS].sort())
    expect(Object.fromEntries([...pairs].sort()), 'a default value differs from the registry')
      .toEqual(Object.fromEntries(Object.entries(OPTION_DEFAULTS).sort()))
  })

  it('3b. and the BACKFILL supplies the new keys without overwriting a choice', async () => {
    // `M:0124` is `jsonb_build_object(new keys) || options`, in that order: the
    // stored object wins. Written the other way round it would reset every
    // switch anyone had ever set, which is a migration that changes behaviour
    // while claiming to add a setting. Asserted by REPLAYING the expression
    // rather than by reading the file.
    /* `brand_mail` and not `sso` as the «stored choice» to preserve: turning
       SSO on is refused by `organizations_guard_sso` unless an administrator is
       marked break-glass (D82), so the first draft of this fixture failed on a
       guard that has nothing to do with what it was testing. A fixture that
       trips an unrelated rule reports a defect in the rule it was aimed at. */
    const wrote = await svc
      .from('organizations')
      .update({ options: { quiz: false, brand_mail: false } } as never)
      .eq('id', orgId)
    expect(wrote.error, 'the fixture write itself was refused').toBeNull()
    const back = psql(
      `select jsonb_build_object('tuva', true, 'quiz', true, 'live', true, 'klarsprak', true)
              || options
         from public.organizations where id = '${orgId}'`,
    )[0]![0]!
    const got = JSON.parse(back) as Record<string, boolean>
    expect(got.quiz, 'the backfill overwrote a stored choice').toBe(false)
    expect(got.brand_mail, 'the backfill dropped a stored choice').toBe(false)
    expect(got.tuva, 'the backfill did not supply a missing key').toBe(true)

    // Put the row back, or the tests below start from a state they did not set.
    await svc
      .from('organizations')
      .update({ options: { ...OPTION_DEFAULTS } } as never)
      .eq('id', orgId)
  })

  it('4. quiz is refused at the COLUMN when the organisation has it off', async () => {
    await setOptions({ quiz: false })
    const { error } = await svc
      .from('surveys')
      .update({ run_mode: 'quiz', anonymity: 'named' } as never)
      .eq('id', surveyId)
    expect(error?.message ?? '', 'a disallowed mode was written').toMatch(/run_mode_not_allowed/)

    // POSITIVE CONTROL: with it on, the same write succeeds. Without this the
    // assertion above would pass against a survey that simply cannot be a quiz.
    await setOptions({ quiz: true })
    const ok = await svc
      .from('surveys')
      .update({ run_mode: 'quiz', anonymity: 'named' } as never)
      .eq('id', surveyId)
    expect(ok.error, 'POSITIVE CONTROL: an allowed mode is accepted').toBeNull()
  })

  it('5. and turning the mode OFF is refused while a survey is still in it', async () => {
    // The other half of «off means off». Without it the mode is disallowed and
    // its route still renders — a feature that is off and reachable by URL.
    const refused = await setOptions({ quiz: false })
    expect(refused.error?.message ?? '', 'the mode was disallowed under a live survey')
      .toMatch(/run_mode_in_use/)

    await svc.from('surveys').update({ run_mode: 'standard' } as never).eq('id', surveyId)
    const allowed = await setOptions({ quiz: false })
    expect(allowed.error, 'nothing was using it, so it must be allowed off').toBeNull()
  })

  it('6. standard is never gated — a survey must be runnable', async () => {
    await setOptions({ live: false, quiz: false })
    const { error } = await svc
      .from('surveys')
      .update({ run_mode: 'standard' } as never)
      .eq('id', surveyId)
    expect(error).toBeNull()
    expect(runModeAllowed('standard', {})).toBe(true)
    expect(runModeAllowed('live', {})).toBe(false)
    expect(runModeAllowed('live', { live: true })).toBe(true)
  })

  it('7. an org that never had the mode on can rewrite options freely', async () => {
    // The guard fires on the allowed -> disallowed EDGE, not on the state. A
    // rule written over the state would refuse an unrelated `options` write for
    // an organisation that has had live off all along — and `options` is
    // rewritten by every other switch on the screen.
    await setOptions({ live: false })
    const { error } = await setOptions({ brand_mail: false })
    expect(error, 'an unrelated option write was refused').toBeNull()
  })

  it('7b. a PARTIAL write updates the keys it names and loses none — fix pass', async () => {
    /*
      `verify:roundtrip` found this, on the SSO case, which has nothing to do
      with run modes. The gate writes the whole column — `set options =
      '{"sso":true}'` — which drops the other eight keys; the reader treats an
      absent key as OFF, so the guard correctly saw «live and quiz disallowed»
      and correctly refused, on an organisation with surveys in both.

      The guard was right and the SHAPE was wrong. `app.merge_org_options`
      (`M:0125`) makes a whole-object write mean what every caller intends: the
      keys it names change, the rest stand. Fixing the column rather than the
      callers, because a list of callers is an enumeration.

      Its trigger is named `organizations_aa_merge_options` because BEFORE
      triggers fire in NAME order and both guards read `new.options` — the SSO
      guard reading a dropped key as «turning it off» would have bypassed the
      break-glass rule with a partial write.
    */
    await svc.from('organizations').update({ options: { ...OPTION_DEFAULTS } } as never).eq('id', orgId)
    const wrote = await svc
      .from('organizations')
      .update({ options: { brand_mail: false } } as never)
      .eq('id', orgId)
    expect(wrote.error, 'a partial write was refused').toBeNull()

    const { data } = await svc.from('organizations').select('options').eq('id', orgId).single()
    const got = (data as { options: Record<string, boolean> }).options
    expect(Object.keys(got).sort(), 'a partial write dropped keys').toEqual([...OPTION_KEYS].sort())
    expect(got.brand_mail, 'the named key did not change').toBe(false)
    expect(got.tuva, 'an unnamed key did not stand').toBe(true)
  })

  it('8. the guard is scoped to the column the rule is about', () => {
    // Q137: `before insert or update` over everything also refuses the writes
    // the system makes on its own behalf. Read back from the catalogue rather
    // than from the migration text.
    const defs = psql(
      `select tgname, pg_get_triggerdef(oid) from pg_trigger
        where tgrelid in ('public.surveys'::regclass, 'public.organizations'::regclass)
          and tgname in ('surveys_run_mode_allowed', 'organizations_mode_in_use')
        order by tgname`,
    )
    expect(defs.length, 'both triggers exist').toBe(2)
    // And the merge runs FIRST, which is a fact about the NAME.
    const order = psql(
      `select tgname from pg_trigger where tgrelid = 'public.organizations'::regclass
         and not tgisinternal order by tgname`,
    ).map((r) => r[0]!)
    expect(
      order.indexOf('organizations_aa_merge_options'),
      'the merge must fire before every guard that reads new.options',
    ).toBeLessThan(order.indexOf('organizations_guard_sso'))
    expect(order.indexOf('organizations_aa_merge_options'))
      .toBeLessThan(order.indexOf('organizations_mode_in_use'))
    expect(defs.find((d) => d[0] === 'surveys_run_mode_allowed')![1]).toMatch(/UPDATE OF run_mode/)
    expect(defs.find((d) => d[0] === 'organizations_mode_in_use')![1]).toMatch(/UPDATE OF options/)
  })
})

describe("G3 — Tor's split: two wired, two removed", () => {
  it('9. `reminders` OFF stops the sweep producing anything for that organisation', async () => {
    /*
      THE READER THE SWITCH NEVER HAD (D208). Asserted through
      `app.enqueue_reminders` itself rather than by grepping its body: that
      function is what the cron job runs, and a source assertion would pass
      against a body that reads the key and then ignores it.

      The fixture builds the whole precondition — an open round, an invitation
      sent long enough ago, a schedule with a reminder day — so the ONLY thing
      between it and a reminder is the switch.
    */
    // `createSurvey` makes no round, so the fixture makes one. Stated rather
    // than assumed: the first draft read `survey_rounds` for a survey that had
    // none and failed on the empty result, not on the rule.
    const round = psql(
      `insert into public.survey_rounds (survey_id, round_no, status, question_snapshot)
       values ('${surveyId}', 1, 'open', '[]'::jsonb) returning id`,
    )[0]![0]!
    // A plain insert: `schedules` has no unique constraint on `survey_id`, so
    // an `on conflict (survey_id)` clause is a syntax error rather than an
    // upsert. Measured from `pg_constraint` after the first draft failed on it.
    psql(
      `insert into public.schedules (survey_id, cadence, reminder_after_days)
       values ('${surveyId}', 'once', 2)`,
    )
    psql(
      `insert into public.survey_invitations (round_id, email, token_hash, channel, sent_at)
       values ('${round}', 'paaminn-${TAG}@example.test',
               encode(extensions.digest('r-${TAG}', 'sha256'), 'hex'),
               'email', now() - interval '9 days')`,
    )

    await setOptions({ reminders: false })
    const off = Number(psql(`select app.enqueue_reminders()`)[0]![0])

    await setOptions({ reminders: true })
    const on = Number(psql(`select app.enqueue_reminders()`)[0]![0])

    // POSITIVE CONTROL in the same test: without it, `off === 0` would pass
    // against a sweep that produces nothing for any reason at all.
    expect(on, 'the fixture never produced a reminder, so «0 when off» proves nothing')
      .toBeGreaterThan(0)
    expect(off, 'a reminder was produced for an organisation that turned them off').toBe(0)
  })

  it('10. the two REMOVED keys are unwritable, and the stored values are left alone', async () => {
    /*
      Removal is STRUCTURAL rather than cosmetic: `OPTION_KEYS` no longer names
      them, `setOption`'s Zod enum derives from that list, and `optionsOf`
      builds its object from it — so the key cannot be written, read or
      rendered, without a bulk UPDATE on production.

      And the stored value STAYS. `audit_events` already holds every
      `option.change` anyone made to these two, and such a row is interpretable
      only while the key it names is still visible in the column.
    */
    expect(OPTION_KEYS as readonly string[]).not.toContain('weekly_digest')
    expect(OPTION_KEYS as readonly string[]).not.toContain('allow_self_serve')
    expect(Object.keys(optionsOf({ weekly_digest: true }))).not.toContain('weekly_digest')

    // The column default no longer supplies them to a NEW organisation…
    const def = psql(
      `select column_default from information_schema.columns
        where table_schema='public' and table_name='organizations' and column_name='options'`,
    )[0]![0]!
    expect(def).not.toContain('weekly_digest')
    expect(def).not.toContain('allow_self_serve')

    // …and an EXISTING row that carries one is untouched by every write since.
    await svc
      .from('organizations')
      .update({ options: { weekly_digest: true } } as never)
      .eq('id', orgId)
    await svc.from('organizations').update({ options: { tuva: false } } as never).eq('id', orgId)
    const { data } = await svc.from('organizations').select('options').eq('id', orgId).single()
    const got = (data as { options: Record<string, boolean> }).options
    expect(got.weekly_digest, 'a stored value for a removed key was dropped').toBe(true)
    expect(got.tuva).toBe(false)
    await setOptions({ ...OPTION_DEFAULTS })
  })
})
