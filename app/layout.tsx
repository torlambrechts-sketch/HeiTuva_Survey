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
      <head>
        {/* Q32's toggle is a per-viewer preference in localStorage (the design
            does the same, HeiTuva.dc.html:3117). Reading it in an effect would
            paint the narrow frame first and jump on every navigation, so the
            attribute is set before first paint. Wrapped in try/catch because a
            browser with site data blocked throws on access, and a missing
            preference must render the default rather than nothing. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('heituva.wide')==='1')document.documentElement.dataset.wide='1'}catch(e){}",
          }}
        />
      </head>
      <body className="bg-bg font-body text-ink antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
