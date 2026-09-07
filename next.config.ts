import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

/**
 * Security headers (Phase 6 hardening).
 *
 * The CSP is as tight as this app's own habits allow and no tighter than it
 * can honestly be: the design is expressed in inline styles, so `style-src`
 * carries 'unsafe-inline'; Next hydrates with inline scripts, so `script-src`
 * does too. What the policy does refuse is everything else — no third-party
 * script hosts except Cloudflare's Turnstile, no frames but Turnstile's, no
 * connections but Supabase, Cloudflare and Sentry's EU ingest, and no fonts or
 * images from anywhere but ourselves (next/font self-hosts). `object-src 'none'`
 * and `frame-ancestors 'none'` close the two classic embedding holes.
 */
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${
    process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
  }`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabase.replace(/^http/, 'ws')} https://challenges.cloudflare.com https://*.ingest.de.sentry.io`,
  'frame-src https://challenges.cloudflare.com',
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // No `upgrade-insecure-requests`. Vercel is HTTPS-only and HSTS is set
  // below, so the directive buys nothing there — and it costs the local stack
  // its stylesheet: WebKit honours it on http://127.0.0.1 (Chromium exempts
  // loopback), upgrades the CSS request to an https port nobody listens on,
  // and every mobile pixel test rendered an unstyled page.
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

/**
 * The two token-addressed routes must never be indexed.
 *
 * `/s/<token>` is a respondent's personal invitation and `/r/<token>` a report
 * share link. Both are unguessable rather than authenticated, and both were
 * relying on obscurity alone: there is no robots.txt in this project, no
 * `robots` field in the root metadata, and `dynamic = 'force-dynamic'` on the
 * respondent page is cache control, not crawler control.
 *
 * A GET on either mutates nothing — `get_survey_for_token` is STABLE, and
 * `responded_at` and token rotation are only ever touched by the VOLATILE
 * `submit_response` and `enqueue_reminders` — so this is not about protecting a
 * token from being spent. It is that the page discloses a survey title, an
 * organisation name and whether that individual has already answered, to
 * anything that fetches the URL. Chat clients unfurl pasted links by default,
 * which is exactly how such a URL reaches a crawler.
 *
 * `X-Robots-Tag` rather than a robots.txt: robots.txt is advisory, applies only
 * to crawlers that read it, and publishing `Disallow: /s/` would announce the
 * path shape to anyone who asks for it. A header travels with the response.
 */
const noIndexHeader = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' }]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/s/:path*', headers: noIndexHeader },
      { source: '/r/:path*', headers: noIndexHeader },
    ]
  },
}

export default withNextIntl(nextConfig)
