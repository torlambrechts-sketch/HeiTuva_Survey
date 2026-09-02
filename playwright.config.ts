import { defineConfig, devices } from '@playwright/test'

/**
 * Two viewports, matching CLAUDE.md's fidelity targets: the app is
 * pixel-perfect at >=1280px desktop, and the respondent flow at /s/[token] is
 * mobile-first at 380-420px.
 *
 * deviceScaleFactor 2 on desktop so captures are retina and text rendering
 * matches what a reviewer sees; a 1x capture would show false diffs against
 * the design reference.
 */
export const BASE_URL = process.env.HEITUVA_BASE_URL ?? 'http://127.0.0.1:3100'

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    // Norwegian is the source language; capture in it by default so the
    // screenshots compare against the design's own copy.
    locale: 'nb-NO',
    timezoneId: 'Europe/Oslo',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
  ],
})
