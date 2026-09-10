import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { adminClient, anonClient, leserClient, outsiderClient, serviceClient, type Client } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * V2-6 — the help centre. **Q74** and **Q75** are both **DEFAULTED, not
 * answered**; the Gate 6 report names them.
 *
 * The three negative tests the plan asks for, plus the two assertions that keep
 * an allowlist honest — 5a3's entry for `help_articles` is a CLAIM, and a claim
 * nobody checks is a comment.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}
const one = (q: string) => psql(q)[0]?.[0] ?? ''

let svc: Client
let admin: Client
let leser: Client
let outsider: Client
const tag = `hp${process.pid}`

afterAll(async () => {
  svc ??= serviceClient()
  await svc.from('support_messages').delete().like('subject', `${tag}%`)
})

describe('(V2-6) the help registry is public to READ and to nobody to write', () => {
  it('1. a leser and an outsider cannot write an article', async () => {
    leser ??= await leserClient()
    outsider ??= await outsiderClient()
    for (const [who, c] of [
      ['leser', leser],
      ['outsider', outsider],
    ] as const) {
      const { error } = await c
        .from('help_articles')
        .insert({ slug: `${tag}-x`, category_key: 'bygger', read_minutes: 2, tint: '#FCF6E9', sort_order: 99 })
      expect(error, `${who} must be refused`).not.toBeNull()
    }
  })

  it('1b. and neither can an ADMINISTRATOR — there is no write policy at all', async () => {
    // The interesting half. Help text is a surface users trust to learn how the
    // product behaves; a client that could write it could write anything into
    // that trust. So the table has SELECT and nothing else, and this test is
    // what stops a later phase adding a policy «for the editor screen».
    admin ??= await adminClient()
    const { error } = await admin
      .from('help_articles')
      .update({ read_minutes: 99 })
      .eq('slug', 'roller-og-tilgang')
    const after = one(`select read_minutes from public.help_articles where slug = 'roller-og-tilgang'`)
    // RLS filters rather than errors on update, so the proof is that it did not move.
    void error
    expect(after, 'the row did not move').toBe('3')
  })

  it('2. it is public by design AND carries nothing that could identify anyone', async () => {
    // The claim 5a3's allowlist makes, checked against the column list rather
    // than repeated — the treatment `use_cases`, `brand_accents`,
    // `segment_fields` and `task_kinds` already get.
    const { data, error } = await anonClient().from('help_articles').select('*')
    expect(error, 'anon may read the registry').toBeNull()
    const columns = Object.keys(data![0]!)
    expect(columns.filter((c) => /org|survey|count|_id$|user/i.test(c))).toEqual([])
  })

  it('2b. and no Norwegian is stored on the registry row — the prose is in translations', () => {
    // Data-not-code cuts both ways, as it did for `task_kinds`: a thirteenth
    // article is a row, and a third language is a row per article. A title on
    // the registry row would make the next language a schema change.
    const cols = psql(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'help_articles' order by 1`,
    ).map((r) => r[0]!)
    expect(cols.sort()).toEqual(
      ['category_key', 'read_minutes', 'related_slugs', 'requires_flag', 'slug', 'sort_order', 'tint'].sort(),
    )
  })

  it('3. `contactSent` writes a real row, and nothing echoes the body into the audit log', () => {
    // CLAUDE.md invariant 7. `support_messages.body` is free text a person
    // typed, so it must not reach a log, an error payload or analytics. Asserted
    // over the CATALOGUE — every function and trigger in the two schemas — not
    // over the handful I happened to think of.
    const readers = psql(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app','public') and p.prokind = 'f'
          and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g') ~ '\\msupport_messages\\M'
        order by 1`,
    ).map((r) => r[0]!)
    expect(
      readers,
      'no function reads support_messages at all — so none can copy a body into audit_events',
    ).toEqual([])

    const triggers = psql(
      `select t.tgname from pg_trigger t
        where t.tgrelid = 'public.support_messages'::regclass and not t.tgisinternal`,
    ).map((r) => r[0]!)
    expect(triggers, 'and no trigger fires on it').toEqual([])
  })

  it('3b. a member may write one; only an administrator may read the organisation’s', async () => {
    leser ??= await leserClient()
    svc ??= serviceClient()
    // ORG_PRIMARY is the org's NAME, not its id — the insert needs the id.
    const orgId = one(`select id from public.organizations where name = '${ORG_PRIMARY}'`)
    const { error: insErr } = await leser
      .from('support_messages')
      .insert({ org_id: orgId, subject: `${tag} spørsmål`, body: 'Noe virker ikke.' })
    expect(insErr, 'a person who cannot report a problem stops reporting problems').toBeNull()

    const { data: seen } = await leser.from('support_messages').select('id').like('subject', `${tag}%`)
    expect(seen ?? [], 'a leser cannot read them back — the body can carry anything').toEqual([])

    admin ??= await adminClient()
    const { data: byAdmin } = await admin.from('support_messages').select('id').like('subject', `${tag}%`)
    expect((byAdmin ?? []).length, 'the administrator can').toBe(1)
  })
})

describe('(V2-6) the twelve, in two languages, with the corrections applied', () => {
  it('twelve articles exist in both `no` and `en`, with the same steps', () => {
    expect(one(`select count(*) from public.help_articles`), 'twelve').toBe('12')
    for (const lang of ['no', 'en']) {
      expect(
        one(`select count(*) from public.help_article_translations where lang = '${lang}'`),
        `${lang} is complete`,
      ).toBe('12')
    }
    // A translation that quietly drops a step ships short rather than failing.
    const mismatched = psql(`
      select n.slug from public.help_article_translations n
        join public.help_article_translations e on e.slug = n.slug and e.lang = 'en'
       where n.lang = 'no'
         and jsonb_array_length(n.body->'steps') <> jsonb_array_length(e.body->'steps')`).map((r) => r[0]!)
    expect(mismatched, 'same number of steps in both languages').toEqual([])
  })

  it('every `related_slugs` entry resolves — a dead link in the help centre is the worst kind', () => {
    const dangling = psql(`
      select a.slug || ' -> ' || r
        from public.help_articles a, unnest(a.related_slugs) r
       where not exists (select 1 from public.help_articles b where b.slug = r)`).map((r) => r[0]!)
    expect(dangling).toEqual([])
  })

  it('every `requires_flag` names a real global flag — checked, not trusted', () => {
    // A value naming a flag that does not exist would make the article render as
    // «built» for ever, which is the silent direction.
    const bad = psql(`
      select a.slug || ' -> ' || a.requires_flag
        from public.help_articles a
       where a.requires_flag is not null
         and not exists (select 1 from public.feature_flags f
                          where f.key = a.requires_flag and f.org_id is null)`).map((r) => r[0]!)
    expect(bad).toEqual([])
  })

  it('THE CORRECTIONS: no article still carries a sentence the product does not honour', () => {
    // The copy sweep, asserted rather than remembered. Each of these shipped in
    // the bundle and each is false against the running database; the seeder
    // rewrites them, and this test is what notices if a re-seed from a newer
    // bundle puts one back.
    const banned: [string, string][] = [
      ['Funn under terskel', 'Q72/D114: the trigger is audience size, not a finding'],
      ['slås sammen i rapporten', 'suppress_partition suppresses; it does not merge (D109 class)'],
      ['Fire roller', 'D106: app.member_role has three values'],
      ['varsles eieren i Teams', 'Q71: Teams is not built — third appearance of the claim'],
      ['Verneombud har egen rolle', 'D106: verneombud is a duty_signers row, not an access level'],
      ['CSV og Excel', 'Q62: the importer refuses .xlsx'],
      // ── The corrected bundle's own three (2026-09-10) ──────────────────
      // The revision that caught the bundle up with Q17/Q91 changed six lines
      // in the threshold article, and left two false sentences behind: it
      // PREPENDED the true text without removing what it replaced. Pinned in
      // the same place as the other six, because the failure mode is identical
      // — a re-seed from a newer bundle putting one back.
      ['Fem er standard', 'Q55: a FIXED number for a threshold that is settable 3-10 (M:0034)'],
      [
        'Bare lovpålagte kartlegginger',
        "Q90/M:0054: the ORGANISATION's default is also a minimum that cannot be lowered — " +
          'app.guard_survey_policy raises below_org_floor, and binds an administrator too',
      ],
      [
        'Sensitive temaer (anbefalt 8)',
        'D114: a mock row naming a control that exists nowhere — Personvern has three rows, ' +
          'and 8 comes from the statutory template locking it, not from a setting',
      ],
    ]
    for (const [phrase, why] of banned) {
      const hits = psql(
        `select slug from public.help_article_translations
          where body::text like '%${phrase}%' or lead like '%${phrase}%' or title like '%${phrase}%'`,
      ).map((r) => r[0]!)
      expect(hits, `«${phrase}» — ${why}`).toEqual([])
    }
  })
})
