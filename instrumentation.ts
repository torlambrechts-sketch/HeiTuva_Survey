import * as Sentry from '@sentry/nextjs'
import { beforeSend, dsn, enabled } from './sentry.config'

/** Next calls this once per server/edge runtime start. Inert without a DSN. */
export async function register() {
  if (!enabled) return
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend,
  })
}

export const onRequestError = Sentry.captureRequestError
