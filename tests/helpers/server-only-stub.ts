/**
 * A stub for the `server-only` package, used ONLY by vitest (see the alias in
 * vitest.config.ts). The real package throws unless resolved under React's
 * `react-server` condition, which is how it turns «this module reached a client
 * bundle» into a build error. Vitest runs in Node, so the condition it asserts
 * is already true and the throw is a false positive.
 *
 * It is stubbed here rather than removed from the modules that import it:
 * `server-only` is what keeps `createAdminClient` — the SERVICE ROLE, which
 * bypasses every RLS policy including the k-anonymity gate — out of anything
 * shipped to a browser. Testing convenience does not outrank that.
 */
export {}
