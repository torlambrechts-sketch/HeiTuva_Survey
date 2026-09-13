/**
 * Q172 — drive the library, rather than trust the diff.
 *
 * The walk of 2026-09-12 found two screens dead behind seventeen green gates
 * because nothing pressed a button. This presses them: every subnav pill, in
 * both languages, at 1440 and at 320, recording what the page actually says and
 * whether anything reached the console.
 */
import { execFileSync } from 'node:child_process'
import { chromium, type ConsoleMessage, type Page } from '@playwright/test'
import { BASE_URL, ensureServer, serverLogTail } from '../verify/server'
// The suite's own helper rather than a second sign-in: a walk that logs in its
// own way proves its own way works.
import { signIn } from '../../tests/helpers/session'

const DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
/**
 * The locale is `profiles.lang` (lib/i18n/resolve-locale.ts), not a control on
 * the page — the first version of this driver flipped a `<select>` it had
 * guessed at, and every «en» row came back in Norwegian. `verify:i18n` switches
 * it in the database, so this does too.
 */
const setLang = (lang: 'no' | 'en') =>
  execFileSync('psql', [
    DB_URL,
    '-tAc',
    `update profiles set lang = '${lang}' where user_id = (select u.id from auth.users u where u.email = 'admin@nordiskstudio.test')`,
  ], { encoding: 'utf8' }).trim()

type Row = { where: string; got: string }

async function readScreen(page: Page, base: string, path: string): Promise<Row[]> {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  const out: Row[] = []
  const nav = page.locator('nav[aria-label]').filter({ hasText: /Bibliotek|Library/ }).first()
  out.push({
    where: 'subnav label',
    got: (await nav.locator('span').first().textContent().catch(() => '')) ?? '',
  })
  const pills = nav.getByRole('link')
  const n = await pills.count()
  const labels: string[] = []
  let current = ''
  for (let i = 0; i < n; i++) {
    const p = pills.nth(i)
    const text = ((await p.textContent()) ?? '').trim()
    labels.push(text)
    if ((await p.getAttribute('aria-current')) === 'page') current += `${text} `
  }
  out.push({ where: 'subnav pills', got: labels.join(' · ') })
  out.push({ where: 'aria-current', got: current.trim() || '(none)' })
  out.push({ where: 'breadcrumb', got: ((await page.locator('main > div').first().textContent()) ?? '').trim() })
  out.push({ where: 'h1', got: ((await page.locator('h1').first().textContent()) ?? '').trim() })
  out.push({
    where: 'count line',
    got: ((await page.locator('h1').first().locator('xpath=following-sibling::div[1]').textContent()) ?? '').trim(),
  })
  // The card: its heading is the first display-font span inside the box.
  const card = page.locator('main .rounded-\\[20px\\]').first()
  out.push({
    where: 'card',
    got: (await card.count()) ? ((await card.locator('span').first().textContent()) ?? '').trim() : '(no card)',
  })
  out.push({
    where: 'filter chips in card',
    got: (await card.count()) ? String(await card.locator('a[href*="kategori"], a[href="/bibliotek"]').count()) : '0',
  })
  /*
    The old in-page rail. **«ANY LINK CARRYING ?fane=» IS THE WRONG MEASURE AND
    THE FIRST VERSION OF THIS DRIVER USED IT** — it reported 14 on the bank tab,
    which are the CATEGORY chips, each of which must carry `fane=bank` or
    filtering would throw you back to Maler. A rail is links to OTHER tabs, so
    that is what is counted.
  */
  const hrefs = await page.locator('main a[href*="fane="]').evaluateAll((els) =>
    els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''),
  )
  const here = new URL(page.url()).searchParams.get('fane') ?? 'maler'
  const otherTab = hrefs.filter(
    (h) => (new URL(h, 'https://x').searchParams.get('fane') ?? 'maler') !== here,
  )
  out.push({
    where: 'links to a DIFFERENT tab',
    got: otherTab.length ? `${otherTab.length} — ${[...new Set(otherTab)].join(' ')}` : '0',
  })
  out.push({ where: 'links carrying this tab', got: String(hrefs.length - otherTab.length) })
  const raw = await page.locator('body').innerText()
  const rawKeys = raw.match(/\b(library|nav|tasks)\.[a-zA-Z]+\b/g) ?? []
  out.push({ where: 'raw message keys rendered', got: rawKeys.length ? rawKeys.join(', ') : 'none' })
  return out
}

async function main() {
  const { stop } = await ensureServer()
  const base = BASE_URL
  const browser = await chromium.launch()
  const errors: string[] = []
  try {
    for (const [lang, viewport] of [
      ['no', { width: 1440, height: 900 }],
      ['en', { width: 1440, height: 900 }],
      ['no', { width: 320, height: 800 }],
    ] as const) {
      const ctx = await browser.newContext({ viewport, locale: lang === 'no' ? 'nb-NO' : 'en-GB' })
      const page = await ctx.newPage()
      page.on('console', (m: ConsoleMessage) => {
        if (m.type() === 'error') errors.push(`[${lang}@${viewport.width}] ${m.text()}`)
      })
      page.on('pageerror', (e) => errors.push(`[${lang}@${viewport.width}] pageerror: ${e.message}`))
      setLang(lang)
      await signIn(page, 'administrator', base)
      for (const path of ['/bibliotek', '/bibliotek?fane=bank', '/bibliotek?fane=bruksomrader']) {
        console.log(`\n── ${lang} @${viewport.width} · ${path} ──`)
        for (const r of await readScreen(page, base, path)) {
          console.log(`   ${r.where.padEnd(26)} ${r.got.slice(0, 150)}`)
        }
        const doc = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }))
        console.log(`   ${'document'.padEnd(26)} scrollWidth=${doc.sw} clientWidth=${doc.cw} overflow=${Math.max(0, doc.sw - doc.cw)}`)
      }
      await ctx.close()
    }
  } finally {
    setLang('no')
    await browser.close()
    stop()
  }
  console.log(`\nconsole/page errors: ${errors.length}`)
  for (const e of errors) console.log(`   ${e}`)
  const tail = serverLogTail()
  if (tail) console.log(tail)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
