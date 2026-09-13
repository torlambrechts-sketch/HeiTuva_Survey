import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ADMIN_ERROR_KEY, type AdminError } from '../../app/(app)/administrasjon/types'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

/**
 * The walk of 2026-09-12, guarded.
 *
 * Each of these is a defect that shipped, was found by DRIVING the product, and
 * would not have been caught by any gate. The tests exist so the fix cannot be
 * undone silently — which is the only part of a walk that lasts.
 */
const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const psql = (q: string) =>
  execFileSync('psql', [DB_URL, '-tAF\t', '-c', q], { encoding: 'utf8' }).trim()
const hash = (raw: string) => createHash('sha256').update(raw).digest('hex')

describe('W-03 — the token says whether a reply can reach the person holding it', () => {
  it('a share link has no thread, so the surface must not promise an answer', () => {
    const got = psql(
      `select public.get_survey_for_token('demo-share-link-token-for-local-verification')->>'has_thread'`,
    )
    expect(got).toBe('false')
  })

  it('an invitation has one', () => {
    const raw = `walk-fix-${Date.now()}`
    psql(`insert into survey_invitations (round_id,email,name,lang,channel,token_hash,expires_at)
          select r.id,'walkfix@nordiskstudio.test','Walk Fix','no','email','${hash(raw)}',now()+interval '1 day'
          from survey_rounds r
          join surveys s on s.id = r.survey_id
          where s.title = 'Arbeidsmiljø — månedlig'
          order by r.round_no desc limit 1`)
    expect(psql(`select public.get_survey_for_token('${raw}')->>'has_thread'`)).toBe('true')
  })

  it('the key is present, so `has_thread` is never silently absent', () => {
    // `?? false` in the page is the safe default, but a payload that stopped
    // carrying the key would quietly stop promising a reply to invited people
    // too — a regression nobody would see, because it fails toward silence.
    const keys = psql(
      `select jsonb_object_keys(public.get_survey_for_token('demo-share-link-token-for-local-verification'))`,
    ).split('\n')
    expect(keys).toContain('has_thread')
  })

  it('both languages carry the sentence, and it promises nothing', () => {
    for (const [lang, set] of [['no', no], ['en', en]] as const) {
      const line = (set as { respondent: Record<string, string> }).respondent.qcNoReply ?? ''
      expect(line, lang).toBeTruthy()
      // The whole point: it must not say a manager can answer.
      expect(line.toLowerCase(), lang).not.toMatch(/lederen kan svare|manager can reply/)
    }
  })
})

describe('W-05 — a group a sent round references refuses deletion, by name', () => {
  it('the database refuses it with foreign_key_violation at COMMIT', () => {
    // V2-3b made this FK NO ACTION DEFERRABLE INITIALLY DEFERRED on purpose: the
    // row deletes at statement time and the constraint refuses it when the
    // transaction closes. `deleteGroup` maps 23503 to `group_in_use` so the
    // administrator is not told to retry something that can never succeed.
    let code = ''
    try {
      psql(`begin;
            delete from groups where id = (select group_id from survey_invitations where group_id is not null limit 1);
            commit;`)
    } catch (e) {
      code = String((e as { stderr?: string }).stderr ?? e)
    }
    expect(code).toMatch(/violates foreign key constraint/)
    expect(code).toMatch(/survey_invitations_group_id_fkey/)
  })

  it('every AdminError has copy in both languages — including the new one', () => {
    // The map exists so a refusal cannot be added without noticing it has no
    // words. That guarantee is only real if something checks the words exist.
    for (const key of Object.keys(ADMIN_ERROR_KEY) as AdminError[]) {
      const messageKey = ADMIN_ERROR_KEY[key]
      for (const [lang, set] of [['no', no], ['en', en]] as const) {
        const admin = (set as { admin: Record<string, string> }).admin
        expect(admin[messageKey], `${lang}.admin.${messageKey} (for ${key})`).toBeTruthy()
      }
    }
    expect(ADMIN_ERROR_KEY.group_in_use).toBe('errGroupInUse')
  })
})

describe('W-01/W-02 — the property, not the two instances', () => {
  it("no 'use server' module exports anything that is not an async function", async () => {
    // Both BLOCKERs were this: Next refuses to register such a module, so the
    // page renders and every action on it returns 500. tsc and eslint are green
    // on it and are right to be — the constraint is Next's, and nothing else in
    // the gate set speaks that language.
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        const st = statSync(full)
        if (st.isDirectory()) {
          if (entry !== 'node_modules' && entry !== '.next') walk(full)
          continue
        }
        if (!/\.tsx?$/.test(entry)) continue
        const src = readFileSync(full, 'utf8')
        const first = src.split('\n')[0]?.trim()
        if (first !== "'use server'" && first !== '"use server"') continue
        for (const line of src.split('\n')) {
          if (!/^export /.test(line)) continue
          if (/^export async function /.test(line)) continue
          if (/^export type /.test(line) || /^export type\{/.test(line)) continue
          // `export type { X } from './y'` is erased at build time, like `export type`.
          if (/^export type \{/.test(line)) continue
          offenders.push(`${full}: ${line.trim()}`)
        }
      }
    }
    walk('app')
    walk('lib')
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
