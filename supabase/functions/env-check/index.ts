// A ONE-OFF DIAGNOSTIC, deployed to answer one question and then deleted.
//
// Three probes in a row returned a byte-identical key fingerprint, which means
// the value never changed — so the question stopped being «is this key right»
// and became «is the save reaching this project at all». Two candidates
// survive: the secret was edited in a DIFFERENT PROJECT, or a SECOND SECRET
// with a near-identical name shadows the one being edited (`BREVO_API_KEY `
// with a trailing space is a different variable, and trimming the VALUE cannot
// help — the defect is in the NAME).
//
// WHY THIS IS A SEPARATE FUNCTION rather than another branch in the worker:
// the question is about the DEPLOYMENT, not about the worker, and Supabase
// secrets are project-wide so any function in the project sees the same values.
// Redeploying the production sender to ask an environment question would put
// the one working thing at risk of a transcription error for no benefit.
//
// NOT A LIST OF NAMES I GUESSED. `Deno.env.toObject()` is asked what is really
// there and everything matching is reported, so a spelling nobody predicted
// shows up too — CLAUDE.md's «enumeration mistaken for a property», applied to
// the diagnosis rather than to the code.
//
// VALUES ARE NEVER RETURNED: names, lengths, whether Brevo's API prefix is
// present, and four trailing characters. A name is not a secret, and four
// trailing characters of a ~90-character one leave it untouched. Behind the
// worker's own credential, because even this much is operational detail.
import { createClient } from 'npm:@supabase/supabase-js@2'

function constantTimeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i]! ^ bb[i]!
  return diff === 0
}

Deno.serve(async (req: Request) => {
  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const presented = req.headers.get('x-worker-secret') ?? ''
  const { data } = await svc.rpc('mail_worker_secret')
  if (typeof data !== 'string' || !data || !constantTimeEqual(presented, data)) {
    return new Response(JSON.stringify({ error: 'unauthorised' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })
  }

  const env = Deno.env.toObject()
  const secrets = Object.keys(env)
    .filter((n) => /BREVO|MAIL/i.test(n))
    .sort()
    .map((n) => {
      const v = (env[n] ?? '').trim()
      return `${JSON.stringify(n)}: len=${v.length} xkeysib=${v.startsWith('xkeysib-')} tail=…${v.slice(-4)}`
    })

  const project = (() => {
    try {
      return new URL(Deno.env.get('SUPABASE_URL') ?? '').hostname.split('.')[0] ?? 'unknown'
    } catch {
      return 'unknown'
    }
  })()

  return new Response(JSON.stringify({ project, secrets }), {
    headers: { 'content-type': 'application/json' },
  })
})
