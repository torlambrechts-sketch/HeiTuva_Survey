import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

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
  },
})
