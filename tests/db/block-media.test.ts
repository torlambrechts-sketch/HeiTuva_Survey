import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { anonClient, outsiderClient, serviceClient } from './clients'

/**
 * V7-3c — the `survey-media` bucket, read back from the catalogue.
 *
 * ── WHY THIS IS A CATALOGUE READ AND NOT A BEHAVIOUR TEST ─────────────────
 *
 * «A grant is a fact about the catalogue and must be read back from the
 * catalogue» — CLAUDE.md's row 9, whose whole point is that a spelling has to
 * be recalled at the moment of writing and a measurement does not. A bucket's
 * MIME allowlist, its privacy flag and the predicate on its four policies are
 * the same kind of fact: each one is a line somebody typed once, and each one
 * is silently wrong in the direction that admits more than it should.
 *
 * So the properties here are asked of `storage.buckets` and `pg_policies`
 * rather than of the migration text, and the SVG refusal is asserted from the
 * database's side rather than from the `accept` attribute the browser may
 * ignore.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function psql(query: string): string[][] {
  const out = execFileSync('psql', [DB_URL, '-tAF\t', '-c', query], { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((r) => r.split('\t'))
}

describe('V7-3c — the survey-media bucket', () => {
  it('1. the bucket is PRIVATE, and that is the whole reason a route exists', () => {
    /* A public bucket makes every object readable by anyone who guesses or is
       given the URL, forever, with no expiry and no token check. The respondent
       reads the picture through `/s/<token>/media/<id>`, which re-resolves the
       token on every request. */
    const [row] = psql(
      "select public::text, file_size_limit::text from storage.buckets where id = 'survey-media'",
    )
    expect(row, 'survey-media bucket is missing').toBeDefined()
    expect(row![0]).toBe('false')
    expect(row![1]).toBe('2097152')
  })

  it('2. SVG IS REFUSED BY THE BUCKET — not merely by the `accept` attribute', () => {
    /* `org-logos` permits `image/svg+xml`, because a logo is chosen by an
       administrator for a manager-facing screen. An SVG is a document that can
       carry script and these objects are rendered to RESPONDENTS, so the
       allowlist is raster only. Read off the bucket, because `accept` is a hint
       a browser may ignore and a Zod check is one caller. */
    const [row] = psql(
      "select coalesce(array_to_string(allowed_mime_types, ','), '') from storage.buckets where id = 'survey-media'",
    )
    const types = (row![0] ?? '').split(',').filter(Boolean).sort()
    expect(types).toEqual(['image/jpeg', 'image/png', 'image/webp'])
    expect(types).not.toContain('image/svg+xml')
    // And the logo bucket still allows it, so this is a DECISION rather than a
    // property of the product — the difference is the audience.
    const [logo] = psql(
      "select coalesce(array_to_string(allowed_mime_types, ','), '') from storage.buckets where id = 'org-logos'",
    )
    expect(logo![0]).toContain('image/svg+xml')
  })

  it('3. all FOUR operations are policed, and every one resolves can_edit_survey', () => {
    /* An unpoliced bucket is an unpoliced table (invariant 3). Derived over
       `pg_policies` rather than asserted as a list of four names, and the
       PREDICATE is checked too: a policy that exists and says `true` is the
       shape that reads as protection and is none. */
    const rows = psql(`
      select cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '')
        from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname like 'svmedia_%'
       order by cmd`)
    expect(rows.map((r) => r[0]).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE'])
    for (const [cmd, predicate] of rows) {
      expect(predicate, `${cmd} must name the bucket`).toContain("'survey-media'")
      expect(predicate, `${cmd} must resolve can_edit_survey`).toContain('can_edit_survey')
    }
  })

  it('4. the SURVEY ID is the first path segment, which is what makes 3 a real rule', () => {
    /* `docs/v7/02-blocks-measurement.md § 4` recommended an OPAQUE key so no
       organisation identifier could reach a respondent. The CSP made a route
       necessary anyway (`img-src 'self'`), and under a route no storage path
       reaches any client at all — so the requirement is met at the URL a
       browser holds, and the storage path is free to carry the survey id.

       That is not a relaxation: an opaque key would leave these four policies
       with nothing to scope by except a bet that a uuid is unguessable. */
    const rows = psql(`
      select policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '')
        from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname like 'svmedia_%'`)
    for (const [name, predicate] of rows) {
      expect(predicate, `${name} must read the first path segment`).toContain(
        'storage.foldername(name))[1]',
      )
    }
  })

  it('5. `media_key` says who writes it, and names the two routes that read it', () => {
    /* CLAUDE.md's «ask WHO WRITES THIS COLUMN» — answered in M:0128 rather
       than left as M:0127's «nothing writes it yet». A stale «no writer» note
       is how the next reader concludes the feature is unbuilt, so the comment
       is asserted rather than trusted. */
    const [row] = psql(`
      select col_description('public.survey_blocks'::regclass, a.attnum)
        from pg_attribute a
       where a.attrelid = 'public.survey_blocks'::regclass and a.attname = 'media_key'`)
    const comment = row![0] ?? ''
    expect(comment).toContain('uploadBlockMedia')
    expect(comment).toContain('/s/<token>/media/<block_id>')
    expect(comment).toContain('/api/block-media/')
  })

  it('6. AN ANON CLIENT CANNOT READ A REAL OBJECT — proven against one that exists', async () => {
    /* THE FIRST VERSION OF THIS TEST COULD NOT FAIL. It read
       `information_schema.role_table_grants`, looped over whatever came back
       and asserted that each row matched the pattern it had just filtered on —
       a declaration wearing a guard's clothes, which is G4's own `TUVA_SUPPRESSED`
       lesson arriving one phase later.

       It is behavioural now, and it UPLOADS AN OBJECT FIRST. `download` on a
       missing key fails for every caller, so a refusal measured against an
       empty bucket proves nothing at all — «green for something that
       structurally could not be seen», with the object as the thing unseen.
       The upload goes through the SERVICE role, which is the only caller
       outside a session; the refusal is measured with the anon key, which is
       what a respondent's browser would hold if it ever held one. */
    const key = `${randomUUID()}/${randomUUID()}.png`
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    const up = await serviceClient()
      .storage.from('survey-media')
      .upload(key, bytes, { contentType: 'image/png' })
    expect(up.error, `the fixture object must exist: ${up.error?.message}`).toBeNull()

    try {
      // The service role can read it — so the refusal below is about the
      // CALLER and not about the object.
      const mine = await serviceClient().storage.from('survey-media').download(key)
      expect(mine.error).toBeNull()
      expect(mine.data, 'the object is readable by the role that signs for it').toBeTruthy()

      const theirs = await anonClient().storage.from('survey-media').download(key)
      expect(theirs.data, 'anon must not read a survey-media object').toBeNull()
      expect(theirs.error, 'anon must be refused, not served empty').not.toBeNull()

      // An authenticated member of ANOTHER organisation is refused too, by the
      // same predicate — `can_edit_survey` over a survey they cannot see.
      // `outsiderClient()` is async where `anonClient()` is not — a real signed
      // session has to be obtained before it can be used.
      const outsider = await (await outsiderClient()).storage.from('survey-media').download(key)
      expect(outsider.data, 'an outsider must not read it either').toBeNull()
    } finally {
      await serviceClient().storage.from('survey-media').remove([key])
    }
  })
})
