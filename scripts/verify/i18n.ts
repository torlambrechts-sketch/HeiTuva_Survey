/**
 * VERIFY.md Gate 3f — switch to English and re-capture, at runtime.
 *
 * Grepping the source for Norwegian string literals finds the ones written as
 * literals. It cannot find a message that exists in `no` and is missing from
 * `en` (next-intl falls back to the source language and the screen silently
 * stays Norwegian), nor a key that renders raw because it was added to the JSON
 * and never seeded. Both are runtime facts, so this drives the real app.
 *
 * The locale comes from `profiles.lang` (lib/i18n/resolve-locale.ts), so the
 * switch is a real profile change, made and then reverted.
 *
 * Two detectors:
 *  - a rendered `namespace.key`, which is next-intl's missing-message output;
 *  - any Norwegian message value that still appears verbatim on the English
 *    page, when its English translation differs. That is the signature of a
 *    hardcoded string or an untranslated key, and it is checked against the
 *    real rendered text rather than the source.
 */
import { chromium, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { mkdir, writeFile } from 'node:fs/promises'
import { BASE_URL, ensureServer } from './server'
import { signIn } from '../../tests/helpers/session'
import { serviceClient } from '../../tests/db/clients'
import { findUserByEmail } from '../../tests/db/factories'
import { PERSONAS } from '../../tests/db/personas'
import { ROUTES } from '../../tests/routes.manifest'
import no from '../../messages/no.json'
import en from '../../messages/en.json'

config({ path: '.env.local', quiet: true })

const OUT = 'artifacts/i18n-en'

/** Message keys as next-intl renders them when a message is missing. */
const KEYS: string[] = Object.entries(no as Record<string, Record<string, string>>).flatMap(
  ([ns, entries]) => Object.keys(entries).map((k) => `${ns}.${k}`),
)

/**
 * Norwegian values whose English translation genuinely differs, and which are
 * long enough to match on. Short strings ("Alle", "v1", "NO") legitimately
 * coincide across the two languages, so matching on them would be noise.
 */
const NORWEGIAN_ONLY: { key: string; value: string }[] = []
for (const [ns, entries] of Object.entries(no as Record<string, Record<string, string>>)) {
  const enNs = (en as Record<string, Record<string, string>>)[ns] ?? {}
  for (const [k, v] of Object.entries(entries)) {
    if (typeof v !== 'string' || v.length < 12) continue
    if (v.includes('{')) continue // interpolated — the rendered form differs
    if (enNs[k] === v) continue // identical by design (a proper noun, a symbol)
    NORWEGIAN_ONLY.push({ key: `${ns}.${k}`, value: v })
  }
}

let failures = 0

/**
 * Is this phrase database content rather than UI chrome? Cached, because the
 * same handful of strings recur across every route.
 */
const seededCache = new Map<string, boolean>()
async function isSeededContent(value: string): Promise<boolean> {
  const hit = seededCache.get(value)
  if (hit !== undefined) return hit
  const svc = serviceClient()
  // Substring, not equality. The seeded audiences read "Alle ansatte ·
  // annethvert år"; the phrase on the page is part of that value, so an exact
  // match said "not seeded" and accused the scope label instead.
  const like = `%${value}%`
  const [
    packTitle, packAudience, bank, surveyTitle, surveyAudience, sectionLabel, sectionDesc,
    dutyTitle, dutyLaw, surveyQuestion, packLegalRef, dutyBasis, taskTitle,
  ] =
    await Promise.all([
      svc.from('template_packs').select('id').ilike('title', like).limit(1),
      svc.from('template_packs').select('id').ilike('audience', like).limit(1),
      svc.from('question_bank').select('id').ilike('text', like).limit(1),
      svc.from('surveys').select('id').ilike('title', like).limit(1),
      svc.from('surveys').select('id').ilike('audience_label', like).limit(1),
      // `report_section_types` is a seeded registry, exactly like the template
      // packs above: adding a section is a row, not a component. Its labels are
      // therefore content, and content is Norwegian until the Phase 6
      // translation editor gives it the treatment
      // `template_pack_translations` already has (docs/DEVIATIONS.md D70).
      //
      // Several of these strings ALSO exist in the message catalogue as
      // dashboard panel titles, which is why the check found them at all: the
      // same words reach the dashboard through next-intl and the report editor
      // through the database.
      svc.from('report_section_types').select('key').ilike('label', like).limit(1),
      svc.from('report_section_types').select('key').ilike('description', like).limit(1),
      // `duty_definitions` is the same kind of registry: a statutory duty is a
      // seeded row, and the name of a Norwegian statute stays Norwegian on the
      // English page because it is the statute's name, not a translation of
      // one. The splash quotes the same four laws in its `splash.duties*` keys,
      // which is how these first surfaced — as message values that happen to
      // equal seeded content.
      svc.from('duty_definitions').select('key').ilike('title', like).limit(1),
      svc.from('duty_definitions').select('key').ilike('law', like).limit(1),
      // V2-8 added two seeded-content sources this list was missing, and it
      // found them the way the others were found: a message value that HAPPENS
      // to equal seeded content, accused as chrome.
      //
      // A question's own text is content — the strongest case in the whole
      // list, since it is what the respondent reads — and `survey_questions`
      // was not consulted at all. `template_packs.questions` is the same text
      // one level up, inside the pack's jsonb.
      //
      // Bruksområder quotes real example questions on purpose: a page telling
      // you what a survey asks is more useful with the survey's own words than
      // with invented ones. That is what put `usecases.pulsEx1` on the
      // dashboard's English render, where the seeded question of the same name
      // was already showing.
      svc.from('survey_questions').select('id').ilike('text', like).limit(1),
      // A pack's own legal reference — «Åpenhetsloven §§ 4–5 · frist 30. juni»,
      // «ARP — kartlegges annethvert år». It is the statute's wording, and it
      // stays Norwegian on the English page for the same reason
      // `duty_definitions.law` does.
      svc.from('template_packs').select('id').ilike('legal_ref', like).limit(1),
      // `duty_definitions.basis` — «Lønnskartlegging annethvert år. Redegjøres
      // for i årsberetningen.» It is the duty's own statutory cadence, rendered
      // on Rapporter, and it is text rather than jsonb: I wrote the opposite in
      // a comment here and the gate corrected me by still failing.
      svc.from('duty_definitions').select('key').ilike('basis', like).limit(1),
      // F1 — the THIRTEENTH source, and the third time this list has been
      // extended by the same mechanism (V2-8 added two, this adds one).
      //
      // `app.generate_blind_spot_tasks` writes a task whose TITLE is «Denne
      // undersøkelsen har grupper som ikke får egne resultater. Plikten til å
      // kartlegge og følge opp gjelder likevel.» — and V6-6 gave svTuva's Q72
      // tip the same sentence, character for character, because it is the same
      // duty said once. So the gate matched the message value against a TASK
      // TITLE on Oversikt and Handlinger and accused the message.
      //
      // The generated title really is Norwegian on an English page, and that is
      // a product limitation rather than a chrome bug — the same one
      // `surveys.title` above has, and the same one the Phase 6 translation
      // editor is for. Logged rather than silenced (DEVIATIONS D177).
      //
      // AND THIS LIST IS AN ENUMERATION, SAID AS ONE. It is not «the seeded
      // registries»; it is **the text columns whose content this product
      // renders verbatim and which have been observed to collide with a message
      // value**. The next collision will be a column nobody has thought of, and
      // the remedy is another row here plus the sentence — never the row alone.
      svc.from('tasks').select('id').ilike('title', like).limit(1),
    ])
  const found = [
    packTitle, packAudience, bank, surveyTitle, surveyAudience, sectionLabel, sectionDesc,
    dutyTitle, dutyLaw, surveyQuestion, packLegalRef, dutyBasis, taskTitle,
  ].some((r) => (r.data?.length ?? 0) > 0)
  seededCache.set(value, found)
  return found
}

/**
 * One page, checked and screenshotted. Extracted so the editor states below run
 * exactly the check the route loop runs — a second copy would drift, and the
 * cheapest way to make a gate stop measuring is to have two of it.
 *
 * Returns 1 if the page failed, 0 if it passed, so callers can sum.
 */
async function checkPage(page: Page, label: string): Promise<number> {
  const text = await page.locator('body').innerText()
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true })

  const rawKeys = KEYS.filter((k) => text.includes(k))

  /**
   * A Norwegian phrase on the English page is only a defect when it is UI
   * chrome. Seeded CONTENT — pack titles and audiences, bank questions, a
   * survey's own name — is Norwegian by design: `no` is the source language
   * and translating content is the Phase 6 translation editor's job, not
   * next-intl's. "Alle ansatte" is both a scope label and a template pack's
   * audience, so matching on the string alone accused the wrong one.
   */
  const matches = NORWEGIAN_ONLY.filter((m) => text.includes(m.value))
  const chrome: typeof matches = []
  const seeded: typeof matches = []
  for (const m of matches) {
    if (await isSeededContent(m.value)) seeded.push(m)
    else chrome.push(m)
  }

  if (rawKeys.length || chrome.length) {
    console.log(`  FAIL ${label}`)
    for (const k of rawKeys.slice(0, 5)) console.log(`       raw key rendered: ${k}`)
    for (const m of chrome.slice(0, 5)) {
      console.log(`       Norwegian chrome on the English page: ${m.key} = "${m.value.slice(0, 60)}"`)
    }
    return 1
  }

  console.log(
    `  ok   ${label}${seeded.length ? `  (${seeded.length} Norwegian seed value(s), by design)` : ''}`,
  )
  return 0
}

async function main() {
  const server = await ensureServer()
  const browser = await chromium.launch()
  const svc = serviceClient()
  await mkdir(OUT, { recursive: true })

  // Paged lookup: `listUsers()` returns only the first page, so this stopped
  // finding the persona once the local stack held more than fifty users.
  const personaId = await findUserByEmail(svc, PERSONAS.administrator.email)
  if (!personaId) throw new Error('administrator persona not found')
  const persona = { id: personaId }

  const { data: before } = await svc
    .from('profiles')
    .select('lang')
    .eq('user_id', persona.id)
    .single()

  console.log(`  switching profiles.lang ${before?.lang ?? 'no'} -> en`)
  const { error: setError } = await svc
    .from('profiles')
    .update({ lang: 'en' })
    .eq('user_id', persona.id)
  if (setError) throw new Error(`could not switch locale: ${setError.message}`)

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' })
    const page = await ctx.newPage()
    await signIn(page, 'administrator', BASE_URL)

    /**
     * Route loads only, not the manifest's click-through states.
     *
     * Every `setup` locates its control by Norwegian accessible name, because
     * it was written for the source language — so driving them here fails on
     * the English page for a reason that says nothing about i18n. Re-capturing
     * each route is what this gate asks for; re-driving every interaction in
     * two languages would need a second, locale-agnostic set of locators, and
     * that is a harness project rather than a verification result.
     */
    for (const spec of ROUTES) {
      if (spec.as !== 'administrator') continue
      {
        const label = spec.label
        try {
          await page.goto(`${BASE_URL}${spec.route}`, { waitUntil: 'domcontentloaded' })
          await page.waitForLoadState('load')
          await page.waitForTimeout(250)

          failures += await checkPage(page, label)
        } catch (e) {
          failures++
          console.log(`  ERROR ${label}: ${e instanceof Error ? e.message : e}`)
        }
      }
    }
    /**
     * The report editor, which the loop above cannot reach.
     *
     * It is a STATE of `/rapporter` (`?rapport=<id>`), the manifest opens it by
     * clicking a Norwegian control, and its spec is `as: 'redaktor'` — so all
     * three reasons the loop skips states apply at once and the screen with the
     * most new copy in Phase 5 was never checked in English (defect 16).
     *
     * Addressed by URL instead, which needs no locator in either language. The
     * three side panels are then reached through the tab rail by POSITION
     * rather than by accessible name, for the same reason.
     */
    {
      // Scoped to the persona's own organisation: a report from another tenant
      // is a 404 for this reader, and the gate would then be measuring the
      // not-found page.
      const { data: membership } = await svc
        .from('org_members')
        .select('org_id')
        .eq('user_id', persona.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      const { data: rep } = await svc
        .from('reports')
        .select('id, sections')
        .eq('org_id', membership?.org_id ?? '00000000-0000-0000-0000-000000000000')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!rep) {
        failures++
        console.log('  ERROR rapport-editor: no report to open — the gate cannot check the editor')
      } else {
        // Turn the quotes section on so the picker's copy is on the page. It is
        // restored below: this gate reads, it does not leave state behind.
        const originalSections = (rep.sections ?? []) as string[]
        const withQuotes = originalSections.includes('quotes')
          ? originalSections
          : [...originalSections, 'quotes']
        await svc.from('reports').update({ sections: withQuotes }).eq('id', rep.id)

        try {
          for (const [i, name] of ['innhold', 'filter', 'del'].entries()) {
            await page.goto(`${BASE_URL}/rapporter?rapport=${rep.id}`, {
              waitUntil: 'domcontentloaded',
            })
            await page.waitForLoadState('load')
            await page.locator('div.bg-sf2 > button').nth(i).click()
            await page.waitForTimeout(250)
            failures += await checkPage(page, `rapport-editor.${name}`)
          }
        } finally {
          await svc.from('reports').update({ sections: originalSections }).eq('id', rep.id)
        }
      }
    }

    await ctx.close()

    /**
     * The splash, which the loop above cannot reach twice over: it is `anon`,
     * and for a signed-in visitor `/` redirects to `/oversikt`. Its language is
     * carried on the URL rather than on `profiles.lang` — a public page has no
     * profile to read — so `?lang=en` is the whole switch.
     */
    const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-GB' })
    const anonPage = await anonCtx.newPage()
    await anonPage.goto(`${BASE_URL}/?lang=en`, { waitUntil: 'domcontentloaded' })
    await anonPage.waitForLoadState('load')
    await anonPage.waitForTimeout(250)
    failures += await checkPage(anonPage, 'splash')
    await anonCtx.close()
  } finally {
    await svc.from('profiles').update({ lang: before?.lang ?? 'no' }).eq('user_id', persona.id)
    console.log(`  restored profiles.lang -> ${before?.lang ?? 'no'}`)
    await browser.close()
    server.stop()
  }

  await writeFile(
    `${OUT}/summary.json`,
    JSON.stringify({ checkedMessages: NORWEGIAN_ONLY.length, failures }, null, 2),
  )
  console.log(
    failures === 0
      ? `\nEnglish renders clean across every administrator route and the splash (${NORWEGIAN_ONLY.length} messages checked)`
      : `\n${failures} route/state(s) still show Norwegian or a raw key`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
