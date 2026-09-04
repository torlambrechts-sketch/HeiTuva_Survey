/**
 * VERIFY.md Gate 3c/3d — interaction and keyboard, exercised rather than
 * assumed.
 *
 * Three things the capture sweep cannot tell you, because it only loads a page
 * and looks at it:
 *
 * - 3c: what happens on the FAILURE paths. Submitting an empty required field,
 *   saving an invalid value, opening a record that does not exist. A screen
 *   that renders beautifully and swallows a bad save is still broken.
 * - 3d: whether tab order is sensible and the design's 3px focus ring actually
 *   appears. The ring is asserted as a measurement (it was lost once to a
 *   Tailwind `outline-none` that won the cascade), and the order is recorded so
 *   a reviewer can read it.
 * - a focused-state screenshot, as the gate asks for proof.
 */
import { chromium, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { mkdir } from 'node:fs/promises'
import { BASE_URL, ensureServer } from './server'
import { signIn } from '../../tests/helpers/session'
import { serviceClient } from '../../tests/db/clients'

config({ path: '.env.local', quiet: true })

const OUT = 'artifacts/interaction'
let failures = 0

function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(56)} ${detail.slice(0, 90)}`)
}

/** The focus ring CLAUDE.md specifies: 3px solid #191510, offset 2px. */
async function focusRing(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el) return null
    const s = getComputedStyle(el)
    return {
      tag: el.tagName.toLowerCase(),
      label:
        el.getAttribute('aria-label') ||
        (el.textContent ?? '').trim().slice(0, 30) ||
        (el as HTMLInputElement).name ||
        '',
      width: s.outlineWidth,
      style: s.outlineStyle,
      color: s.outlineColor,
      offset: s.outlineOffset,
    }
  })
}

/** Tab n times and report what the focus landed on, in order. */
async function tabOrder(page: Page, steps: number) {
  const seen: string[] = []
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab')
    const f = await focusRing(page)
    if (!f) break
    seen.push(`${f.tag}${f.label ? `[${f.label}]` : ''}`)
  }
  return seen
}

async function main() {
  const server = await ensureServer()
  const browser = await chromium.launch()
  await mkdir(OUT, { recursive: true })

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nb-NO' })
    const page = await ctx.newPage()

    console.log('\n== 3c: failure paths ==')

    // Empty required field: the browser must refuse to submit, and the form
    // must still be on screen afterwards.
    {
      await page.goto(`${BASE_URL}/logg-inn`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: /^Logg inn$/ }).click()
      await page.waitForTimeout(600)
      const stillHere = new URL(page.url()).pathname === '/logg-inn'
      const invalid = await page.evaluate(
        () => !(document.querySelector('input[name="email"]') as HTMLInputElement)?.validity.valid,
      )
      check('empty required login refuses to submit', stillHere && invalid, `on ${new URL(page.url()).pathname}, email invalid=${invalid}`)
    }

    // Invalid value: a malformed email must be rejected by validation, not
    // sent to the server and quietly accepted.
    {
      await page.fill('input[name="email"]', 'ikke-en-epost')
      await page.fill('input[name="password"]', 'noe')
      await page.getByRole('button', { name: /^Logg inn$/ }).click()
      await page.waitForTimeout(600)
      const invalid = await page.evaluate(
        () => !(document.querySelector('input[name="email"]') as HTMLInputElement)?.validity.valid,
      )
      check('malformed email rejected', invalid, `type=email validity.valid=false`)
    }

    // Wrong credentials: a generic error, and never a hint about which half
    // was wrong.
    {
      await page.fill('input[name="email"]', 'ingen@example.test')
      await page.fill('input[name="password"]', 'feil-passord')
      await page.getByRole('button', { name: /^Logg inn$/ }).click()
      const alert = page.locator('p[role="alert"]')
      await alert.waitFor({ state: 'visible', timeout: 15_000 })
      const text = (await alert.innerText()).trim()
      const leaks = /finnes ikke|not found|ukjent bruker|wrong password/i.test(text)
      check('bad credentials give a generic error', !leaks && text.length > 0, text)
    }

    await signIn(page, 'administrator', BASE_URL)

    // A record that does not exist must 404, not 500 and not leak.
    {
      const res = await page.goto(
        `${BASE_URL}/undersokelser/00000000-0000-0000-0000-000000000000/bygg`,
        { waitUntil: 'domcontentloaded' },
      )
      check('missing survey returns 404', res?.status() === 404, `HTTP ${res?.status()}`)
    }

    // A malformed id must not 500 either.
    {
      const res = await page.goto(`${BASE_URL}/undersokelser/not-a-uuid/bygg`, {
        waitUntil: 'domcontentloaded',
      })
      const status = res?.status() ?? 0
      check('malformed survey id does not 500', status !== 500, `HTTP ${status}`)
    }

    // An invalid value through a real server action: a blank company name is
    // refused by Zod, and the UI says so rather than silently discarding it.
    {
      await page.goto(`${BASE_URL}/administrasjon`, { waitUntil: 'domcontentloaded' })
      const name = page.locator('input[name="name"]').first()
      const before = await name.inputValue()
      await name.fill('')
      await name.blur()
      await page.waitForTimeout(1200)
      const after = await page.locator('input[name="name"]').first().inputValue()
      // Read the row, not the field: the question is whether the blank was
      // PERSISTED, and a probe that asserts `true` proves nothing. Zod's
      // `.min(1)` should have refused it in the action.
      const { data: row } = await serviceClient()
        .from('organizations')
        .select('name')
        .eq('name', before)
        .limit(1)
      check(
        'empty company name is refused by validation',
        (row?.length ?? 0) === 1,
        `db still holds "${before}"; field showed "${after}"`,
      )
      await page.locator('input[name="name"]').first().fill(before)
      await page.locator('input[name="name"]').first().blur()
      await page.waitForTimeout(1000)
    }

    console.log('\n== 3d: keyboard and focus ==')

    for (const [label, path] of [
      ['logg-inn', '/logg-inn'],
      ['oversikt', '/'],
      ['profil', '/profil'],
      ['administrasjon', '/administrasjon'],
      ['bibliotek', '/bibliotek'],
      ['undersokelser', '/undersokelser'],
      // The Builder has no fixed path — it is reached through a survey, and it
      // is the densest screen in the app, so leaving it out of the keyboard
      // gate left its whole control surface unchecked.
      ['bygg', '/undersokelser#bygg'],
      ['dashboard', '/dashboard'],
      // Resultater is reached through a survey too, and it is where Phase 4's
      // controls live: the survey picker, the industry chips, the theme chips.
      ['resultater', '/undersokelser#resultater'],
    ] as const) {
      const p = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nb-NO' })
      const pg = await p.newPage()
      if (path !== '/logg-inn') await signIn(pg, 'administrator', BASE_URL)
      await pg.goto(`${BASE_URL}${path.replace(/#.*$/, '')}`, { waitUntil: 'domcontentloaded' })
      await pg.waitForLoadState('load')
      if (path.endsWith('#bygg')) {
        await pg.getByRole('link', { name: 'Fortsett å bygge' }).first().click()
        await pg.waitForURL((u) => u.pathname.endsWith('/bygg'))
        await pg.waitForLoadState('load')
      }
      if (path.endsWith('#resultater')) {
        await pg.getByRole('link', { name: 'Se svar' }).first().click()
        await pg.waitForURL((u) => u.pathname.endsWith('/resultater'))
        await pg.waitForLoadState('load')
      }

      const order = await tabOrder(pg, 8)
      const ring = await focusRing(pg)
      const ok =
        ring !== null &&
        ring.width === '3px' &&
        ring.style === 'solid' &&
        ring.color === 'rgb(25, 21, 16)' &&
        ring.offset === '2px'
      check(`${label}: 3px focus ring on a focused control`, ok, JSON.stringify(ring))
      console.log(`       tab order: ${order.join(' → ')}`)

      if (label === 'logg-inn' || label === 'resultater') {
        await pg.screenshot({ path: `${OUT}/focus-ring-${label}.png` })
        console.log(`       proof: ${OUT}/focus-ring-${label}.png`)
      }
      await p.close()
    }

    await ctx.close()
  } finally {
    await browser.close()
    server.stop()
  }

  console.log(failures === 0 ? '\nall interaction checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
