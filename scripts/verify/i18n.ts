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
import { chromium } from '@playwright/test'
import { config } from 'dotenv'
import { mkdir, writeFile } from 'node:fs/promises'
import { BASE_URL, ensureServer } from './server'
import { signIn } from '../../tests/helpers/session'
import { serviceClient } from '../../tests/db/clients'
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
  const [packTitle, packAudience, bank, surveyTitle, surveyAudience] = await Promise.all([
    svc.from('template_packs').select('id').ilike('title', like).limit(1),
    svc.from('template_packs').select('id').ilike('audience', like).limit(1),
    svc.from('question_bank').select('id').ilike('text', like).limit(1),
    svc.from('surveys').select('id').ilike('title', like).limit(1),
    svc.from('surveys').select('id').ilike('audience_label', like).limit(1),
  ])
  const found = [packTitle, packAudience, bank, surveyTitle, surveyAudience].some(
    (r) => (r.data?.length ?? 0) > 0,
  )
  seededCache.set(value, found)
  return found
}

async function main() {
  const server = await ensureServer()
  const browser = await chromium.launch()
  const svc = serviceClient()
  await mkdir(OUT, { recursive: true })

  const { data: user } = await svc.auth.admin.listUsers()
  const persona = user.users.find((u) => u.email === PERSONAS.administrator.email)
  if (!persona) throw new Error('administrator persona not found')

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

          const text = await page.locator('body').innerText()
          await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true })

          const rawKeys = KEYS.filter((k) => text.includes(k))

          /**
           * A Norwegian phrase on the English page is only a defect when it is
           * UI chrome. Seeded CONTENT — pack titles and audiences, bank
           * questions, a survey's own name — is Norwegian by design: `no` is
           * the source language and translating content is the Phase 6
           * translation editor's job, not next-intl's. "Alle ansatte" is both a
           * scope label and a template pack's audience, so matching on the
           * string alone accused the wrong one.
           */
          const matches = NORWEGIAN_ONLY.filter((m) => text.includes(m.value))
          const chrome: typeof matches = []
          const seeded: typeof matches = []
          for (const m of matches) {
            if (await isSeededContent(m.value)) seeded.push(m)
            else chrome.push(m)
          }

          if (rawKeys.length || chrome.length) {
            failures++
            console.log(`  FAIL ${label}`)
            for (const k of rawKeys.slice(0, 5)) console.log(`       raw key rendered: ${k}`)
            for (const m of chrome.slice(0, 5)) {
              console.log(`       Norwegian chrome on the English page: ${m.key} = "${m.value.slice(0, 60)}"`)
            }
          } else {
            console.log(
              `  ok   ${label}${seeded.length ? `  (${seeded.length} Norwegian seed value(s), by design)` : ''}`,
            )
          }
        } catch (e) {
          failures++
          console.log(`  ERROR ${label}: ${e instanceof Error ? e.message : e}`)
        }
      }
    }
    await ctx.close()
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
      ? `\nEnglish renders clean across every administrator route (${NORWEGIAN_ONLY.length} messages checked)`
      : `\n${failures} route/state(s) still show Norwegian or a raw key`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
