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

      // …and then take it away again. The assertion has already run, so nothing
      // is weakened — but a group is not an inert row: it appears in the
      // Resultater team panel, in the heatmap and in the group pickers, so one
      // per run accumulated in the DEMO organisation and turned up in a V1-2
      // capture as «Gruppe 1788725988772 · n<5». Same rule as
      // `tests/db/policy-panel.test.ts`'s cleanup: a check must not become part
      // of what the next check sees.
      for (const g of data ?? []) await admin.from('groups').delete().eq('id', g.id)
    }

    // profiles — Om meg.
    {
      // V1-6: the value is RESTORED afterwards, for the same reason the group
      // is deleted. The group probe was fixed when its litter turned up in a
      // capture; these two were left because neither reaches a rendered screen
      // — which is the argument that quietly licenses exceptions. Gate 5a2's
      // rule is "do not become what else exists", and a harness that enforces
      // it while breaking it is the worst place for the exception to live.
      const { data: before } = await admin
        .from('profiles')
        .select('user_id, job_title')
        .limit(1)
        .single()
      const title = `Tittel ${Date.now()}`
      await page.goto(`${BASE_URL}/profil`, { waitUntil: 'domcontentloaded' })
      await page.fill('input[name="job_title"]', title)
      await page.getByRole('button', { name: 'Lagre endringer' }).first().click()
      await page.waitForTimeout(1500)
      const { data } = await admin.from('profiles').select('job_title').limit(1).single()
      show('profiles', data?.job_title === title, data)

      // Restored, not deleted: a profile row must keep existing, so putting the
      // previous value back is the only shape of cleanup available.
      if (before?.user_id) {
        await admin
          .from('profiles')
          .update({ job_title: before.job_title })
          .eq('user_id', before.user_id)
      }
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

      // V1-6: removed after the assertion. A DSR request is not inert — it
      // carries a statutory deadline, appears on Administrasjon → Personvern
      // and counts toward «Krever handling», so one per run accumulated into a
      // demo organisation with a growing pile of overdue subject requests.
      for (const r of data ?? []) await admin.from('dsr_requests').delete().eq('id', r.id)
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

      The key edited is `nav.insight`, which the header renders on every screen
      — so the second read is a genuine end-to-end check of the whole chain
      (row → `ui_messages` overlay → `unstable_cache` → the rendered header),
      including the `revalidateTag` that has to fire for the change to be
      visible before the 300-second expiry.

      It used to be `nav.reports`, and that key stopped being a header item when
      the v1 bundle merged Dashboard and Rapporter into "Innsikt" — the row still
      stored, the header simply no longer rendered it, so the probe failed while
      the behaviour it exists to prove was intact. The lesson is the probe's, not
      the app's: an end-to-end check must name a key the surface it reads
      actually renders.
    */
    {
      const page = await ctx.newPage()
      const MINE = 'Vår innsikt'

      await page.goto(`${BASE_URL}/administrasjon/sprak?ns=nav&q=insight`, {
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
        .eq('namespace', 'nav').eq('key', 'insight').eq('lang', 'no').eq('org_id', orgId)
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
      await page.goto(`${BASE_URL}/administrasjon/sprak?ns=nav&q=insight`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForLoadState('load')
      await page.getByRole('button', { name: 'Tilbakestill til standard' }).first().click()
      await page.waitForTimeout(1500)

      const { data: gone } = await admin
        .from('ui_messages')
        .select('id')
        .eq('namespace', 'nav').eq('key', 'insight').eq('lang', 'no').eq('org_id', orgId)
        .maybeSingle()

      await page.goto(`${BASE_URL}/oversikt`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      const restored = await page.locator('header').first().innerText()

      show(
        'ui_messages (reset)',
        !gone && restored.includes('Innsikt') && !restored.includes(MINE),
        { row_removed: !gone, header_back_to_shipped: restored.includes('Innsikt') && !restored.includes(MINE) },
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

    console.log('\n== Phase 8 (Q17) ==')

    /*
      The threshold-policy action, exercised at the level a real administrator
      session hits it — the DB write setSurveyPolicy performs, under the guard
      trigger (migration 0032), with auth.uid() populated. Three contracts:
      an administrator may lower the threshold and the change is audited; a
      redaktør (even one who is a survey editor, so RLS is not what stops them)
      may not; and once the real send path locks the survey, no one may — not
      even the administrator who could a moment ago. The isolated DB test proves
      the trigger; this proves the trigger under an authenticated app session,
      end to end through send_round's lock.
    */
    {
      const redaktor = await personaClient('redaktor')
      const { data: redMember } = await svc
        .from('org_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('role', 'redaktor')
        .limit(1)
        .single()

      // A fresh administrator-owned survey, unlocked, defaulting to k=5/person.
      const { data: made, error: mkErr } = await admin
        .from('surveys')
        .insert({ org_id: orgId, title: `Q17 terskel ${Date.now()}`, anonymity: 'anonymous' })
        .select('id, k_threshold, respondent_kind, policy_locked')
        .single()
      const q17Id = made?.id ?? ''
      await admin
        .from('survey_questions')
        .insert({ survey_id: q17Id, position: 1, type: 'scale', text: 'Q17' })
      show(
        'surveys default policy (k=5, person, unlocked)',
        !mkErr && made?.k_threshold === 5 && made?.respondent_kind === 'person' && made?.policy_locked === false,
        mkErr ? { error: mkErr.message } : made,
      )

      // 1. The administrator lowers it — and the change is audited.
      const lower = await admin.from('surveys').update({ k_threshold: 3 }).eq('id', q17Id).select('k_threshold').single()
      const { data: auditRow } = await svc
        .from('audit_events')
        .select('action, target, meta')
        .eq('org_id', orgId)
        .eq('action', 'threshold.change')
        .eq('target', q17Id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      show(
        'administrator may lower the threshold, audited',
        !lower.error && lower.data?.k_threshold === 3 &&
          auditRow?.action === 'threshold.change' &&
          (auditRow?.meta as { from?: number; to?: number })?.to === 3,
        lower.error ? { error: lower.error.message } : { k: lower.data?.k_threshold, audit: auditRow?.meta ?? null },
      )

      // 2. A redaktør — made an editor first, so the refusal is the policy
      //    guard, not the survey RLS — cannot.
      await svc.from('survey_editors').insert({ survey_id: q17Id, member_id: redMember!.id })
      const byRed = await redaktor.from('surveys').update({ k_threshold: 5 }).eq('id', q17Id).select('id')
      const { data: afterRed } = await svc.from('surveys').select('k_threshold').eq('id', q17Id).single()
      show(
        'redaktør may not change the threshold',
        (byRed.error != null || (byRed.data?.length ?? 0) === 0) && afterRed?.k_threshold === 3,
        { refused: byRed.error?.message ?? `rows=${byRed.data?.length ?? 0}`, k_unchanged: afterRed?.k_threshold },
      )

      // 3. The real send path locks the policy; the administrator who could
      //    change it a moment ago now cannot.
      const sent = await admin.rpc('send_round', { p_survey: q17Id, p_channels: ['link'] })
      const { data: locked } = await svc.from('surveys').select('policy_locked').eq('id', q17Id).single()
      const afterLock = await admin.from('surveys').update({ k_threshold: 4 }).eq('id', q17Id).select('id')
      const { data: finalK } = await svc.from('surveys').select('k_threshold').eq('id', q17Id).single()
      show(
        'sending locks the policy against even an administrator',
        !sent.error && locked?.policy_locked === true &&
          afterLock.error != null && /policy_locked/.test(afterLock.error?.message ?? '') &&
          finalK?.k_threshold === 3,
        sent.error
          ? { error: sent.error.message }
          : { locked: locked?.policy_locked, refused: afterLock.error?.message?.slice(0, 60), k_unchanged: finalK?.k_threshold },
      )
    }

    /*
      Entra ID SSO (Phase 6) and the break-glass rule (Phase 6 acceptance,
      decision 2; migration 0029). Auth has no Entra provider on the local
      stack, so what is provable here is what matters without one: the switch
      cannot be turned on; the option cannot be forced on in the database while
      nobody is exempt; the break-glass list is drawn and its switch persists;
      an exempt administrator's password session is served while the option is
      on; the last exempt administrator cannot be un-exempted; and once
      somebody else holds the mark, this administrator's session is ended
      rather than served.

      Last in the file on purpose: the enforcement signs this context out.
    */
    {
      const page = await ctx.newPage()
      await page.goto(`${BASE_URL}/administrasjon/valg`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      const sso = page.getByRole('switch', { name: 'Pålogging med Entra ID (SSO)' })
      const mine = page.getByRole('switch', { name: `Kan logge inn uten Entra ID: ${PERSONAS.administrator.name}` })
      show(
        'options.sso (switch)',
        (await sso.isDisabled()) && (await page.getByText('ikke satt opp ennå').count()) > 0 && (await mine.count()) === 1,
        { disabled_without_provider: await sso.isDisabled(), break_glass_row_drawn: (await mine.count()) === 1 },
      )

      const on = { reminders: true, weekly_digest: true, allow_self_serve: false, sso: true, brand_mail: true }
      const off = { ...on, sso: false }
      const { data: me } = await svc
        .from('org_members').select('id, sso_exempt').eq('org_id', orgId).eq('email', PERSONAS.administrator.email).single()

      // Nobody exempt: the database refuses the option, whoever asks.
      await svc.from('org_members').update({ sso_exempt: false }).eq('org_id', orgId)
      const refused = await svc.from('organizations').update({ options: on }).eq('id', orgId)
      const { data: notOn } = await svc.from('organizations').select('options').eq('id', orgId).single()

      // The break-glass switch through the UI, read back.
      await mine.click()
      await page.waitForFunction(() => document.querySelector('[role="alert"]') === null, undefined, { timeout: 5_000 }).catch(() => {})
      let exempt = false
      for (let i = 0; i < 20 && !exempt; i++) {
        const { data } = await svc.from('org_members').select('sso_exempt').eq('id', me!.id).single()
        exempt = data?.sso_exempt === true
        if (!exempt) await page.waitForTimeout(250)
      }
      show(
        'options.sso (break-glass required)',
        (refused.error?.message ?? '').includes('sso_no_break_glass') &&
          (notOn?.options as { sso?: boolean })?.sso !== true && exempt,
        { refused: refused.error?.message?.slice(0, 40), stayed_off: (notOn?.options as { sso?: boolean })?.sso !== true, exempt_persisted: exempt },
      )

      // Exempt, and the option on: this password session is served.
      const forced = await svc.from('organizations').update({ options: on }).eq('id', orgId)
      const served = await page.goto(`${BASE_URL}/oversikt`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      const servedPath = new URL(page.url()).pathname
      // …and the last exempt administrator is protected while it is on.
      const lastOne = await svc.from('org_members').update({ sso_exempt: false }).eq('id', me!.id)
      show(
        'options.sso (break-glass honoured)',
        forced.error === null && served?.status() === 200 && servedPath === '/oversikt' &&
          (lastOne.error?.message ?? '').includes('sso_last_break_glass'),
        { forced_on: forced.error === null, served: servedPath, last_protected: lastOne.error?.message?.slice(0, 40) },
      )

      // A second exempt administrator takes over the mark; this one is now
      // an ordinary password session, and enforcement ends it.
      const { data: other } = await svc.from('org_members').insert({
        org_id: orgId, email: 'breakglass@nordiskstudio.test', name: 'Break Glass',
        role: 'administrator', status: 'active', sso_exempt: true,
      }).select('id').single()
      const released = await svc.from('org_members').update({ sso_exempt: false }).eq('id', me!.id)
      const res = await page.goto(`${BASE_URL}/oversikt`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      const landed = new URL(page.url())
      const notice = await page.locator('[role="alert"]').first().innerText().catch(() => '')
      const again = await page.goto(`${BASE_URL}/oversikt`, { waitUntil: 'domcontentloaded' })
      const stillOut = new URL(page.url()).pathname.startsWith('/logg-inn')
      show(
        'options.sso (enforced)',
        released.error === null && res?.status() === 200 &&
          landed.pathname === '/logg-inn' && landed.searchParams.get('feil') === 'sso' &&
          notice.includes('Entra ID') && stillOut,
        { landed: `${landed.pathname}?${landed.searchParams}`, told: notice.slice(0, 60), session_ended: stillOut, second: again?.status() },
      )
      await svc.from('organizations').update({ options: off }).eq('id', orgId)
      if (other) await svc.from('org_members').delete().eq('id', other.id)
      await svc.from('org_members').update({ sso_exempt: me?.sso_exempt ?? false }).eq('id', me!.id)
      await page.close()
    }

    /*
      Every option change is audited (Gate 4 finding, Phase 6): the switch is
      flipped through the UI and the audit row is read back. Runs on a fresh
      page because the SSO block above ended the context's session.
    */
    {
      const page = await ctx.newPage()
      await signIn(page, 'administrator', BASE_URL)
      await page.goto(`${BASE_URL}/administrasjon/valg`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      const before = new Date().toISOString()
      await page.getByRole('switch', { name: 'Ukentlig sammendrag på e-post' }).click()
      await page.waitForTimeout(800)
      const { data: rows } = await admin
        .from('audit_events')
        .select('action, target, meta')
        .eq('org_id', orgId)
        .eq('action', 'option.change')
        .gt('created_at', before)
      const row = rows?.[0] as { action: string; target: string; meta: { from?: boolean; to?: boolean } } | undefined
      show(
        'audit_events (option.change)',
        row?.target === 'weekly_digest' && typeof row?.meta?.to === 'boolean' && row.meta.from !== row.meta.to,
        row ?? { count: rows?.length ?? 0 },
      )
      // Put it back the way the seed had it.
      await page.getByRole('switch', { name: 'Ukentlig sammendrag på e-post' }).click()
      await page.waitForTimeout(400)
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
