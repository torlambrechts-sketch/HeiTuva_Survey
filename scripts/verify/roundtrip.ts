/**
 * VERIFY.md Gate 2a — round-trip every table this phase writes to, through the
 * actual application path.
 *
 * "Actual application path" means the server action, driven from the browser —
 * not a direct insert. A direct insert proves the table accepts a row; it
 * proves nothing about the action that is supposed to write it, which is where
 * the validation, the role check and the audit write live.
 *
 * Each step drives the UI, then reads the row back with a persona client and
 * prints it. A step that writes nothing is a failure even if the UI looked
 * happy.
 */
import { chromium, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { BASE_URL, ensureServer } from './server'
import { signIn } from '../../tests/helpers/session'
import { personaClient, serviceClient } from '../../tests/db/clients'
import { ORG_PRIMARY, PERSONAS } from '../../tests/db/personas'

config({ path: '.env.local', quiet: true })

let failures = 0

function show(table: string, ok: boolean, row: unknown) {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${table.padEnd(22)} ${JSON.stringify(row).slice(0, 150)}`)
}

async function main() {
  const server = await ensureServer()
  const browser = await chromium.launch()
  const svc = serviceClient()
  const admin = await personaClient('administrator')

  const { data: org } = await svc
    .from('organizations')
    .select('id')
    .eq('name', ORG_PRIMARY)
    .single()
  const orgId = org!.id

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nb-NO' })
    const page: Page = await ctx.newPage()
    await signIn(page, 'administrator', BASE_URL)

    console.log('\n== Phase 1 ==')

    // organizations — Firmaopplysninger saves on blur (D23).
    {
      const stamp = `Verifisert ${Date.now()}`
      await page.goto(`${BASE_URL}/administrasjon`, { waitUntil: 'domcontentloaded' })
      const field = page.locator('input[name="contact_name"]')
      await field.fill(stamp)
      await field.blur()
      await page.getByRole('status').first().waitFor({ timeout: 15_000 })
      const { data } = await admin
        .from('organizations')
        .select('contact_name')
        .eq('id', orgId)
        .single()
      show('organizations', data?.contact_name === stamp, data)
    }

    // organizations.retention_months + an audit row for it.
    {
      await page.goto(`${BASE_URL}/administrasjon/personvern`, { waitUntil: 'domcontentloaded' })
      const before = await admin
        .from('organizations')
        .select('retention_months')
        .eq('id', orgId)
        .single()
      const next = before.data?.retention_months === 24 ? 12 : 24
      await page.getByLabel('Oppbevaringstid').selectOption(String(next))
      await page.waitForTimeout(1500)
      const { data } = await admin
        .from('organizations')
        .select('retention_months')
        .eq('id', orgId)
        .single()
      show('organizations.retention', data?.retention_months === next, data)

      const { data: audit } = await svc
        .from('audit_events')
        .select('action, target')
        .eq('org_id', orgId)
        .eq('action', 'retention.change')
        .order('created_at', { ascending: false })
        .limit(1)
      show('audit_events', (audit?.length ?? 0) > 0, audit?.[0] ?? null)
    }

    // groups — create through the Grupper tab.
    {
      const name = `Gruppe ${Date.now()}`
      await page.goto(`${BASE_URL}/administrasjon/grupper`, { waitUntil: 'domcontentloaded' })
      await page.getByLabel('Ny gruppe').fill(name)
      await page.getByRole('button', { name: 'Opprett' }).click()
      await page.waitForTimeout(1500)
      const { data } = await admin.from('groups').select('id, name').eq('name', name)
      show('groups', (data?.length ?? 0) === 1, data?.[0] ?? null)
    }

    // profiles — Om meg.
    {
      const title = `Tittel ${Date.now()}`
      await page.goto(`${BASE_URL}/profil`, { waitUntil: 'domcontentloaded' })
      await page.fill('input[name="job_title"]', title)
      await page.getByRole('button', { name: 'Lagre endringer' }).first().click()
      await page.waitForTimeout(1500)
      const { data } = await admin.from('profiles').select('job_title').limit(1).single()
      show('profiles', data?.job_title === title, data)
    }

    // dsr_requests.
    {
      const email = `dsr-${Date.now()}@example.test`
      await page.goto(`${BASE_URL}/administrasjon/personvern`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: 'Behandle' }).first().click()
      await page.fill('input[name="subject_email"]', email)
      await page.getByRole('button', { name: 'Registrer', exact: true }).last().click()
      await page.waitForTimeout(1500)
      const { data } = await admin
        .from('dsr_requests')
        .select('id, type, subject_email, due_at')
        .eq('subject_email', email)
      show('dsr_requests', (data?.length ?? 0) === 1, data?.[0] ?? null)
    }

    console.log('\n== Phase 2 ==')

    // surveys + survey_questions — "Tom undersøkelse".
    let surveyId = ''
    {
      await page.goto(`${BASE_URL}/undersokelser`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: 'Tom undersøkelse' }).click()
      await page.waitForURL((u) => u.pathname.endsWith('/bygg'), { timeout: 20_000 })
      surveyId = new URL(page.url()).pathname.split('/')[2] ?? ''
      const { data } = await admin
        .from('surveys')
        .select('id, title, status, results_scope, created_by')
        .eq('id', surveyId)
        .single()
      show('surveys', data?.status === 'utkast' && data?.results_scope === 'ledelse', data)

      const { data: qs } = await admin
        .from('survey_questions')
        .select('id, type, position, config')
        .eq('survey_id', surveyId)
      show('survey_questions', (qs?.length ?? 0) === 1 && qs?.[0]?.type === 'scale', qs?.[0] ?? null)
    }

    // survey_questions again — an autosaved edit through the Builder.
    {
      const text = `Redigert ${Date.now()}`
      const input = page.getByLabel('Spørsmål 1')
      await input.fill(text)
      await page.waitForTimeout(2500)
      const { data } = await admin
        .from('survey_questions')
        .select('text')
        .eq('survey_id', surveyId)
        .single()
      show('survey_questions (autosave)', data?.text === text, data)
    }

    // question_bank — "Lagre til banken".
    {
      await page.getByRole('button', { name: 'Lagre til banken' }).first().click()
      await page.waitForTimeout(2000)
      const { data } = await admin
        .from('question_bank')
        .select('id, text, type, category')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
      show('question_bank', (data?.length ?? 0) > 0, data?.[0] ?? null)
    }

    // survey_editors + surveys.results_scope — the share panel.
    {
      await page.goto(`${BASE_URL}/undersokelser?del=${surveyId}`, { waitUntil: 'domcontentloaded' })
      // Name the person, not the shape. The first cut filtered the panel's
      // toggles by a "·" in their label — the separator between role and group
      // — and a member with no group has no separator, so it matched nothing,
      // clicked nothing, and reported the empty read as a persisted write.
      const editor = page.getByRole('button', { name: new RegExp(PERSONAS.redaktor.name) }).first()
      await editor.click()
      await page.waitForTimeout(1500)
      const { data } = await admin.from('survey_editors').select('member_id').eq('survey_id', surveyId)
      show('survey_editors', (data?.length ?? 0) > 0, data?.[0] ?? null)

      await page.getByRole('button', { name: 'Alle ansatte' }).click()
      await page.waitForTimeout(1500)
      const { data: s } = await admin
        .from('surveys')
        .select('results_scope')
        .eq('id', surveyId)
        .single()
      show('surveys.results_scope', s?.results_scope === 'alle_ansatte', s)
    }

    // schedules — the wizard's cadence step.
    {
      await page.goto(`${BASE_URL}/undersokelser/ny`, { waitUntil: 'domcontentloaded' })
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Neste' }).click()
      await page.getByRole('button', { name: 'Hver uke' }).click()
      await page.getByRole('button', { name: 'Opprett undersøkelsen' }).click()
      await page.waitForURL((u) => u.pathname.endsWith('/bygg'), { timeout: 20_000 })
      const wizardSurvey = new URL(page.url()).pathname.split('/')[2] ?? ''
      const { data } = await admin
        .from('schedules')
        .select('cadence, runs_total')
        .eq('survey_id', wizardSurvey)
      show('schedules', data?.[0]?.cadence === 'weekly', data?.[0] ?? null)

      const { data: qs } = await admin
        .from('survey_questions')
        .select('id')
        .eq('survey_id', wizardSurvey)
      show('survey_questions (wizard)', (qs?.length ?? 0) > 0, { count: qs?.length })
    }

    // template_packs — "Lagre som mal" in the Builder's action row.
    {
      await page.goto(`${BASE_URL}/undersokelser/${surveyId}/bygg`, {
        waitUntil: 'domcontentloaded',
      })
      await page.getByRole('button', { name: 'Lagre som mal' }).click()
      await page.getByRole('button', { name: 'Lagret som mal ✓' }).waitFor({ timeout: 15_000 })
      const { data } = await admin
        .from('template_packs')
        .select('id, title, private')
        .eq('org_id', orgId)
      show('template_packs (org-owned)', (data?.length ?? 0) > 0, data?.[0] ?? { count: 0 })
    }

    // logic_rules — the follow-up-on-low switch on a scale question.
    {
      await page.getByRole('button', { name: 'Avansert', exact: true }).click()
      const followUp = page
        .getByRole('button', { name: 'Oppfølging ved lav score', exact: true })
        .first()
      await followUp.click()
      // The Builder autosaves on a debounce; the rule is written by saveDraft.
      await page.waitForTimeout(3000)
      // `threshold` lives inside `config`, not as a column. Naming it here
      // made PostgREST reject the whole read, and the probe reported the empty
      // result as "no write path exists" — a harness fault dressed up as an
      // application finding. The error is printed now rather than folded into
      // a count.
      const { data, error } = await admin
        .from('logic_rules')
        .select('id, kind, config')
        .eq('survey_id', surveyId)
      show('logic_rules', (data?.length ?? 0) > 0, error ? { error: error.message } : (data?.[0] ?? { count: 0 }))
    }

    console.log('\n== Phase 4 ==')

    // result_snapshots is the only table this phase writes to, and
    // `snapshot_results` is the only path to it. Freeze the seeded survey's
    // aggregates and read the row back — including proof that what was frozen
    // is the GATED payload, since a snapshot outlives the raw answers.
    {
      const { data: seeded } = await svc
        .from('surveys')
        .select('id')
        .eq('title', 'Arbeidsmiljø — månedlig')
        .maybeSingle()

      // Scoped to the team that never reaches five, on purpose: an unfiltered
      // snapshot of this survey has no gated cell, so "gated rows carry no n"
      // would be true of an empty set and prove nothing. This one has gated
      // cells to check.
      const { data: group } = await svc
        .from('groups')
        .select('id')
        .eq('name', 'Utvikling')
        .limit(1)
        .maybeSingle()

      const { data: made, error: rpcErr } = await admin.rpc('snapshot_results', {
        p_survey: seeded!.id,
        p_group: group?.id ?? undefined,
      })
      const payload = (made ?? {}) as { snapshot_id?: string; content_hash?: string; error?: string }

      const { data: row, error } = await admin
        .from('result_snapshots')
        .select('id, survey_id, content_hash, aggregates, created_at')
        .eq('id', payload.snapshot_id ?? '')
        .maybeSingle()

      const questions =
        (row?.aggregates as { questions?: { insufficient_data?: boolean; n: number | null }[] })
          ?.questions ?? []
      const gatedCarryNoCount = questions
        .filter((q) => q.insufficient_data)
        .every((q) => q.n === null)

      show(
        'result_snapshots',
        !rpcErr &&
          !error &&
          Boolean(row) &&
          gatedCarryNoCount &&
          questions.some((q) => q.insufficient_data),
        rpcErr || error
          ? { error: (rpcErr ?? error)!.message }
          : {
              id: row?.id,
              content_hash: `${String(row?.content_hash).slice(0, 16)}…`,
              questions: questions.length,
              gated: questions.filter((q) => q.insufficient_data).length,
              gated_rows_carry_no_n: gatedCarryNoCount,
            },
      )
    }

    console.log('\n== Phase 6 ==')

    /*
      The translation editor, driven from the browser and then read back TWICE:
      once from the table, and once from a different screen, because a row that
      persists but never reaches a page is not a working editor.

      The key edited is `nav.reports`, which the header renders on every screen
      — so the second read is a genuine end-to-end check of the whole chain
      (row → `ui_messages` overlay → `unstable_cache` → the rendered header),
      including the `revalidateTag` that has to fire for the change to be
      visible before the 300-second expiry.
    */
    {
      const page = await ctx.newPage()
      const MINE = 'Våre rapporter'

      await page.goto(`${BASE_URL}/administrasjon/sprak?ns=nav&q=reports`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForLoadState('load')
      const form = page.locator('form').filter({ has: page.locator('textarea') }).first()
      await form.locator('textarea').fill(MINE)
      await form.getByRole('button', { name: 'Lagre' }).click()
      await page.getByText('Lagret ✓').first().waitFor({ timeout: 15_000 })

      const { data: row, error } = await admin
        .from('ui_messages')
        .select('value, org_id')
        .eq('namespace', 'nav').eq('key', 'reports').eq('lang', 'no').eq('org_id', orgId)
        .maybeSingle()

      await page.goto(`${BASE_URL}/oversikt`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      const header = await page.locator('header').first().innerText()

      show(
        'ui_messages (override)',
        !error && row?.value === MINE && row?.org_id === orgId && header.includes(MINE),
        error
          ? { error: error.message }
          : { stored: row?.value, scoped_to_org: row?.org_id === orgId, rendered_in_header: header.includes(MINE) },
      )

      // And undone: the shipped copy has to come back, or an org could paint
      // itself into a corner it cannot leave.
      await page.goto(`${BASE_URL}/administrasjon/sprak?ns=nav&q=reports`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForLoadState('load')
      await page.getByRole('button', { name: 'Tilbakestill til standard' }).first().click()
      await page.waitForTimeout(1500)

      const { data: gone } = await admin
        .from('ui_messages')
        .select('id')
        .eq('namespace', 'nav').eq('key', 'reports').eq('lang', 'no').eq('org_id', orgId)
        .maybeSingle()

      await page.goto(`${BASE_URL}/oversikt`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      const restored = await page.locator('header').first().innerText()

      show(
        'ui_messages (reset)',
        !gone && restored.includes('Rapporter') && !restored.includes(MINE),
        { row_removed: !gone, header_back_to_shipped: restored.includes('Rapporter') && !restored.includes(MINE) },
      )

      /*
        The parity guard, which is the one thing standing between a wording tweak
        and a broken screen: `admin.langShowing` is "Viser {shown} av {matched}
        tekster", and an edit that drops a variable must be refused rather than
        stored. next-intl throws on a message whose placeholder the caller still
        passes, so this is a crash the editor has to prevent, not a cosmetic
        check.
      */
      await page.goto(`${BASE_URL}/administrasjon/sprak?ns=admin&q=langShowing`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForLoadState('load')
      const guard = page.locator('form').filter({ has: page.locator('textarea') }).first()
      await guard.locator('textarea').fill('Viser noen tekster')
      await guard.getByRole('button', { name: 'Lagre' }).click()
      await page.waitForTimeout(1200)
      const alerted = await page.locator('[role="alert"]').first().innerText().catch(() => '')

      const { data: refused } = await admin
        .from('ui_messages')
        .select('id')
        .eq('namespace', 'admin').eq('key', 'langShowing').eq('lang', 'no').eq('org_id', orgId)
        .maybeSingle()

      show(
        'ui_messages (parity refused)',
        !refused && alerted.includes('{shown}') && alerted.includes('{matched}'),
        { nothing_stored: !refused, told_the_user: alerted.slice(0, 90) },
      )
      await page.close()
    }

    await ctx.close()
  } finally {
    await browser.close()
    server.stop()
  }

  console.log(failures === 0 ? '\nall round-trips persisted' : `\n${failures} round-trip(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
