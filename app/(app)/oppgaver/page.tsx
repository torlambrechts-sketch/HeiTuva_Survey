import { getTranslations } from 'next-intl/server'
import { readWorkspace } from '@/lib/workspace/current'
import { DEFAULT_VOCABULARY } from '@/lib/workspace/modules'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { type TaskStatus } from '@/lib/tasks/lifecycle'
import { TasksPanel, type FeedbackRow, type TaskRow } from './TasksPanel'

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
  /* W3 · Q122 — the workspace's vocabulary, resolved HERE because the
     choice is a cookie and only a server render can read it. The fallback
     is Tilpasset's own set, which is also the copy this screen shipped
     before W3 — an unseeded registry renders yesterday's sentence rather
     than a key or an invented word. */
  const vocab = (await readWorkspace(viewer.orgId))?.vocabulary ?? DEFAULT_VOCABULARY
  const t = await getTranslations('tasks')
  const supabase = await createClient()

  const [{ data: rows }, { data: me }] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        'id, title, kind, law_ref, source_kind, source_ref, owner_member_id, due_at, status, created_at, corrects_task_id',
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
    // Q97: the closed task this one corrects, by title, so the register reads
    // as a chain rather than as two unrelated rows.
    corrects: r.corrects_task_id
      ? (list.find((x) => x.id === r.corrects_task_id)?.title ?? null)
      : null,
  }))

  const { data: assessed } = await supabase
    .from('task_effect_assessments')
    .select('task_id')
    .in('task_id', tasks.map((x) => x.id).length ? tasks.map((x) => x.id) : ['00000000-0000-0000-0000-000000000000'])
  const assessedSet = new Set((assessed ?? []).map((a) => a.task_id))
  for (const task of tasks) task.assessed = assessedSet.has(task.id)

  /*
    C4 — the comments, on the same surface as the tasks (V3:2168-2300).

    ── WHAT THE ROLE DOES HERE, AND WHY THE QUERY DOES NOT SAY IT ────────────

    There is no `.eq('is_anonymous', true)` for a leser. The SELECT policy on
    `survey_comments` already decides it (Q115): any member reads the anonymous
    ones, and only an administrator or redaktør reads a NAMED one, because
    CLAUDE.md invariant 4 gives a leser no named free text anywhere. Repeating
    the rule here would be a second copy that can drift from the first, and the
    one that matters is the one the database enforces.

    The org scope is the same: RLS does it. `.eq('org_id', …)` is not available
    anyway — the table has no org_id and is scoped through its round, which is
    deliberate (one source of truth for tenancy on a table reachable by token).
  */
  const { data: commentRows } = await supabase
    .from('survey_comments')
    .select('id, round_id, question_id, body, is_anonymous, created_at, handled_at, invitation_id')
    .order('created_at', { ascending: false })
    .limit(200)

  const cList = commentRows ?? []
  const cRoundIds = [...new Set(cList.map((c) => c.round_id))]
  const cQuestionIds = [...new Set(cList.map((c) => c.question_id).filter(Boolean))] as string[]

  const [{ data: cRounds }, { data: cQuestions }, { data: replies }] = await Promise.all([
    cRoundIds.length
      ? supabase.from('survey_rounds').select('id, survey_id').in('id', cRoundIds)
      : Promise.resolve({ data: [] as { id: string; survey_id: string }[] }),
    cQuestionIds.length
      ? supabase.from('survey_questions').select('id, text').in('id', cQuestionIds)
      : Promise.resolve({ data: [] as { id: string; text: string }[] }),
    cList.length
      ? supabase
          .from('survey_comment_replies')
          .select('id, comment_id, body, created_at')
          .in('comment_id', cList.map((c) => c.id))
          .order('created_at')
      : Promise.resolve({ data: [] as { id: string; comment_id: string; body: string; created_at: string }[] }),
  ])

  const roundSurvey = new Map((cRounds ?? []).map((r) => [r.id, r.survey_id]))
  const commentSurveyIds = [...new Set([...roundSurvey.values()])]
  const { data: cSurveys } = commentSurveyIds.length
    ? await supabase.from('surveys').select('id, title').in('id', commentSurveyIds)
    : { data: [] as { id: string; title: string }[] }
  const cSurveyTitle = new Map((cSurveys ?? []).map((x) => [x.id, x.title]))
  const questionText = new Map((cQuestions ?? []).map((q) => [q.id, q.text]))

  const repliesBy = new Map<string, { text: string; dateLabel: string }[]>()
  for (const r of replies ?? []) {
    const list = repliesBy.get(r.comment_id) ?? []
    list.push({ text: r.body, dateLabel: fmt(r.created_at) ?? '' })
    repliesBy.set(r.comment_id, list)
  }

  const feedback: FeedbackRow[] = cList.map((c) => {
    const surveyId = roundSurvey.get(c.round_id) ?? null
    return {
      id: c.id,
      text: c.body,
      // The question the comment is ABOUT. Null is the end-of-survey box, which
      // is a real state and not a missing value.
      question: c.question_id ? (questionText.get(c.question_id) ?? null) : null,
      surveyId,
      survey: surveyId ? (cSurveyTitle.get(surveyId) ?? '—') : '—',
      dateLabel: fmt(c.created_at) ?? '',
      /*
        Q116 — DERIVED, not stored. The bundle tags a row with one of six values
        and only «Ny» has a writer in the bundle itself; the other five are
        seeded strings. Two of the six ARE derivable and these are they:
        «ubehandlet» is handled_at being null, «samtale» is having replies. The
        four topical ones (Resultater, Ros, Spørsmålene, Utsending) are NOT
        built: nothing in this product classifies a comment by topic, and a
        `tag` column would have been a fifth instance of the standing question.
      */
      handled: c.handled_at !== null,
      anonymous: c.is_anonymous,
      replies: repliesBy.get(c.id) ?? [],
      /*
        C5 — whether a reply can reach anybody.

        `invitation_id` is what `get_comment_thread` matches on. A comment
        written through a share link has none, because every holder of that link
        is the same principal and «her own thread» has no referent. So a reply to
        it would be stored and never delivered, which is the shape of a control
        that writes into nowhere.

        NOTE THAT THIS IS THE ONLY THING THE SCREEN LEARNS FROM THE COLUMN. The
        id itself is not rendered, not passed to the client, and not used to
        group rows: it is read as a boolean and discarded. `invitation_id`
        scopes a thread and is not a handle on a person (M:0099's comment).
      */
      hasThread: c.invitation_id !== null,
    }
  })

  // A filter over surveys that actually have a comment. Offering every survey
  // would list options that can only ever produce an empty table.
  const surveyOptions = [...new Set(feedback.map((f) => f.surveyId).filter(Boolean))]
    .map((id) => ({ id: id as string, title: cSurveyTitle.get(id as string) ?? '—' }))
    .sort((a, b) => a.title.localeCompare(b.title, 'nb'))

  return (
    <TasksPanel
      persons={vocab.persons}
      tasks={tasks}
      feedback={feedback}
      surveyOptions={surveyOptions}
      canEdit={viewer.role !== 'leser'}
    />
  )
}
