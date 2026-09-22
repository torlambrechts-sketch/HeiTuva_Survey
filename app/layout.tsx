import type { Metadata } from 'next'
import { DM_Sans, Playfair_Display } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'

/**
 * The bundle loads exactly these two families (Orgpuls_Offline_Source.html, the Google
 * Fonts link in <head>). Playfair Display is the display face and is always 600 in the
 * design; DM Sans carries everything else.
 *
 * `weight` is deliberately NOT specified, matching the bundle: both families are
 * variable fonts and its stylesheet serves one woff2 per unicode range covering the
 * whole axis, so naming weights here would only narrow what the design ships.
 *
 * Note on what this did NOT fix, recorded so it is not re-attempted: the header carries
 * a residual 257-pixel difference from the baseline, concentrated in the glyph edges of
 * three labels. Dropping the explicit weights was tried as the cause and measured
 * afterwards — the differing-pixel count was identical to four decimal places and the
 * glyph column runs were unchanged. The residual is rasterisation of a self-hosted
 * subset against the bundle's own file, not a weight or a layout error: control edges,
 * header height and text spans all match exactly.
 */
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dmsans',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Orgpuls',
  description: 'Psykososialt arbeidsmiljø for norske virksomheter.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} className={`${dmSans.variable} ${playfair.variable}`}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
