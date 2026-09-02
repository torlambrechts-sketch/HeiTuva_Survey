import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { Bricolage_Grotesque, DM_Sans, Playfair_Display } from 'next/font/google'
import './globals.css'

// Fonts per CLAUDE.md. Bricolage is the logo face only — never body copy.
const display = Playfair_Display({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' })
const logo = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-logo', display: 'swap' })

export const metadata: Metadata = {
  title: 'HeiTuva',
  description: 'Medarbeiderundersøkelser og lovpålagt dokumentasjon',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} className={`${display.variable} ${body.variable} ${logo.variable}`}>
      <body className="bg-bg font-body text-ink antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
