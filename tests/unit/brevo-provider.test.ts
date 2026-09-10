import { afterEach, describe, expect, it, vi } from 'vitest'
import { brevoProvider } from '@/lib/mail/brevo'
import { invitationMessage } from '@/lib/mail'

/**
 * Brevo, the provider that actually sends — and the two promises made about it.
 *
 * 1. WHICH FAILURES ARE PERMANENT. `retryable: false` means the worker archives
 *    the invitation, so the classification is not «will a retry help» but «is
 *    this message the problem». A wrong API key is not.
 * 2. NO Reply-To, and a body that still gives the respondent somewhere to go.
 */
const KEY = 'BREVO_API_KEY'
const FROM = 'MAIL_FROM'

function configured<T>(fn: () => T): T {
  const saved: Array<readonly [string, string | undefined]> = [
    [KEY, process.env[KEY]],
    [FROM, process.env[FROM]],
  ]
  process.env[KEY] = 'xkeysib-test'
  process.env[FROM] = 'undersokelse@heituva.com'
  try {
    return fn()
  } finally {
    for (const [v, val] of saved) {
      if (val === undefined) delete process.env[v]
      else process.env[v] = val
    }
  }
}

/** Replaces fetch with one that answers `status`, and records the request. */
function stubFetch(status: number, body: unknown = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response
  })
  return calls
}

const MESSAGE = {
  to: { email: 'someone@example.test', name: 'Kari' },
  subject: 'x',
  text: 'y',
  idempotencyKey: 'round:someone@example.test',
}

afterEach(() => vi.unstubAllGlobals())

describe('what Brevo counts as the message’s fault', () => {
  /*
    THE ENUMERATION BELOW IS OF HTTP STATUSES THE API CAN RETURN, and it says so
    rather than pretending to be exhaustive over failures in general: a network
    throw is covered separately, and anything unlisted falls to the default arm,
    which is «permanent». That default is the risky direction, so the listed
    cases are the ones where being wrong would destroy a real invitation.
  */
  const RETRYABLE = [
    [401, 'a rejected API key is a DEPLOYMENT GAP wearing a per-message status'],
    [403, 'a revoked or unauthorised key is the same fault as 401'],
    [429, 'rate limiting is the ordinary backoff case'],
    [500, 'the provider is broken, not the address'],
    [503, 'the provider is unavailable, not the address'],
  ] as const

  for (const [status, why] of RETRYABLE) {
    it(`${status} leaves the message on the queue — ${why}`, async () => {
      stubFetch(status)
      const result = await configured(() => brevoProvider().send(MESSAGE))
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(
        result.retryable,
        `brevo ${status} was classified permanent; the worker archives that, and ` +
          `a rotated key would silently dead-letter every queued invitation — the ` +
          `exact failure configured() exists to prevent, in the one form it cannot see`,
      ).toBe(true)
    })
  }

  it('400 is permanent, because an unusable address is about this message', async () => {
    stubFetch(400)
    const result = await configured(() => brevoProvider().send(MESSAGE))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.retryable).toBe(false)
  })

  it('a network throw is retryable and does not leak the request', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed to https://api.brevo.com/... token=abc123')
    })
    const result = await configured(() => brevoProvider().send(MESSAGE))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.retryable).toBe(true)
    // The request body carries a respondent's invitation token, so the thrown
    // value must not be interpolated into the error.
    expect(result.error).not.toContain('token=')
    expect(result.error).toBe('brevo request failed (TypeError)')
  })

  it('201 returns the provider’s message id', async () => {
    stubFetch(201, { messageId: '<abc@brevo>' })
    const result = await configured(() => brevoProvider().send(MESSAGE))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.id).toBe('<abc@brevo>')
  })
})

describe('the request sets no Reply-To', () => {
  it('because HeiTuva does not operate an inbox on the customer’s behalf', async () => {
    const calls = stubFetch(201, { messageId: 'x' })
    await configured(() => brevoProvider().send(MESSAGE))
    expect(calls).toHaveLength(1)
    const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>
    expect(
      Object.keys(body).some((k) => k.toLowerCase() === 'replyto'),
      'a Reply-To is a promise that somebody reads the answer',
    ).toBe(false)
    expect(body.sender).toEqual({ email: 'undersokelse@heituva.com', name: 'HeiTuva' })
  })
})

describe('the invitation gives the respondent somewhere to go', () => {
  const CASES = [
    { lang: 'no', anonymous: true },
    { lang: 'no', anonymous: false },
    { lang: 'en', anonymous: true },
    { lang: 'en', anonymous: false },
  ] as const

  const build = (c: (typeof CASES)[number]) =>
    invitationMessage({
      orgName: 'Nordisk Studio',
      surveyTitle: 'Arbeidsmiljø',
      name: 'Kari',
      lang: c.lang,
      url: 'https://www.heituva.com/s/abc',
      anonymous: c.anonymous,
    }).text

  /*
    An enumeration OF the phrasings that close the door — English and Norwegian,
    hyphenated and not. It cannot be exhaustive over all wordings, so the
    positive assertion below carries the real weight: the body must ROUTE
    somewhere, and a body that routes has no reason to also refuse.
  */
  const DEAD_ENDS = [
    'do not reply',
    'do-not-reply',
    'donotreply',
    'ikke svar på denne',
    'ikke-svar',
    'noreply',
    'no-reply',
  ]

  for (const c of CASES) {
    it(`${c.lang}/${c.anonymous ? 'anonymous' : 'named'} never tells them not to reply`, () => {
      const text = build(c).toLowerCase()
      for (const phrase of DEAD_ENDS) {
        expect(
          text.includes(phrase),
          `«${phrase}» is a dead end, and on an anonymous survey it lands on ` +
            `someone who has just been promised anonymity and wants to check`,
        ).toBe(false)
      }
    })

    it(`${c.lang}/${c.anonymous ? 'anonymous' : 'named'} points at the survey page instead`, () => {
      const text = build(c)
      expect(text).toContain('https://www.heituva.com/s/abc')
      expect(
        c.lang === 'no'
          ? /siden der du svarer/.test(text)
          : /page where you answer/.test(text),
        'the route for a question is the product, not a mailbox',
      ).toBe(true)
    })
  }
})
