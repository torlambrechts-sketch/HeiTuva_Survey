import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import CensusReporter from './tests/census'

export default defineConfig({
  // tsconfig's "@/*" path alias. Type-only imports of it already worked here
  // because they are erased before Vite sees them; a runtime import needs the
  // alias, so unit tests can import app modules the way the app does.
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url).href).replace(/\/$/, '') },
  },
  test: {
    // The invariant suite shares one local database, so tests must not race.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/visual/**', 'node_modules/**'],
    // 'default' keeps the normal output; the census reporter runs beside it and
    // fails the run if any file collected fewer tests than tests/expected-counts.json
    // commits it to. A suite that collects nothing and reports success is the
    // worst failure mode available, and this is what makes it impossible.
    reporters: ['default', new CensusReporter()],
  },
})
