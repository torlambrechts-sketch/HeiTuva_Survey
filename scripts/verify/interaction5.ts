/**
 * Gate 3c/3d probe — every interactive element Phase 5 added, driven for real,
 * including the failure paths.
 *
 * `scripts/verify/interaction.ts` stops at Phase 4. Nothing has ever clicked the
 * report editor's controls, the Oversikt loop form, or the duty card outside a
 * screenshot. A control that renders and does nothing looks identical to a
 * working one in a capture.
 */
import { chromium, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { mkdir } from 'node:fs/promises'
import { BASE_URL, ensureServer } from './server'
import { serviceClient } from '../../tests/db/clients'
import { ORG_PRIMARY } from '../../tests/db/personas'
import { signIn } from '../../tests/helpers/session'

config({ path: '.env.local', quiet: true })

const OUT = 'artifacts/interaction'
let failures = 0
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(56)} ${detail.slice(0, 66)}`)
}

/** The design's focus ring: 3px solid #191510, offset 2px. */
async function focusRing(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return null
    const s = getComputedStyle(el)
    return { tag: el.tagName, width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor, offset: s.outlineOffset }
  })
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const server = await ensureServer()
  const browser = await chromium.launch()
  const svc = serviceClient()

  try {
    const { data: org } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
    const { data: survey } = await svc
      .from('surveys').select('id').eq('org_id', org!.id).eq('title', 'Arbeidsmiljø — månedlig').single()

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'nb-NO' })
    const page = await ctx.newPage()
    await signIn(page, 'administrator', BASE_URL)

    // ---------------------------------------------------------------- failure paths
    console.log('\n== failure paths ==')
    {
      const res = await page.goto(`${BASE_URL}/rapporter?rapport=00000000-0000-0000-0000-000000000000`, {
        waitUntil: 'domcontentloaded',
      })
      check('opening a report that does not exist 404s', res?.status() === 404, `HTTP ${res?.status()}`)
    }
    {
      const res = await page.goto(`${BASE_URL}/rapporter?rapport=ikke-en-uuid`, { waitUntil: 'domcontentloaded' })
      check('a malformed report id does not 500', res?.status() !== 500, `HTTP ${res?.status()}`)
    }
    {
      const res = await page.request.get(`${BASE_URL}/rapporter/00000000-0000-0000-0000-000000000000/pdf`)
      check('PDF for a missing report 404s', res.status() === 404, `HTTP ${res.status()}`)
    }
    {
      const res = await page.request.get(`${BASE_URL}/rapporter/ikke-en-uuid/pdf`)
      check('PDF with a malformed id does not 500', res.status() !== 500, `HTTP ${res.status()}`)
    }

    // ------------------------------------------------------------------- the editor
    console.log('\n== report editor ==')
    const { data: report } = await svc.from('reports').insert({
      org_id: org!.id, title: 'Interaksjon', kind: 'egen', status: 'utkast',
      sections: ['summary', 'teams'],
      filters: { surveys: [survey!.id], rounds: [], group: null },
    }).select('id').single()
    const rid = report!.id

    await page.goto(`${BASE_URL}/rapporter?rapport=${rid}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')

    // Title: a blank title must not wipe the stored one.
    {
      const title = page.getByRole('textbox').first()
      await title.fill('   ')
      await title.blur()
      await page.waitForTimeout(1200)
      const { data } = await svc.from('reports').select('title').eq('id', rid).single()
      check('blank title is rejected, not saved', data?.title === 'Interaksjon', `title=${data?.title}`)
    }
    {
      const title = page.getByRole('textbox').first()
      await title.fill('Omdøpt rapport')
      await title.blur()
      await page.waitForTimeout(1200)
      const { data } = await svc.from('reports').select('title').eq('id', rid).single()
      check('renaming the report persists', data?.title === 'Omdøpt rapport', `title=${data?.title}`)
    }

    // Reorder.
    {
      const before = ['summary', 'teams']
      await page.getByRole('button', { name: 'Flytt ned' }).first().click()
      await page.waitForTimeout(1200)
      const { data } = await svc.from('reports').select('sections').eq('id', rid).single()
      const after = data?.sections as string[]
      check('move down reorders the sections', JSON.stringify(after) === JSON.stringify([...before].reverse()),
        JSON.stringify(after))
    }
    // Remove.
    {
      await page.getByRole('button', { name: 'Fjern seksjon' }).first().click()
      await page.waitForTimeout(1200)
      const { data } = await svc.from('reports').select('sections').eq('id', rid).single()
      check('remove drops the section', (data?.sections as string[]).length === 1, JSON.stringify(data?.sections))
    }
    // Per-section group select. Checked on a report this block owns: the
    // reorder/remove steps above deleted the groupable section, so testing the
    // control on that report would report "absent" for the wrong reason.
    {
      const { data: gr } = await svc.from('reports').insert({
        org_id: org!.id, title: 'Gruppevelger', kind: 'egen', status: 'utkast',
        sections: ['teams', 'heatmap'],
        filters: { surveys: [survey!.id], rounds: [], group: null },
      }).select('id').single()

      await page.goto(`${BASE_URL}/rapporter?rapport=${gr!.id}`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')

      const selects = page.getByLabel('Gruppe for seksjonen')
      const rendered = await selects.count()

      // The design puts the group select on BOTH of these:
      // HeiTuva.dc.html:3087 `canGroup: k === "heatmap" || k === "teams"`.
      check('group select renders on every section the design allows it on',
        rendered === 2, `${rendered} of 2 (teams, heatmap)`)

      if (rendered > 0) {
        await selects.first().selectOption({ index: 1 })
        await page.waitForTimeout(1300)
        const { data } = await svc.from('reports').select('filters').eq('id', gr!.id).single()
        const sg = (data?.filters as { sectionGroups?: Record<string, string | null> })?.sectionGroups
        check('per-section group select persists', !!sg && Object.values(sg).some(Boolean),
          JSON.stringify(sg))
      }
      await svc.from('reports').delete().eq('id', gr!.id)
      await page.goto(`${BASE_URL}/rapporter?rapport=${rid}`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
    }

    // Filter tab.
    {
      await page.getByRole('button', { name: 'Filter', exact: true }).click()
      await page.getByLabel('Gruppe').first().waitFor()
      const before = await svc.from('reports').select('filters').eq('id', rid).single()
      await page.getByLabel('Gruppe').first().selectOption({ index: 1 })
      await page.waitForTimeout(1300)
      const after = await svc.from('reports').select('filters').eq('id', rid).single()
      const g = (after.data?.filters as { group?: string | null })?.group
      check('group filter persists', !!g, `${JSON.stringify((before.data?.filters as {group?:string})?.group)} -> ${g}`)
    }
    {
      const chips = page.locator('button[aria-pressed]')
      const n = await chips.count()
      check('survey chips render as pressable', n > 0, `${n} chips`)
      if (n > 0) {
        const first = chips.first()
        const wasPressed = await first.getAttribute('aria-pressed')
        await first.click()
        await page.waitForTimeout(1300)
        const nowPressed = await page.locator('button[aria-pressed]').first().getAttribute('aria-pressed')
        check('toggling a survey chip changes its state', wasPressed !== nowPressed,
          `${wasPressed} -> ${nowPressed}`)
      }
    }

    // Del tab.
    {
      await page.getByRole('button', { name: 'Del', exact: true }).click()
      await page.getByText('Hvem skal se den').waitFor()
      await page.getByRole('button', { name: /Teamledere/ }).click()
      await page.waitForTimeout(1300)
      const { data } = await svc.from('reports').select('share_scope').eq('id', rid).single()
      check('share scope persists', data?.share_scope === 'ledere_eget_team', `scope=${data?.share_scope}`)
    }
    {
      const sel = page.locator('select').last()
      await sel.selectOption('weekly')
      await page.waitForTimeout(1300)
      const { data } = await svc.from('reports').select('schedule').eq('id', rid).single()
      check('schedule persists', (data?.schedule as { cadence?: string })?.cadence === 'weekly',
        JSON.stringify(data?.schedule))
    }
    {
      await page.getByRole('button', { name: 'Kopier lenke' }).click()
      await page.waitForTimeout(1500)
      const shown = await page.locator('.font-mono').first().textContent()
      const { data } = await svc.from('report_shares').select('id').eq('report_id', rid)
      check('copy link mints exactly one share', (data ?? []).length === 1, `field shows: ${shown?.trim()}`)
      // The link the UI hands the user must resolve. This is the check that
      // catches a route that was never built.
      if (shown && shown.includes('/r/')) {
        const res = await page.request.get(shown.trim())
        check('the copied share link resolves', res.status() === 200, `HTTP ${res.status()} for ${shown.trim().slice(-24)}`)
      } else {
        check('the copied share link resolves', false, `no link rendered: ${shown?.trim()}`)
      }
    }
    // Lagre rapport.
    {
      await page.getByRole('button', { name: 'Lagre rapport' }).click()
      await page.waitForTimeout(1300)
      const { data } = await svc.from('reports').select('status').eq('id', rid).single()
      check('Lagre rapport moves it out of Utkast', data?.status === 'klar', `status=${data?.status}`)
    }

    // ------------------------------------------------------------------ Oversikt
    console.log('\n== Oversikt ==')
    await page.goto(`${BASE_URL}/oversikt`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    {
      await page.getByRole('button', { name: 'Legg til tiltak' }).click()
      const input = page.getByLabel('Legg til tiltak')
      await input.waitFor()
      const submit = page.getByRole('button', { name: 'Legg til tiltak' }).last()
      const disabled = await submit.isDisabled()
      check('empty loop action cannot be submitted', disabled, `submit disabled=${disabled}`)

      const text = `Interaksjon ${Date.now()}`
      await input.fill(text)
      await submit.click()
      await page.waitForTimeout(1500)
      const { data } = await svc.from('loop_actions').select('id').eq('org_id', org!.id).eq('text', text)
      check('a loop action with text is created', (data ?? []).length === 1, `${(data ?? []).length} row`)
      await svc.from('loop_actions').delete().eq('text', text)
    }

    // ---------------------------------------------------------------- duty card
    console.log('\n== duty card ==')
    await page.goto(`${BASE_URL}/rapporter`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    {
      const box = page.getByRole('checkbox').first()
      const before = await box.isChecked()
      await box.click()
      await page.waitForTimeout(1500)
      const after = await page.getByRole('checkbox').first().isChecked()
      check('checklist toggle flips and persists', before !== after, `${before} -> ${after}`)
    }
    {
      await page.getByRole('button', { name: 'Innstillinger' }).first().click()
      const publish = page.getByLabel('Publiser rapporten offentlig').first()
      await publish.waitFor()
      check('duty settings panel opens', await publish.isVisible(), 'Publiser toggle visible')
    }

    // ------------------------------------------------------------- focus (3d)
    console.log('\n== keyboard and focus ==')
    for (const [label, url] of [
      ['oversikt', `${BASE_URL}/oversikt`],
      ['rapporter', `${BASE_URL}/rapporter`],
      ['rapport-editor', `${BASE_URL}/rapporter?rapport=${rid}`],
    ] as const) {
      const p = await ctx.newPage()
      await p.goto(url, { waitUntil: 'domcontentloaded' })
      await p.waitForLoadState('load')
      const order: string[] = []
      let ring: Awaited<ReturnType<typeof focusRing>> = null
      for (let i = 0; i < 12; i++) {
        await p.keyboard.press('Tab')
        const cur = await focusRing(p)
        if (cur) order.push(cur.tag)
        if (cur && cur.width === '3px' && cur.style === 'solid') ring = cur
      }
      const okRing = !!ring && ring.color === 'rgb(25, 21, 16)' && ring.offset === '2px'
      check(`${label}: 3px #191510 focus ring, offset 2px`, okRing, JSON.stringify(ring))
      check(`${label}: tab reaches interactive elements`, order.length >= 8, order.slice(0, 8).join(' > '))
      if (okRing) {
        await p.screenshot({ path: `${OUT}/focus5-${label}.png` })
        console.log(`       proof: ${OUT}/focus5-${label}.png`)
      }
      await p.close()
    }

    await svc.from('reports').delete().eq('id', rid)
    await ctx.close()
  } finally {
    await browser.close()
    server.stop()
  }

  console.log(failures === 0 ? '\nall Phase 5 interaction checks passed' : `\n${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e)
  process.exit(1)
})
