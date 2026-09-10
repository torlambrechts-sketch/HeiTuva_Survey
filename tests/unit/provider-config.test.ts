import { describe, expect, it } from 'vitest'
import { brevoProvider } from '@/lib/mail/brevo'
import { sesProvider } from '@/lib/mail/ses'
import { smtpProvider } from '@/lib/mail/smtp'
import { captureProvider } from '@/lib/sms/capture'
import { linkMobilityProvider } from '@/lib/sms/link-mobility'

/**
 * S1 — a configuration gap must never destroy a queued message.
 *
 * The defect this exists to prevent was found by running the worker, not by
 * reading it. `linkMobilityProvider` returned `{ ok: false, retryable: false }`
 * for «link mobility is not configured», and `mail-worker.ts` archives every
 * non-retryable failure — so the FIRST run of a worker whose provider was never
 * configured dead-letters the whole queue. `sesProvider` had the identical
 * shape, which is worse: prod's two queued invitations would have been
 * permanently archived by the run that was meant to deliver them.
 *
 * The rationale beside the old behaviour was right about retrying — «a queue
 * that never drains» — and wrong about the alternative. It is CLAUDE.md's
 * catch-all shape in a different construct: a per-message `retryable: false`
 * makes a DEPLOYMENT GAP indistinguishable from a BAD ADDRESS, and the worker
 * swallows it just as faithfully. The fix is neither retry-forever nor archive:
 * a provider that is not configured is a startup failure, so the worker refuses
 * to drain at all, and `send()` — if something reaches it anyway — reports the
 * gap as retryable so the message stays on the queue.
 *
 * ── WHY THIS SWEEPS THE PROVIDERS RATHER THAN LISTING TWO ──────────────────
 *
 * Scoped to SES and LINK Mobility, this test would have had the same shape as
 * the defect: an enumeration of the cases someone had already seen. Both seams
 * are registries — `mailProvider()` and `smsProvider()` choose by env — so the
 * fourth provider nobody has written yet is exactly the one that would
 * reintroduce this. PROVIDERS below is the list of every implementation the two
 * seams can return, and the assertion is the property, not the instances.
 */
const PROVIDERS = [
  // Added when Brevo superseded SES. THE SWEEP IS THE REASON THIS WAS ONE LINE:
  // the header above predicted that «the fourth provider nobody has written yet
  // is exactly the one that would reintroduce this», and the fifth arrived two
  // days later. Adding the row is the whole cost of keeping the property true.
  { name: 'brevo', make: () => brevoProvider() },
  { name: 'ses', make: () => sesProvider() },
  { name: 'smtp', make: () => smtpProvider() },
  { name: 'link-mobility', make: () => linkMobilityProvider() },
  { name: 'sms-capture', make: () => captureProvider() },
] as const

/** The environment every provider reads, cleared so each is unconfigured. */
const VARS = [
  'BREVO_API_KEY',
  'MAIL_FROM_NAME',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'MAIL_FROM',
  'SMTP_HOST',
  'LINK_MOBILITY_USER',
  'LINK_MOBILITY_PASSWORD',
  'LINK_MOBILITY_PLATFORM_ID',
  'LINK_MOBILITY_PARTNER_ID',
  'SMS_CAPTURE_FILE',
]

function withoutConfig<T>(fn: () => T): T {
  const saved = new Map(VARS.map((v) => [v, process.env[v]]))
  for (const v of VARS) delete process.env[v]
  // The smtp provider is loopback-only and defaults to loopback, so removing
  // SMTP_HOST leaves it CONFIGURED. Point it somewhere real to make its own
  // gap — the guard it already has — the thing under test.
  process.env.SMTP_HOST = 'smtp.example.com'
  try {
    return fn()
  } finally {
    for (const [v, val] of saved) {
      if (val === undefined) delete process.env[v]
      else process.env[v] = val
    }
  }
}

describe('a provider that is not configured', () => {
  for (const p of PROVIDERS) {
    it(`${p.name} reports the gap through configured()`, () => {
      const reason = withoutConfig(() => p.make().configured())
      expect(reason, `${p.name} must say what is missing`).toBeTruthy()
      expect(typeof reason).toBe('string')
    })

    it(`${p.name} does not destroy the message if send() is reached anyway`, async () => {
      type AnyResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean }
      const result: AnyResult = await withoutConfig(async () => {
        const send = p.make().send as (m: unknown) => Promise<AnyResult>
        return send({
          to:
            p.name === 'link-mobility' || p.name === 'sms-capture'
              ? '+4740000000'
              : { email: 'nobody@example.test' },
          subject: 'x',
          text: 'x',
          idempotencyKey: 'k',
        })
      })
      expect(result.ok, `${p.name} cannot succeed while unconfigured`).toBe(false)
      // The whole point: NOT `retryable: false`, which the worker archives.
      if (result.ok) return
      expect(
        result.retryable,
        `${p.name} reported a configuration gap as permanent — the worker ` +
          `archives that, and the queued invitation is gone`,
      ).toBe(true)
    })
  }
})

describe('a provider that is configured', () => {
  it('smtp against loopback reports no gap', () => {
    const saved = process.env.SMTP_HOST
    delete process.env.SMTP_HOST
    try {
      expect(smtpProvider().configured()).toBeNull()
    } finally {
      if (saved !== undefined) process.env.SMTP_HOST = saved
    }
  })

  it('brevo with both variables reports no gap', () => {
    const saved = VARS.map((v) => [v, process.env[v]] as const)
    process.env.BREVO_API_KEY = 'xkeysib-example'
    process.env.MAIL_FROM = 'undersokelse@heituva.com'
    try {
      expect(brevoProvider().configured()).toBeNull()
    } finally {
      for (const [v, val] of saved) {
        if (val === undefined) delete process.env[v]
        else process.env[v] = val
      }
    }
  })

  it('ses with all three variables reports no gap', () => {
    const saved = VARS.map((v) => [v, process.env[v]] as const)
    process.env.AWS_ACCESS_KEY_ID = 'AKIAEXAMPLE'
    process.env.AWS_SECRET_ACCESS_KEY = 'secret'
    process.env.MAIL_FROM = 'HeiTuva <ingen-svar@heituva.com>'
    try {
      expect(sesProvider().configured()).toBeNull()
    } finally {
      for (const [v, val] of saved) {
        if (val === undefined) delete process.env[v]
        else process.env[v] = val
      }
    }
  })

  it('names every missing variable, not only the first', () => {
    const reason = withoutConfig(() => sesProvider().configured()) ?? ''
    expect(reason).toContain('AWS_ACCESS_KEY_ID')
    expect(reason).toContain('AWS_SECRET_ACCESS_KEY')
    expect(reason).toContain('MAIL_FROM')
  })
})
