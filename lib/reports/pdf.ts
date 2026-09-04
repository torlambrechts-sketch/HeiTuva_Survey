import 'server-only'

import { chromium, type Browser } from 'playwright-core'

/**
 * One Chromium, two homes.
 *
 * On Vercel the function runs in a Lambda that has no browser, so
 * `@sparticuz/chromium` ships one and reports where it unpacked it. Locally
 * (and in CI) there is a real Chromium already — the Playwright browsers
 * directory the container sets up — and downloading a second one would be both
 * slow and a different binary from the one the visual suite renders with.
 *
 * playwright-core rather than puppeteer-core deliberately: it has no
 * dependencies at all, where puppeteer-core pulls in `@puppeteer/browsers` and
 * with it the `extract-zip` symlink-traversal advisory, for a browser
 * downloader this never uses. Same API surface for what is needed here, and the
 * same library the test suite already drives.
 */
async function launch(): Promise<Browser> {
  // An explicit path always wins — it is how a container with its own Chromium
  // says so without this file having to recognise the container.
  const pinned = process.env.CHROMIUM_EXECUTABLE_PATH
  if (pinned) return chromium.launch({ executablePath: pinned, args: ['--no-sandbox'] })

  if (!process.env.VERCEL) {
    // Local and CI: reuse the browser the visual suite already renders with,
    // so the PDF is printed by the same build as the screenshots rather than a
    // second Chromium of a different version.
    try {
      return await chromium.launch({
        executablePath: chromium.executablePath(),
        args: ['--no-sandbox'],
      })
    } catch {
      // Fall through to the bundled one rather than failing the export: a
      // developer without Playwright's browsers installed still gets a PDF.
    }
  }

  const sparticuz = (await import('@sparticuz/chromium')).default
  return chromium.launch({
    executablePath: await sparticuz.executablePath(),
    args: sparticuz.args,
    headless: true,
  })
}

/**
 * Prints already-rendered HTML. It never navigates: `setContent` with
 * `waitUntil: 'load'` over a self-contained string means the browser makes no
 * request of its own, so there is no way for the printer to reach the app, the
 * database, or the network on behalf of whoever asked for the export.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await launch()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
    })
  } finally {
    await browser.close()
  }
}
