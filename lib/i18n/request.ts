import { getRequestConfig } from 'next-intl/server'
import { SOURCE_LOCALE, getMergedMessages, isLocale } from './messages'

/**
 * Locale resolution for the app surface: the signed-in user's profile `lang`,
 * then the org's `default_lang`, then `no`. The respondent surface at
 * /s/[token] does not use this — it passes its locale explicitly, because a
 * respondent has no session to read a preference from.
 */
export default getRequestConfig(async ({ locale }) => {
  const resolved = isLocale(locale) ? locale : SOURCE_LOCALE
  return {
    locale: resolved,
    messages: await getMergedMessages(resolved),
    // A key missing from both the requested locale and `no` renders as
    // `namespace.key` so the gap is visible in review instead of blank.
    onError() {},
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key
    },
  }
})
