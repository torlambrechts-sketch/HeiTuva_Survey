'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireViewer } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { MODULES_COOKIE, WORKSPACE_COOKIE } from './current'

/**
 * W1 · Q122 — the per-device choice. A cookie, not a column and not
 * localStorage (D161).
 *
 * MEMBERSHIP IS CHECKED AGAINST THE REGISTRY, NOT AGAINST A LIST HERE. The
 * shape passes Zod; whether the key EXISTS is a question only the table can
 * answer, and writing the four keys into this file would be the enumeration
 * this project has recorded eleven times. An unknown key is refused rather
 * than stored, so a bad cookie cannot be created by this path — and
 * `readWorkspace` resolves against the registry anyway, for the ones that
 * could arrive another way.
 */
const Input = z.string().trim().min(1).max(40).regex(/^[a-z][a-z0-9_]*$/)

export async function setWorkspace(key: unknown): Promise<{ ok: boolean }> {
  const viewer = await requireViewer()
  if (!viewer) return { ok: false }

  const parsed = Input.safeParse(key)
  if (!parsed.success) return { ok: false }

  const supabase = await createClient()
  const { data } = await supabase
    .from('workspaces')
    .select('key')
    .eq('key', parsed.data)
    .maybeSingle()
  if (!data) return { ok: false }

  const store = await cookies()
  store.set(WORKSPACE_COOKIE, parsed.data, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // A year. The choice is a convenience, not a session fact, and the copy
    // says «huskes på denne enheten» — a cookie that expired with the session
    // would make that sentence false.
    maxAge: 60 * 60 * 24 * 365,
  })

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * W2 · V4:6078 — the Tilpasset workspace's module set, and V4:6080's reset.
 *
 * MEMBERSHIP AGAINST THE REGISTRY, same as `setWorkspace`: the shape passes
 * Zod, and whether each key EXISTS is a question only `workspace_modules` can
 * answer. An unknown key is dropped rather than refusing the whole write —
 * the user's other choices are not forfeit because one key was retired.
 *
 * `null` clears the cookie, which is «follow the workspace's own set» and is
 * what «Sett tilbake standard» does. Writing `[]` is a different thing: it is
 * «I chose nothing», and it is what renders the empty state. The two must not
 * collapse into one another, which is why this takes `string[] | null` rather
 * than an array it could treat as empty-or-absent.
 */
const ModuleList = z.array(z.string().trim().min(1).max(40).regex(/^[a-z][a-z0-9_]*$/)).max(32)

export async function setCustomModules(keys: unknown): Promise<{ ok: boolean }> {
  const viewer = await requireViewer()
  if (!viewer) return { ok: false }

  const store = await cookies()

  if (keys === null) {
    store.delete(MODULES_COOKIE)
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  const parsed = ModuleList.safeParse(keys)
  if (!parsed.success) return { ok: false }

  const supabase = await createClient()
  const { data } = await supabase.from('workspace_modules').select('key')
  const known = new Set((data ?? []).map((m) => m.key))
  const kept = parsed.data.filter((k) => known.has(k))

  store.set(MODULES_COOKIE, JSON.stringify(kept), {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}
