/**
 * Read a configuration variable in whichever runtime is hosting us.
 *
 * The worker exists twice on purpose: `scripts/mail-worker.ts` runs under Node
 * for local proving, and `supabase/functions/mail-worker/` runs under Deno on
 * the Supabase Edge Runtime, which is where it runs in production. They share
 * the provider and the copy, so the provider cannot assume `process.env`.
 *
 * Deno first, then Node: under Deno the Node compatibility shim may also expose
 * a `process`, and the platform's own accessor is the one to trust. Under Node
 * `Deno` is absent and this is `process.env[name]` with two extra lookups.
 *
 * Reading at CALL time rather than at module load stays intact — that is what
 * lets a test set a variable and lets a client bundle that somehow imported this
 * hold no keys.
 */
type EnvHosts = {
  Deno?: { env?: { get?: (name: string) => string | undefined } }
  process?: { env?: Record<string, string | undefined> }
}

export function readEnv(name: string): string | undefined {
  const host = globalThis as unknown as EnvHosts
  const fromDeno = host.Deno?.env?.get?.(name)
  if (fromDeno !== undefined) return fromDeno
  return host.process?.env?.[name]
}
