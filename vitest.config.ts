import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The invariant suite shares one local database, so tests must not race.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/visual/**', 'node_modules/**'],
  },
})
