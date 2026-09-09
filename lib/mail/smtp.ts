import { createConnection } from 'node:net'
import type { MailMessage, MailProvider, MailResult } from './types'

/**
 * Plain SMTP, for the local stack's Mailpit (127.0.0.1:54325) and nothing else.
 *
 * No auth and no TLS, because it only ever talks to a container on loopback —
 * which is also why it refuses to run against anything that is not loopback
 * rather than trusting configuration to be right. Sending real invitations
 * unencrypted is the failure this guard exists to make impossible.
 */
function isLoopback(host: string) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost'
}

export function smtpProvider(): MailProvider {
  const host = process.env.SMTP_HOST ?? '127.0.0.1'
  const port = Number(process.env.SMTP_PORT ?? 54325)
  const from = process.env.MAIL_FROM ?? 'HeiTuva <ingen-svar@heituva.test>'

  // A plain function, not a method: see `ses.ts`.
  function gap(): string | null {
    return isLoopback(host)
      ? null
      : `the smtp provider is loopback-only and SMTP_HOST is «${host}»; configure ses for real mail`
  }

  return {
    name: 'smtp',
    configured: gap,
    async send(message: MailMessage): Promise<MailResult> {
      const reason = gap()
      if (reason) {
        // Retryable for the reason ses.ts gives: pointing smtp at a real host is
        // a deployment mistake, and a deployment mistake must not consume the
        // message it was made on.
        return { ok: false, error: reason, retryable: true }
      }

      return new Promise<MailResult>((resolve) => {
        const socket = createConnection({ host, port })
        const script = [
          `EHLO heituva`,
          `MAIL FROM:<${from.replace(/.*<|>.*/g, '') || from}>`,
          `RCPT TO:<${message.to.email}>`,
          `DATA`,
        ]
        let step = -1
        let settled = false
        const done = (r: MailResult) => {
          if (settled) return
          settled = true
          socket.end()
          resolve(r)
        }

        socket.setTimeout(10_000, () =>
          done({ ok: false, error: 'smtp timeout', retryable: true }),
        )
        socket.on('error', (e) => done({ ok: false, error: `smtp: ${e.name}`, retryable: true }))

        socket.on('data', (chunk) => {
          const reply = chunk.toString()
          if (/^[45]/.test(reply) && step >= 0) {
            done({ ok: false, error: `smtp rejected: ${reply.slice(0, 40)}`, retryable: true })
            return
          }
          step++
          if (step < script.length) {
            socket.write(`${script[step]}\r\n`)
          } else if (step === script.length) {
            const body = [
              `From: ${from}`,
              `To: ${message.to.email}`,
              `Subject: ${message.subject}`,
              `Message-ID: <${message.idempotencyKey}@heituva.test>`,
              `Content-Type: text/plain; charset=utf-8`,
              '',
              message.text,
              '.',
            ].join('\r\n')
            socket.write(`${body}\r\n`)
          } else {
            done({ ok: true, id: message.idempotencyKey })
          }
        })
      })
    },
  }
}
