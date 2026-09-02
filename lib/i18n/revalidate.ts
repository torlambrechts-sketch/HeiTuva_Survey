import 'server-only'

import { revalidateTag } from 'next/cache'
import { LOCALES, type Locale, i18nCacheTag } from './messages'

/** Call after any write to ui_messages so the translation editor's changes
 *  appear without a redeploy. */
export function revalidateMessages(locale?: Locale) {
  for (const l of locale ? [locale] : LOCALES) revalidateTag(i18nCacheTag(l))
}
