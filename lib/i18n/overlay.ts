export type Messages = Record<string, Record<string, string>>

/**
 * Lay one message set over another, namespace by namespace.
 *
 * Used for two different overlays that must behave identically: the database's
 * `ui_messages` rows over the message set compiled into the build, and a
 * requested locale over the source locale. Both are "the more specific set
 * wins per key, and a namespace present in only one of them survives".
 *
 * It lives outside `messages.ts` because that module is `server-only`, and this
 * rule is worth unit-testing without a server around it.
 */
export function overlay(base: Messages, over: Messages): Messages {
  const out: Messages = {}
  for (const ns of new Set([...Object.keys(base), ...Object.keys(over)])) {
    out[ns] = { ...(base[ns] ?? {}), ...(over[ns] ?? {}) }
  }
  return out
}
