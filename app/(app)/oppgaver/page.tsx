import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { type TaskStatus } from '@/lib/tasks/lifecycle'
import { TasksPanel, type TaskRow } from './TasksPanel'

const KIND_KEY: Record<string, string> = {
  tiltak: 'taskKindTiltak',
  risikovurdering: 'taskKindRisikovurdering',
  undersokelsesplikt: 'taskKindUndersokelsesplikt',
  leverandoroppfolging: 'taskKindLeverandoroppfolging',
  innsynskrav: 'taskKindInnsynskrav',
}

/**
 * Oppgaver — V2:2152–2214, the statutory task register.
 *
 * **What a row may say is Q72's decision and this is where it is honoured.** The
 * bundle's own fixture (V2:4168) ships a task whose source reads «Psykososial
 * kartlegging · under terskel» with `law: "aml. § 4-3 (3)"` — a task naming a
 * survey, a sub-threshold condition and a hjemmel, which discloses that a
 * specific small group scored badly. **This screen renders the survey's TITLE
 * and nothing else about it**: no group, no question, no score, no condition.
 * The schema helps rather than relying on the renderer — `tasks` has no column
 * that could hold any of them, asserted in `tests/db/tasks.test.ts`.
 */
export default async function TasksPage() {
  const viewer = await requireViewer()
  const t = await getTranslations('tasks')
  const supabase = await createClient()

  const [{ data: rows }, { data: me }] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        'id, title, kind, law_ref, source_kind, source_ref, owner_member_id, due_at, status, created_at',
      )
      .eq('org_id', viewer.orgId)
      .order('due_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('org_members')
      .select('id')
      .eq('org_id', viewer.orgId)
      .eq('user_id', viewer.userId)
      .maybeSingle(),
  ])

  const list = rows ?? []
  const ownerIds = [...new Set(list.map((r) => r.owner_member_id).filter(Boolean))] as string[]
  const surveyIds = [...new Set(list.map((r) => r.source_ref).filter(Boolean))] as string[]
  const dutyKeys = [...new Set(list.map((r) => r.law_ref).filter(Boolean))] as string[]

  const [{ data: owners }, { data: surveys }, { data: duties }] = await Promise.all([
    ownerIds.length
      ? supabase.from('org_members').select('id, name, email').in('id', ownerIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; email: string }[] }),
    surveyIds.length
      ? supabase.from('surveys').select('id, title').in('id', surveyIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    dutyKeys.length
      ? supabase.from('duty_definitions').select('key, law').in('key', dutyKeys)
      : Promise.resolve({ data: [] as { key: string; law: string }[] }),
  ])

  const ownerBy = new Map((owners ?? []).map((o) => [o.id, o.name || o.email]))
  const surveyBy = new Map((surveys ?? []).map((s) => [s.id, s.title]))
  // Q70: the citation comes from the registry, never from a string on the task.
  const lawBy = new Map((duties ?? []).map((d) => [d.key, d.law]))

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : null

  const tasks: TaskRow[] = list.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    kindLabel: t(KIND_KEY[r.kind] ?? 'taskKindTiltak'),
    law: r.law_ref ? (lawBy.get(r.law_ref) ?? null) : null,
    source:
      r.source_kind === 'survey' && r.source_ref
        ? t('taskSourceSurvey', { title: surveyBy.get(r.source_ref) ?? '—' })
        : t('taskSourceManual'),
    owner: r.owner_member_id ? (ownerBy.get(r.owner_member_id) ?? null) : null,
    dueAt: r.due_at,
    dueLabel: fmt(r.due_at),
    status: r.status as TaskStatus,
    mine: r.owner_member_id !== null && r.owner_member_id === (me?.id ?? null),
    // Whether the effect row already exists, so the button is not offered for
    // an assessment that has been recorded — the guard would allow a second,
    // and a compliance record with two assessments of one action is a record
    // nobody can read.
    assessed: false,
  }))

  const { data: assessed } = await supabase
    .from('task_effect_assessments')
    .select('task_id')
    .in('task_id', tasks.map((x) => x.id).length ? tasks.map((x) => x.id) : ['00000000-0000-0000-0000-000000000000'])
  const assessedSet = new Set((assessed ?? []).map((a) => a.task_id))
  for (const task of tasks) task.assessed = assessedSet.has(task.id)

  return <TasksPanel tasks={tasks} canEdit={viewer.role !== 'leser'} />
}
