import { chromium, webkit } from '@playwright/test'

/**
 * A missing browser must not read as a failing screenshot.
 *
 * The `mobile` project is `devices['iPhone 13']`, which is WebKit — a browser
 * `npx playwright install chromium` does not provide. When it is absent every
 * mobile test fails individually with Playwright's own install banner, six
 * lookalike failures whose summary lines ("login screen", "the new-survey
 * wizard") read like six visual regressions. That is the wrong debt to hand a
 * reviewer, and it is also how a genuine mobile regression gets dismissed as
 * "oh, that's just the browser thing".
 *
 * So the run stops here instead, once, naming whichever browser is missing and
 * how to get it. Nothing after this point is ambiguous: if a project runs at
 * all its browser is present, and a failure in it is a failure of the page.
 *
 * Playwright's global setup, not a new gate — it adds no assertion and cannot
 * fail a run that would otherwise pass.
 */
export default async function globalSetup() {
  const { existsSync } = await import('node:fs')

  // Both, named separately: reporting "WebKit is missing" when Chromium is the
  // one that is gone would be the same mistake one level down.
  const needed = [
    {
      name: 'Chromium (the browser behind the "desktop" project)',
      path: chromium.executablePath(),
      howto: 'npx playwright install --with-deps chromium',
    },
    {
      name: 'WebKit (the browser behind the "mobile" project, devices[\'iPhone 13\'])',
      path: webkit.executablePath(),
      howto: 'npx playwright install --with-deps webkit',
    },
  ]
  const missing = needed.filter((b) => !existsSync(b.path))
  if (missing.length === 0) return

  throw new Error(
    [
      '',
      'DEPENDENCY MISSING — the visual suite did not run.',
      '',
      ...missing.flatMap((b) => [
        `  ${b.name}`,
        `    expected at : ${b.path}`,
        `    provide it  : ${b.howto}`,
        '',
      ]),
      'This is NOT a screenshot failure: no test ran, so nothing here has said',
      'anything about the pages. Install the above and re-run — and if a',
      'screenshot fails once it is present, that failure is real.',
      '',
    ].join('\n'),
  )
}
