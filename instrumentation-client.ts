import * as Sentry from '@sentry/nextjs'
import { beforeSend, dsn, enabled } from './sentry.config'

if (enabled) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend,
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
