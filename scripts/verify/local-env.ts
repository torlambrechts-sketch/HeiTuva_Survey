/**
 * Environment for the server the browser harness starts under `--local`.
 *
 * This exists because of a defect that made the harness lie: the capture
 * script skips loading `.env.local` when `--local` is passed, but the Next
 * server it spawns loads `.env.local` itself — so the browser was driving the
 * REMOTE project while the harness believed it was local. The demo personas
 * only exist locally, so every signed-in capture would have failed to sign in,
 * and any write the harness makes would have landed in production.
 *
 * Values already present in `process.env` win over a dotenv file in Next, so
 * setting them on the spawned child is what actually pins it to the local
 * stack. They match the local stack's fixed development keys — the same
 * constants tests/db/clients.ts falls back to.
 */
export const LOCAL_SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  SUPABASE_SERVICE_ROLE_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
} as const
