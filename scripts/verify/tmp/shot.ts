import { chromium } from '@playwright/test'
import { config } from 'dotenv'
import { BASE_URL, ensureServer } from '../server'
import { serviceClient } from '../../../tests/db/clients'
import { signIn } from '../../../tests/helpers/session'
config({ path: '.env.local', quiet: true })
const OUT = process.env.SHOT_DIR!
async function main() {
  const server = await ensureServer()
  const svc = serviceClient()
  const { data: s } = await svc.from('surveys').select('id')
    .eq('title', 'Arbeidsmiljø — månedlig').single()
  // A live weekly series on the demo survey, so the chips and the status row
  // have something real to draw.
  await svc.from('schedules').delete().eq('survey_id', s!.id)
  await svc.from('schedules').insert({
    survey_id: s!.id, cadence: 'weekly', runs_total: 12, runs_done: 3,
    next_run_at: new Date(Date.now() + 6 * 86400000).toISOString(), active: true,
  })
  const browser = await chromium.launch()
  for (const [w, h, tag] of [[1440, 1100, 'desktop'], [390, 900, 'mobile']] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await signIn(page, 'redaktor', BASE_URL)
    const go = async (path: string, name: string) => {
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('load')
      await page.screenshot({ path: `${OUT}/${name}-${tag}.png`, fullPage: true })
    }
    await go('/undersokelser', 'list-recurrence')
    await go(`/undersokelser/${s!.id}/send`, 'send-recurrence')
    // …and the custom editor, which only appears once the cadence is chosen.
    const custom = page.getByRole('button', { name: /Tilpasset/ }).first()
    if (await custom.count()) {
      await custom.click(); await page.waitForTimeout(300)
      await page.screenshot({ path: `${OUT}/send-custom-${tag}.png`, fullPage: true })
    }
    await go('/undersokelser/ny', 'wizard-recurrence')
    await page.close()
  }
  await browser.close(); server.stop(); console.log('shots written')
}
main().catch((e) => { console.error(e); process.exit(1) })
