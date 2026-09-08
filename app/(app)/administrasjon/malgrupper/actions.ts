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

/**
 * V2-3b — recording and lifting an objection. DECISIONS **Q60** (org-wide).
 *
 * ── WHY THIS EXISTS WHEN THE BUNDLE DRAWS NO CONTROL FOR IT ─────────────────
 *
 * The bundle's Reservasjonsliste (V2:2595–2608) is a read-only list; objections
 * arrive through `unsubNote`'s «avmeldingslenke», which is not built. **A table
 * with no writer is D110's instance 2** — a feature flag with no call site is a
 * comment in a table — and a suppression list nobody can add to is worse than
 * none, because the screen states a promise the product cannot keep.
 *
 * CLAUDE.md: where the design genuinely lacks a state, choose the minimal
 * consistent option and log it. So: an add row styled exactly as «Ny målgruppe»
 * is styled two cards above, and a per-row lift. **D112.**
 *
 * Administrator-only, and this is the one place Q94's widening does NOT apply.
 * Composing an audience is routine; recording that a person objected to being
 * processed, or lifting that objection, is a privacy action.
 */
const SuppressionInput = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  reason: z.string().trim().max(200).optional(),
})

export async function addSuppression(input: unknown): Promise<AdminResult> {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return { ok: false, error: 'forbidden' }

  const parsed = SuppressionInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase.from('suppressions').insert({
    org_id: viewer.orgId,
    email: parsed.data.email,
    reason: parsed.data.reason || null,
    source: 'manuell',
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'duplicate' }
    console.error(`addSuppression failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/administrasjon/malgrupper')
  return { ok: true }
}

/**
 * Lifting is a DELETE, not an update — `suppressions` has no update policy,
 * deliberately: an objection is recorded or it is lifted, never edited. The
 * audit row is written by `app.audit_suppression_lift` rather than here, so it
 * exists however the row is removed.
 */
export async function liftSuppression(id: string): Promise<AdminResult> {
  const viewer = await requireViewer()
  if (viewer.role !== 'administrator') return { ok: false, error: 'forbidden' }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'invalid' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('suppressions')
    .delete()
    .eq('id', id)
    .eq('org_id', viewer.orgId)
  if (error) {
    console.error(`liftSuppression failed: ${error.message}`)
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/administrasjon/malgrupper')
  return { ok: true }
}
