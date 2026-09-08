import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import {
  countSegmentMembers,
  renderRule,
  type FieldRow,
  type SegmentClause,
} from '@/lib/audiences/segments'
import { AudiencePanel, type Audience, type Field } from './AudiencePanel'

const FIELD_KEY: Record<string, string> = {
  role: 'mgFieldRole',
  status: 'mgFieldStatus',
  group: 'mgFieldGroup',
  member_since: 'mgFieldMemberSince',
  stillingsprosent: 'mgFieldStillingsprosent',
  startdato: 'mgFieldStartdato',
  land: 'mgFieldLand',
}
const OP_KEY: Record<string, string> = {
  eq: 'mgOpEq',
  ne: 'mgOpNe',
  in: 'mgOpIn',
  lt: 'mgOpLt',
  gt: 'mgOpGt',
}

/**
 * Målgrupper — V2:2405–2658, the cards V2-3a builds.
 *
 * Counts are computed here rather than stored: a segment is a RULE (Q92), so
 * its size is what the rule matches now. A rule that cannot be evaluated yields
 * NULL and the panel says «kan ikke beregnes» — never 0, which would be
 * indistinguishable from a segment nobody matches (CLAUDE.md, never fabricate).
 */
export default async function AudiencesTab() {
  const viewer = await requireViewer()
  const t = await getTranslations('admin')
  const supabase = await createClient()

  const [{ data: groups }, { data: segments }, { data: fields }, { data: org }] = await Promise.all(
    [
      supabase
        .from('groups')
        .select('id, name, source, created_at')
        .eq('org_id', viewer.orgId)
        .order('name'),
      supabase
        .from('segments')
        .select('id, name, predicate, source, created_at')
        .eq('org_id', viewer.orgId)
        .order('name'),
      supabase.from('segment_fields').select('key, source_column, available').order('sort_order'),
      supabase
        .from('organizations')
        .select('default_k_threshold')
        .eq('id', viewer.orgId)
        .single(),
    ],
  )

  const fieldRows = (fields ?? []) as FieldRow[]
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : '—'

  // A group's size is a real count of members carrying its id. Q28 permits a
  // count of PEOPLE — it is svarutledete tall that the threshold hides.
  const groupRows: Audience[] = await Promise.all(
    (groups ?? []).map(async (g) => {
      const { count } = await supabase
        .from('org_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', viewer.orgId)
        .eq('group_id', g.id)
        .eq('status', 'active')
      return {
        id: g.id,
        name: g.name,
        count: count ?? 0,
        source: g.source,
        updated: when(g.created_at),
        rule: null,
      }
    }),
  )

  const segmentRows: Audience[] = await Promise.all(
    (segments ?? []).map(async (s) => {
      const predicate = (s.predicate ?? []) as SegmentClause[]
      return {
        id: s.id,
        name: s.name,
        count: await countSegmentMembers(supabase, viewer.orgId, predicate, fieldRows),
        source: s.source,
        updated: when(s.created_at),
        // Q65: generated from the predicate, so it translates and cannot drift
        // from what is stored.
        rule: renderRule(
          predicate,
          (kind, key) => t(kind === 'field' ? (FIELD_KEY[key] ?? key) : (OP_KEY[key] ?? key)),
          t('mgAnd'),
        ),
      }
    }),
  )

  return (
    <AudiencePanel
      groups={groupRows}
      segments={segmentRows}
      fields={fieldRows.map((f): Field => ({ key: f.key, available: f.available }))}
      orgThreshold={org?.default_k_threshold ?? 5}
      canCreate={viewer.role === 'administrator' || viewer.role === 'redaktor'}
    />
  )
}
