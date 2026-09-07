import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  adminClient,
  anonClient,
  leserClient,
  outsiderClient,
  redaktorClient,
  serviceClient,
  type Client,
} from './clients'
import { ORG_OTHER, ORG_PRIMARY } from './personas'

/**
 * V2-2 — «Profil og avsender», the unblocked half: the accent registry, the two
 * organisation columns, the three logo slots and their bucket.
 *
 * STANDING QUESTION 1 shapes most of this file: what ELSE could refuse a write
 * to `organizations`? `orgs_upd` is administrator-only and has been since
 * M:0008, so a leser or redaktør writing `brand_accent` is refused by RLS
 * BEFORE anything branding-specific is reached. That means a role test here
 * proves the tenancy root and NOT the new columns — so the role assertions say
 * which control acted, and the column rules are proven where only they can act:
 * as an administrator, on their own organisation.
 *
 * STANDING QUESTION 4: everything this file writes is put back in `afterAll`,
 * because the demo organisation's branding is what the reference screenshots
 * and `verify:respondent` render.
 */
let svc: Client
let admin: Client
let redaktor: Client
let leser: Client
let outsider: Client
let anon: Client
let orgId: string
let otherOrgId: string

type Branding = {
  brand_accent: string | null
  brand_type: string | null
  logo_light: string | null
  logo_dark: string | null
  logo_icon: string | null
}
let before: Branding

beforeAll(async () => {
  svc = serviceClient()
  ;[admin, redaktor, leser, outsider] = await Promise.all([
    adminClient(),
    redaktorClient(),
    leserClient(),
    outsiderClient(),
  ])
  anon = anonClient()
  const { data: orgs } = await svc.from('organizations').select('id, name')
  orgId = orgs!.find((o) => o.name === ORG_PRIMARY)!.id
  otherOrgId = orgs!.find((o) => o.name === ORG_OTHER)!.id

  const { data } = await svc
    .from('organizations')
    .select('brand_accent, brand_type, logo_light, logo_dark, logo_icon')
    .eq('id', orgId)
    .single()
  before = data as Branding
})

afterAll(async () => {
  await svc.from('organizations').update(before).eq('id', orgId)
})

describe('the accent registry', () => {
  it('POSITIVE CONTROL: a signed-in member reads all five', async () => {
    // First, because every claim below about a public-by-design table is
    // vacuous over a table nobody can read.
    const { data, error } = await admin.from('brand_accents').select('key, hex, contrast')
    expect(error).toBeNull()
    expect(data!.map((a) => a.key).sort()).toEqual(
      ['fersken', 'lavendel', 'rav', 'salvie', 'varm_gul'].sort(),
    )
  })

  it('carries the design’s own hexes and contrast figures, not approximations', async () => {
    // V2:4898 verbatim. A swatch whose hex drifted would still render as a
    // colour, so nothing else in the system would notice.
    const { data } = await svc.from('brand_accents').select('key, hex, contrast')
    const byKey = Object.fromEntries(data!.map((a) => [a.key, a]))
    expect(byKey.varm_gul).toMatchObject({ hex: '#F5C64A', contrast: '11,3:1' })
    expect(byKey.rav).toMatchObject({ hex: '#E8A33D', contrast: '8,4:1' })
    expect(byKey.salvie).toMatchObject({ hex: '#A8D5D2', contrast: '11,3:1' })
    expect(byKey.fersken).toMatchObject({ hex: '#FBD5C4', contrast: '13,3:1' })
    expect(byKey.lavendel).toMatchObject({ hex: '#EDE9F7', contrast: '15,2:1' })
  })

  it('is public by design AND carries nothing that could identify anyone', async () => {
    // The 5a3 allowlist claims this table has no org id, no survey id and no
    // count. `use_cases` proves the same claim the same way — a reason in an
    // allowlist is an assertion, and an assertion nobody checks is a comment.
    const { data, error } = await anon.from('brand_accents').select('*')
    expect(error, 'anon may read the registry').toBeNull()
    const columns = Object.keys(data![0]!)
    expect(columns.filter((c) => /org|survey|count|_id$|user/i.test(c))).toEqual([])
  })

  it('refuses a hex that is not a hex', async () => {
    // The CHECK, exercised through the service role deliberately: this is a
    // shape rule on seeded data, not an access rule, and the seeder is the only
    // writer there will ever be.
    const { error } = await svc
      .from('brand_accents')
      .insert({ key: 'ugyldig', hex: 'nesten-gul', contrast: '9:1' })
    expect(error?.message ?? '').toMatch(/check|constraint|hex/i)
  })
})

describe('the organisation’s branding columns', () => {
  it('an administrator sets an accent and a type pair', async () => {
    const { error } = await admin
      .from('organizations')
      .update({ brand_accent: 'salvie', brand_type: 'bricolage' })
      .eq('id', orgId)
    expect(error).toBeNull()

    const { data } = await svc
      .from('organizations')
      .select('brand_accent, brand_type')
      .eq('id', orgId)
      .single()
    expect(data).toMatchObject({ brand_accent: 'salvie', brand_type: 'bricolage' })
  })

  it('refuses an accent that is not in the registry — a FOREIGN KEY, not a CHECK', async () => {
    // The distinction is the decision: a CHECK would make adding an accent a
    // migration. So the refusal must come from the FK, and the message says so.
    const { error } = await admin
      .from('organizations')
      .update({ brand_accent: 'neon' })
      .eq('id', orgId)
    expect(error?.message ?? '').toMatch(/foreign key|violates|brand_accent/i)
  })

  it('refuses a type pair the app shell has no font for', async () => {
    // A row naming an unloaded font falls back silently — it LOOKS like it
    // worked, which is why this one is a CHECK and not a registry.
    const { error } = await admin
      .from('organizations')
      .update({ brand_type: 'comic' })
      .eq('id', orgId)
    expect(error?.message ?? '').toMatch(/check|constraint|brand_type/i)
  })

  it('keeps NULL distinct from the row whose hex equals the default', async () => {
    // «Never chose» and «chose varm gul» are different facts, and the column
    // comment says so. If NULL were normalised to `varm_gul` on write, an
    // organisation could never return to the product default.
    const { error } = await admin
      .from('organizations')
      .update({ brand_accent: null })
      .eq('id', orgId)
    expect(error).toBeNull()
    const { data } = await svc
      .from('organizations')
      .select('brand_accent')
      .eq('id', orgId)
      .single()
    expect(data!.brand_accent).toBeNull()
  })
})

describe('who may change branding', () => {
  /**
   * Each of these names the control that actually acts. `orgs_upd` is
   * administrator-only, so RLS refuses a leser and a redaktør before anything
   * branding-specific runs — and RLS refuses by MATCHING NO ROWS rather than by
   * erroring, which is Gate 2b's distinction and the V1-1 mistake. So the
   * assertion is on the VALUE not having moved, not on an error object.
   */
  const unchanged = async (client: Client, who: string) => {
    await svc.from('organizations').update({ brand_accent: 'rav' }).eq('id', orgId)
    await client.from('organizations').update({ brand_accent: 'lavendel' }).eq('id', orgId)
    const { data } = await svc
      .from('organizations')
      .select('brand_accent')
      .eq('id', orgId)
      .single()
    expect(data!.brand_accent, `${who} must not change branding`).toBe('rav')
  }

  it('a leser cannot — RLS filters the row, it does not error', () => unchanged(leser, 'a leser'))

  it('a redaktør cannot either — branding is organisation-wide', () =>
    unchanged(redaktor, 'a redaktør'))

  it('an administrator of ANOTHER organisation cannot', async () => {
    await unchanged(outsider, "another organisation's administrator")

    // POSITIVE CONTROL on the same client: the outsider IS an administrator,
    // in their own organisation. Without this, the assertion above would pass
    // identically if the outsider's session were simply broken.
    const { error } = await outsider
      .from('organizations')
      .update({ brand_accent: 'fersken' })
      .eq('id', otherOrgId)
    expect(error, 'the outsider is a working administrator at home').toBeNull()
    await svc.from('organizations').update({ brand_accent: null }).eq('id', otherOrgId)
  })
})

describe('branding changes are audited', () => {
  it('records the accent moving, with the actor', async () => {
    await svc.from('organizations').update({ brand_accent: null }).eq('id', orgId)

    // STANDING QUESTION 2 AND 4, CAUGHT BY MUTATION RATHER THAN BY READING.
    // Written without this cutoff, the assertion selected the newest
    // `branding.change` row for the organisation — and every previous RUN of
    // this file left one behind with exactly these values, because the test
    // does the same thing each time. Dropping the trigger altogether left all
    // nineteen tests green. A row an earlier run wrote is indistinguishable
    // from a row this run wrote unless the test says when it started.
    const since = new Date().toISOString()

    const { error } = await admin
      .from('organizations')
      .update({ brand_accent: 'fersken' })
      .eq('id', orgId)
    expect(error).toBeNull()

    const { data } = await svc
      .from('audit_events')
      .select('action, meta, actor_user_id, created_at')
      .eq('org_id', orgId)
      .eq('action', 'branding.change')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
    expect(data!.length, 'THIS change is on the log').toBeGreaterThan(0)
    expect(data![0]!.meta).toMatchObject({ accent_from: null, accent_to: 'fersken' })
    expect(data![0]!.actor_user_id, 'the actor, not the service role').not.toBeNull()
  })

  it('does NOT fire on an unrelated organisation edit', async () => {
    // The trigger compares the columns that carry meaning rather than firing on
    // "an UPDATE happened" — CLAUDE.md's immutability rule, same shape. A log
    // that records every settings save is a log nobody reads.
    const since = new Date().toISOString()

    await admin.from('organizations').update({ contact_name: 'Tuva Berg' }).eq('id', orgId)

    const { count: after } = await svc
      .from('audit_events')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('action', 'branding.change')
      .gte('created_at', since)
    expect(after, 'no branding row for a contact-name edit').toBe(0)
  })
})

describe('the org-logos bucket', () => {
  const path = (org: string) => `${org}/logo_light.png`
  const png = () =>
    new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
      type: 'image/png',
    })

  afterAll(async () => {
    await svc.storage.from('org-logos').remove([path(orgId), path(otherOrgId)])
  })

  it('is PRIVATE — a logo is not secret, but the objects are keyed by org id', async () => {
    const { data } = await svc.from('storage.buckets' as never).select('*')
    // The client cannot read storage.buckets, so this goes through the storage
    // API, which is the surface an attacker would use anyway.
    void data
    const { data: buckets } = await svc.storage.listBuckets()
    const bucket = buckets!.find((b) => b.id === 'org-logos')
    expect(bucket, 'the bucket exists').toBeDefined()
    expect(bucket!.public, 'public would make every customer id walkable').toBe(false)
  })

  it('an administrator uploads into their own organisation’s prefix', async () => {
    const { error } = await admin.storage
      .from('org-logos')
      .upload(path(orgId), png(), { upsert: true, contentType: 'image/png' })
    expect(error).toBeNull()
  })

  it('a redaktør cannot — writes are narrower here than for report exports', async () => {
    const { error } = await redaktor.storage
      .from('org-logos')
      .upload(`${orgId}/logo_dark.png`, png(), { upsert: true, contentType: 'image/png' })
    expect(error, 'storage refuses with an error, unlike an RLS-filtered update').not.toBeNull()
  })

  it('an administrator cannot write into another organisation’s prefix', async () => {
    const { error } = await outsider.storage
      .from('org-logos')
      .upload(path(orgId), png(), { upsert: true, contentType: 'image/png' })
    expect(error, 'cross-org write must be refused').not.toBeNull()

    // POSITIVE CONTROL: the same client, its own prefix. Without it this would
    // pass if the outsider simply could not upload anything.
    const { error: home } = await outsider.storage
      .from('org-logos')
      .upload(path(otherOrgId), png(), { upsert: true, contentType: 'image/png' })
    expect(home, 'the outsider can upload at home').toBeNull()
  })

  it('a member of another organisation cannot READ an object either', async () => {
    const { data, error } = await outsider.storage.from('org-logos').download(path(orgId))
    expect(data === null || error !== null, 'cross-org read must not return bytes').toBe(true)
  })

  it('anon cannot read the object at all — reads go through a signed URL', async () => {
    const { data, error } = await anon.storage.from('org-logos').download(path(orgId))
    expect(data === null || error !== null).toBe(true)
  })
})
