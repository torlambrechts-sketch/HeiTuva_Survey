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
import { ORG_PRIMARY } from '../../tests/db/personas'

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

    // question_bank — "Lagre i banken".
    {
      await page.getByRole('button', { name: 'Lagre i banken' }).first().click()
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
      const editor = page.locator('button[aria-pressed]').filter({ hasText: '·' }).first()
      if (await editor.count()) {
        await editor.click()
        await page.waitForTimeout(1500)
      }
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

    // template_packs — the only write path Phase 2 declares is "Lagre som mal".
    {
      const { data } = await admin
        .from('template_packs')
        .select('id')
        .eq('org_id', orgId)
      show('template_packs (org-owned)', (data?.length ?? 0) > 0, {
        count: data?.length ?? 0,
        note: 'no UI path creates one — see Gate 1',
      })
    }

    // logic_rules — Phase 2 scope says follow-up-on-low writes this table.
    {
      const { data } = await admin.from('logic_rules').select('id')
      show('logic_rules', (data?.length ?? 0) > 0, {
        count: data?.length ?? 0,
        note: 'no write path exists — see Gate 1',
      })
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
