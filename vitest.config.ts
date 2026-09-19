import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import CensusReporter from './tests/census'

export default defineConfig({
  // tsconfig's "@/*" path alias. Type-only imports of it already worked here
  // because they are erased before Vite sees them; a runtime import needs the
  // alias, so unit tests can import app modules the way the app does.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url).href).replace(/\/$/, ''),
      // `server-only` is a build-time assertion, not a runtime dependency: its
      // package exports throw under any condition but React's server one, so
      // importing a server module here fails with «cannot be imported from a
      // Client Component». Vitest runs in Node and IS the server, so the guard
      // is asserting something already true. Stubbed rather than removed from
      // the modules — the guard is what keeps `createAdminClient` out of a
      // browser bundle, and that is worth more than the convenience of testing.
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    // The invariant suite shares one local database, so tests must not race.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    // N10.7 — per-file teardown for the auth users a fixture creates.
    // Dropping an organisation cascades org_members and cannot reach
    // `auth.users`, which is global: two suite runs left 64 orphans.
    // A setup file covers every test file, including ones not yet written.
    setupFiles: ['./tests/helpers/cleanup.ts'],
    exclude: ['tests/visual/**', 'node_modules/**'],
    // 'default' keeps the normal output; the census reporter runs beside it and
    // fails the run if any file collected fewer tests than tests/expected-counts.json
    // commits it to. A suite that collects nothing and reports success is the
    // worst failure mode available, and this is what makes it impossible.
    reporters: ['default', new CensusReporter()],
  },
})
