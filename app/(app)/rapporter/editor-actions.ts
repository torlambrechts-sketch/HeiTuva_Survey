'use server'

import { randomBytes, createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { requireViewer } from '@/lib/auth/session'
import { audit } from '@/lib/auth/audit'

export type EditorResult =
  | { ok: true }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' }

const Uuid = z.string().uuid()

/** The app.share_scope enum, not the design's three button labels. The labels
 *  are copy; these are the values the column accepts. */
const ShareScope = z.enum(['ledelse', 'ledere_eget_team', 'alle_ansatte'])

/** Mirrors app.hash_token. Only the hash is ever stored. */
const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex')

/**
 * The editor writes straight to the report row rather than to a client-side
 * draft.
 *
 * The design says the document updates "med en gang" when a section is toggled,
 * and the document is composed by `compose_report` on the server — so a section
 * list held only in the browser could not be rendered at all without shipping
 * the composition logic to the client, which is exactly what the k-gate must
 * never depend on. Persisting first and re-composing is also what makes the
 * "Lagre rapport" button honest: it changes `status`, not the content, because
 * the content was never unsaved.
 */
async function editableReport(reportId: string) {
  const viewer = await requireViewer()
  if (viewer.role === 'leser') return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('reports')
    .select('id, org_id, title, sections, filters, share_scope, schedule, base_template, status')
    .eq('id', reportId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!data || data.org_id !== viewer.orgId) return null
  return { viewer, supabase, report: data }
}

const CreateInput = z.object({
  title: z.string().trim().min(1).max(200),
  baseTemplate: z.string().trim().max(64).nullable(),
  sections: z.array(z.string().trim().min(1).max(64)).max(20),
  /** "Lag rapport" from a survey row starts the report already pointed at it. */
  surveys: z.array(Uuid).max(50).optional(),
})

export async function createReport(input: z.input<typeof CreateInput>): Promise<EditorResult> {
  const parsed = CreateInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const viewer = await requireViewer()
  if (viewer.role === 'leser') return { ok: false, error: 'forbidden' }

  const supabase = await createClient()

  // Every section key must exist in the registry. `reports.sections` is jsonb,
  // so nothing in the schema stops an unknown key being written, and the
  // renderer would then have a section it has never heard of.
  const { data: known } = await supabase.from('report_section_types').select('key')
  const valid = new Set((known ?? []).map((r) => r.key))
  const sections = parsed.data.sections.filter((s) => valid.has(s))

  // Same rule as saveReport: a survey id only reaches the filter if it belongs
  // to this org. compose_report checks it again, because the filter is jsonb
  // the row's owner can rewrite afterwards.
  let ownSurveys: string[] = []
  if (parsed.data.surveys?.length) {
    const { data: mine } = await supabase
      .from('surveys')
      .select('id')
      .eq('org_id', viewer.orgId)
      .in('id', parsed.data.surveys)
    ownSurveys = (mine ?? []).map((s) => s.id)
  }

  const { data: member } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', viewer.orgId)
    .eq('user_id', viewer.userId)
    .maybeSingle()

  const { data, error } = await supabase
    .from('reports')
    .insert({
      org_id: viewer.orgId,
      title: parsed.data.title,
      kind: 'egen',
      status: 'utkast',
      base_template: parsed.data.baseTemplate,
      sections,
      filters: { surveys: ownSurveys, rounds: [], group: null },
      created_by: member?.id ?? null,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: 'failed' }

  await audit(viewer.orgId, 'report.create', data.id, { sections: sections.length })
  revalidatePath('/rapporter')
  redirect(`/rapporter?rapport=${data.id}`)
}

const SaveInput = z.object({
  reportId: Uuid,
  title: z.string().trim().min(1).max(200).optional(),
  sections: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  group: Uuid.nullable().optional(),
  surveys: z.array(Uuid).max(50).optional(),
  rounds: z.array(Uuid).max(50).optional(),
  sectionGroups: z.record(z.string(), Uuid.nullable()).optional(),
})

export async function saveReport(input: z.input<typeof SaveInput>): Promise<EditorResult> {
  const parsed = SaveInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const ctx = await editableReport(parsed.data.reportId)
  if (!ctx) return { ok: false, error: 'forbidden' }
  const { supabase, report, viewer } = ctx

  const patch: { title?: string; sections?: Json; filters?: Json } = {}
  if (parsed.data.title !== undefined) patch.title = parsed.data.title

  if (parsed.data.sections !== undefined) {
    const { data: known } = await supabase.from('report_section_types').select('key')
    const valid = new Set((known ?? []).map((r) => r.key))
    patch.sections = parsed.data.sections.filter((s) => valid.has(s))
  }

  const filters = (report.filters ?? {}) as Record<string, Json>
  const next: Record<string, Json> = { ...filters }

  if (parsed.data.group !== undefined) next.group = parsed.data.group
  if (parsed.data.sectionGroups !== undefined) next.sectionGroups = parsed.data.sectionGroups as Json

  // A survey or group id in the filter is checked here AND again inside
  // compose_report. Here it is a courtesy — a wrong id becomes an empty report
  // rather than a refused one. There it is the control, because the filter is
  // jsonb the row's owner can write directly.
  if (parsed.data.surveys !== undefined) {
    const { data: mine } = await supabase
      .from('surveys')
      .select('id')
      .eq('org_id', viewer.orgId)
      .in('id', parsed.data.surveys.length ? parsed.data.surveys : ['00000000-0000-0000-0000-000000000000'])
    next.surveys = (mine ?? []).map((s) => s.id)
  }
  if (parsed.data.rounds !== undefined) next.rounds = parsed.data.rounds

  if (parsed.data.group !== undefined) {
    if (parsed.data.group === null) {
      next.group = null
    } else {
      const { data: g } = await supabase
        .from('groups')
        .select('id')
        .eq('org_id', viewer.orgId)
        .eq('id', parsed.data.group)
        .maybeSingle()
      next.group = g?.id ?? null
    }
  }

  patch.filters = next

  const { error } = await supabase.from('reports').update(patch).eq('id', report.id)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/rapporter')
  return { ok: true }
}

const ScopeInput = z.object({
  reportId: Uuid,
  scope: ShareScope,
})

export async function setShareScope(input: z.input<typeof ScopeInput>): Promise<EditorResult> {
  const parsed = ScopeInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const ctx = await editableReport(parsed.data.reportId)
  if (!ctx) return { ok: false, error: 'forbidden' }

  const { error } = await ctx.supabase
    .from('reports')
    .update({ share_scope: parsed.data.scope })
    .eq('id', parsed.data.reportId)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/rapporter')
  return { ok: true }
}

const ScheduleInput = z.object({
  reportId: Uuid,
  cadence: z.enum(['none', 'weekly', 'monthly', 'round']),
})

export async function setReportSchedule(input: z.input<typeof ScheduleInput>): Promise<EditorResult> {
  const parsed = ScheduleInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const ctx = await editableReport(parsed.data.reportId)
  if (!ctx) return { ok: false, error: 'forbidden' }

  const { error } = await ctx.supabase
    .from('reports')
    .update({
      schedule: parsed.data.cadence === 'none' ? null : { cadence: parsed.data.cadence },
    })
    .eq('id', parsed.data.reportId)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/rapporter')
  return { ok: true }
}

export type ShareResult =
  | { ok: true; url: string }
  | { ok: false; error: 'forbidden' | 'invalid' | 'failed' }

/**
 * DECISIONS: a public report is an unguessable link, not a password.
 *
 * The raw token is returned exactly once, here, and only the SHA-256 hash is
 * stored — the same rule as invitation tokens. `report_shares.group_id` carries
 * the scope, and `compose_report` re-runs the whole k-gate under it: the link
 * does not hand out a rendered document, it hands out the right to ask for one.
 */
export async function createReportShare(
  input: { reportId: string; scope: z.infer<typeof ShareScope>; groupId?: string | null },
): Promise<ShareResult> {
  const parsed = z
    .object({ reportId: Uuid, scope: ShareScope, groupId: Uuid.nullable().optional() })
    .safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const ctx = await editableReport(parsed.data.reportId)
  if (!ctx) return { ok: false, error: 'forbidden' }

  // 32 bytes of CSPRNG, base64url. The link IS the credential, so its entropy
  // is the whole control — a slug derived from the title (as the prototype
  // shows) would be guessable from the report list.
  const raw = randomBytes(32).toString('base64url')

  const { error } = await ctx.supabase.from('report_shares').insert({
    report_id: parsed.data.reportId,
    token_hash: hashToken(raw),
    scope: parsed.data.scope,
    group_id: parsed.data.groupId ?? null,
  })
  if (error) return { ok: false, error: 'failed' }

  await audit(ctx.viewer.orgId, 'report.share', parsed.data.reportId, { scope: parsed.data.scope })
  revalidatePath('/rapporter')
  return { ok: true, url: `/r/${raw}` }
}

const StatusInput = z.object({
  reportId: Uuid,
  status: z.enum(['utkast', 'klar']),
})

/**
 * The design's "Lagre rapport" button.
 *
 * Content is already saved — every toggle writes through, because the document
 * is composed server-side and cannot render from an unsaved draft. So the
 * button does the thing the word "lagret" means on the Mine rapporter list:
 * it moves the report out of Utkast. Logged as a deviation (D61): the control
 * is the design's, its meaning is the one the persistence model leaves for it.
 */
export async function setReportStatus(input: z.input<typeof StatusInput>): Promise<EditorResult> {
  const parsed = StatusInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const ctx = await editableReport(parsed.data.reportId)
  if (!ctx) return { ok: false, error: 'forbidden' }

  // A published report is not walked back to a draft from here: publication is
  // publish_duty's decision and carries a signature.
  if (ctx.report.status === 'publisert') return { ok: false, error: 'forbidden' }

  const { error } = await ctx.supabase
    .from('reports')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.reportId)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/rapporter')
  return { ok: true }
}

export async function deleteReport(reportId: string): Promise<EditorResult> {
  const parsed = Uuid.safeParse(reportId)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const ctx = await editableReport(parsed.data)
  if (!ctx) return { ok: false, error: 'forbidden' }

  // Soft delete: `duty_versions.report_id` points here, and a statutory
  // archive that loses the document it archived is worse than a stale row.
  const { error } = await ctx.supabase
    .from('reports')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', parsed.data)
  if (error) return { ok: false, error: 'failed' }

  await audit(ctx.viewer.orgId, 'report.delete', parsed.data)
  revalidatePath('/rapporter')
  return { ok: true }
}
