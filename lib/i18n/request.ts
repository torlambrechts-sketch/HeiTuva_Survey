import { getRequestConfig } from 'next-intl/server'
import { isLocale } from './locales'
import { getMergedMessages } from './messages'
import { resolveLocale, resolveOrgId } from './resolve-locale'

/**
 * There is no locale routing in this project, so next-intl's `requestLocale`
 * is always undefined. Resolving it ourselves is what makes the language
 * picker actually change the UI — without this every request silently fell
 * back to `no` no matter what the profile said.
 */
export default getRequestConfig(async ({ locale: requested }) => {
  // When next-intl asks for a specific locale — `getTranslations({ locale })`,
  // which the splash uses — honour it; otherwise resolve it ourselves.
  const locale = isLocale(requested) ? requested : await resolveLocale()
  const orgId = await resolveOrgId()
  return {
    locale,
    messages: await getMergedMessages(locale, orgId),
    // A key missing from both the requested locale and `no` renders as
    // `namespace.key` so the gap is visible in review instead of blank.
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key
    },
  }
})
