import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import {
  countSegmentMembers,
  renderRule,
  type FieldRow,
  type SegmentClause,
} from '@/lib/audiences/segments'
import { memberStatus } from '@/lib/audiences/member-status'
import { AudiencePanel, type Audience, type Field } from './AudiencePanel'
import { MembersPanel, type MemberRow, type SuppressionRow } from './MembersPanel'

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

  // ── V2-3b · Q61: the four statuses, DERIVED ────────────────────────────────
  //
  // Three reads, no fifth column. `suppressions` is org-wide (Q60) so it is a
  // set of addresses; `bounced_at` is read from the member's MOST RECENT
  // invitation, because an address that bounced in March and delivered in June
  // is not bouncing.
  const [{ data: memberRows }, { data: suppressed }] = await Promise.all([
    supabase
      .from('org_members')
      .select('id, name, email, status, created_at')
      .eq('org_id', viewer.orgId)
      .order('name'),
    supabase
      .from('suppressions')
      .select('id, email, reason')
      .eq('org_id', viewer.orgId)
      .order('created_at', { ascending: false }),
  ])

  const suppressedSet = new Set((suppressed ?? []).map((s) => s.email.toLowerCase()))

  // The latest bounce per address. `member_id` (Q64, `M:0059`) is the right key
  // and is only written for group sends, so this matches on the address — which
  // is what «this address does not answer» is about anyway.
  const { data: bounces } = await supabase
    .from('survey_invitations')
    .select('email, bounced_at')
    .not('bounced_at', 'is', null)
    .in('email', (memberRows ?? []).map((m) => m.email))
    .order('bounced_at', { ascending: false })
  const bouncedAt = new Map<string, string>()
  for (const b of bounces ?? []) {
    const key = (b.email ?? '').toLowerCase()
    if (key && !bouncedAt.has(key)) bouncedAt.set(key, b.bounced_at!)
  }

  const members: MemberRow[] = (memberRows ?? [])
    .map((m) => {
      const key = m.email.toLowerCase()
      const bounced = bouncedAt.get(key) ?? null
      const status = memberStatus({
        accountStatus: m.status ?? 'active',
        suppressed: suppressedSet.has(key),
        bouncedAt: bounced,
      })
      // Q61's «inactive → (hidden)». `null` rather than a fifth word, so a
      // forgotten filter renders nothing instead of inventing one.
      if (!status) return null
      return {
        id: m.id,
        name: m.name || m.email,
        email: m.email,
        status,
        // The bundle's `mb.meta` («Entra ID · i dag») is a sync provenance this
        // product does not hold. What it DOES hold is why the status is what it
        // is, which is the more useful sentence anyway.
        meta:
          status === 'reservert'
            ? t('mgMemberObjected')
            : status === 'bounce'
              ? t('mgMemberBounced', { when: when(bounced) })
              : t('mgMemberSince', { when: when(m.created_at) }),
      } satisfies MemberRow
    })
    .filter((m): m is MemberRow => m !== null)

  return (
    <div className="mt-5 flex flex-col gap-[18px]">
      <AudiencePanel
        groups={groupRows}
        segments={segmentRows}
        fields={fieldRows.map((f): Field => ({ key: f.key, available: f.available }))}
        orgThreshold={org?.default_k_threshold ?? 5}
        canCreate={viewer.role === 'administrator' || viewer.role === 'redaktor'}
      />
      <MembersPanel
        members={members}
        suppressions={(suppressed ?? []) as SuppressionRow[]}
        isAdministrator={viewer.role === 'administrator'}
      />
    </div>
  )
}
