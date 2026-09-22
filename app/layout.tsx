import type { Metadata } from 'next'
import { DM_Sans, Playfair_Display } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'

/**
 * The bundle loads exactly these two families, at exactly these weights
 * (Orgpuls_Offline_Source.html, the Google Fonts link in <head>). Playfair Display is
 * the display face and is always 600 in the design; DM Sans carries everything else.
 * The weights are pinned rather than left to the default set because the pixel gate
 * diffs glyph rendering, and a missing weight silently falls back to a synthesised one.
 */
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dmsans',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
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
