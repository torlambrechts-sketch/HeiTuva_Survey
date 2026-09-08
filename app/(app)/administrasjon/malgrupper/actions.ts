'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { SEGMENT_OPS } from '@/lib/audiences/segments'
import type { AdminResult } from '../types'

/**
 * V2-3a — creating an audience. DECISIONS **Q92** (a segment is a rule),
 * **Q65** (a structured predicate), **Q94** (a redaktør may compose one).
 *
 * The bundle derives the KIND from whether a rule was given (V2:5065,
 * `kind: rule ? "segment" : "gruppe"`), and that is kept: it is the one place
 * the design's own model and this schema agree exactly.
 */
const Clause = z.object({
  field: z.string().trim().min(1).max(60),
  op: z.enum(SEGMENT_OPS),
  value: z.union([z.string().trim().max(200), z.number(), z.array(z.string().max(200))]),
})

const AudienceInput = z.object({
  name: z.string().trim().min(1).max(120),
  /** Empty ⇒ a fixed group. One or more clauses ⇒ a segment (V2:5065). */
  predicate: z.array(Clause).max(10),
})

export type AudienceResult = AdminResult & { kind?: 'gruppe' | 'segment' }

export async function createAudience(input: unknown): Promise<AudienceResult> {
  const viewer = await requireViewer()
  // Q94: a redaktør may compose an audience — creating one is not a privacy
  // setting. The database says so too (`groups_cud_ins`, `segments_ins`); this
  // is the message, not the rule.
  if (viewer.role !== 'administrator' && viewer.role !== 'redaktor') {
    return { ok: false, error: 'forbidden' }
  }

  const parsed = AudienceInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { name, predicate } = parsed.data

  const supabase = await createClient()
  const kind = predicate.length > 0 ? 'segment' : 'gruppe'

  const { error } =
    kind === 'segment'
      ? await supabase.from('segments').insert({ org_id: viewer.orgId, name, predicate })
      : await supabase.from('groups').insert({ org_id: viewer.orgId, name, source: 'Manuell' })

  if (error) {
    // The predicate trigger raises named exceptions, and each means something
    // different to the person reading it: a field the registry does not hold is
    // a typo; one it holds as unavailable is a product gap the design shows.
    if (/segment_field_unavailable/.test(error.message)) return { ok: false, error: 'invalid' }
    if (/segment_field_not_allowed|segment_op_not_allowed/.test(error.message)) {
      return { ok: false, error: 'invalid' }
    }
    if (error.code === '23505') return { ok: false, error: 'duplicate' }
    console.error(`createAudience failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/administrasjon/malgrupper')
  return { ok: true, kind }
}
