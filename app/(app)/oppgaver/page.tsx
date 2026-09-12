import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { readWorkspace } from '@/lib/workspace/current'
import { DEFAULT_VOCABULARY } from '@/lib/workspace/modules'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import { type TaskStatus } from '@/lib/tasks/lifecycle'
import { WORKLIST_COOKIE, resolveWorklistView } from '@/lib/worklist/view'
import { WORKLIST_TYPES, type WorklistType } from '@/lib/worklist/rows'
import { WorklistPanel, type WorklistItem } from './WorklistPanel'

const KIND_KEY: Record<string, string> = {
  tiltak: 'taskKindTiltak',
  risikovurdering: 'taskKindRisikovurdering',
  undersokelsesplikt: 'taskKindUndersokelsesplikt',
  leverandoroppfolging: 'taskKindLeverandoroppfolging',
  innsynskrav: 'taskKindInnsynskrav',
}

/**
 * Arbeidsliste — v5:3128-3374. **This REPLACES C4's screen rather than
 * extending it**, which is the phase's largest fact and the bundle's own: the
 * eight states v5 removes (`showTasks`, `showFeedback`, `fb.hasQuestion`,
 * `fb.hasReplies`, `fb.replyOpen`, `t2.hasLaw`, `t2.isLate`, `t2.needsEffect`)
 * are C4's two-panel model, and they are gone because one list with
 * `r.isTask` / `r.isFb` cannot be assembled out of two panels. The buckets, the
 * select-all checkbox and the board columns are properties of the COMBINED
 * list.
 *
 * ── WHAT A ROW MAY SAY IS STILL Q72, AND STILL HONOURED HERE ───────────────
 *
 * A task renders the survey's TITLE and nothing else about it: no group, no
 * question, no score, no condition. `tasks` has no column that could hold one,
 * asserted in `tests/db/tasks.test.ts`, so the schema carries the rule rather
 * than this renderer.
 *
 * **And the bundle's lead sentence is Q72's REJECTED TRIGGER, in the copy
 * again.** v5:3151 reads «Hvert funn under terskel blir et tiltak med ansvarlig
 * og frist» — which is a task fired by a FINDING falling below threshold, and
 * that is the trigger Q72 refused because it would put «this small group scored
 * badly» in a register a `leser` reads in full. What actually fires a task is
 * `app.generate_blind_spot_tasks`: a survey has a group that will never receive
 * its own results, which is a count of PEOPLE. `wlLead` says that. Corrected,
 * not implemented — the same instruction the phase was given.
 *
 * ── THE TYPE RAIL IS A SEARCH PARAM, AND THAT IS WHY IT CAN BE IN THE SHELL ─
 *
 * v5 puts «Alt · Oppgaver · Tilbakemeldinger» in the subnav strip
 * (v5:6331-6335), which is shell. V5-1 could not render it there because the
 * filter was client state and the shell is a server component; a URL parameter
 * is readable by both, so the rail goes where it is drawn and the screen holds
 * no second copy of it. The scope rail («Alle · Mine · Over frist · Lovpålagt ·
 * Ubehandlet», v5:3179) stays inside the card, where the bundle draws it.
 */
export default async function WorklistPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const viewer = await requireViewer()
  const params = await searchParams
  const type: WorklistType =
    WORKLIST_TYPES.find((v) => v === params.type) ?? 'alle'

  /* W3 · Q122 — the workspace's vocabulary, resolved HERE because the choice
     is a cookie and only a server render can read it. */
  const vocab = (await readWorkspace(viewer.orgId))?.vocabulary ?? DEFAULT_VOCABULARY
  const t = await getTranslations('tasks')
  const supabase = await createClient()
  const store = await cookies()

  const [{ data: rows }, { data: me }, { data: org }] = await Promise.all([
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
    supabase.from('organizations').select('worklist_view').eq('id', viewer.orgId).maybeSingle(),
  ])

  /* Q152 — the per-person choice, then the organisation's default, then the
     registry's first entry. Three steps in `resolveWorklistView`, not a chain
     of `??`, because each fallback is a different fact. */
  const view = resolveWorklistView(store.get(WORKLIST_COOKIE)?.value, org?.worklist_view)

  const list = rows ?? []
  const ownerIds = [...new Set(list.map((r) => r.owner_member_id).filter(Boolean))] as string[]
  const surveyIds = [...new Set(list.map((r) => r.source_ref).filter(Boolean))] as string[]
  const dutyKeys = [...new Set(list.map((r) => r.law_ref).filter(Boolean))] as string[]

  const [{ data: owners }, { data: taskSurveys }, { data: duties }] = await Promise.all([
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
  const surveyBy = new Map((taskSurveys ?? []).map((s) => [s.id, s.title]))
  // Q70: the citation comes from the registry, never from a string on the task.
  const lawBy = new Map((duties ?? []).map((d) => [d.key, d.law]))

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) : null

  /*
    The comments, on the same list as the tasks.

    There is no `.eq('is_anonymous', true)` for a leser: the SELECT policy on
    `survey_comments` decides it (Q115) — any member reads the anonymous ones,
    and only an administrator or redaktør reads a NAMED one, because CLAUDE.md
    invariant 4 gives a leser no named free text anywhere. Repeating the rule
    here would be a second copy that can drift, and the one that matters is the
    one the database enforces.
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
      : Promise.resolve({
          data: [] as { id: string; comment_id: string; body: string; created_at: string }[],
        }),
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
    const bucket = repliesBy.get(r.comment_id) ?? []
    bucket.push({ text: r.body, dateLabel: fmt(r.created_at) ?? '' })
    repliesBy.set(r.comment_id, bucket)
  }

  /*
    «Interne notater» (M:0113), for both halves of the list in one read.

    Two `.in()` filters rather than a join, because the table has no org_id and
    is reachable only through its parent — which is deliberate, and means RLS
    already decided what comes back. A note on a comment a `leser` may not read
    is not in this result at all.
  */
  const noteTaskIds = list.map((r) => r.id)
  const noteCommentIds = cList.map((c) => c.id)
  const { data: noteRows } = await supabase
    .from('worklist_notes')
    .select('id, task_id, comment_id, body, author_member_id, created_at')
    .or(
      [
        noteTaskIds.length ? `task_id.in.(${noteTaskIds.join(',')})` : null,
        noteCommentIds.length ? `comment_id.in.(${noteCommentIds.join(',')})` : null,
      ]
        .filter(Boolean)
        .join(',') || 'id.is.null',
    )
    .order('created_at')

  const noteAuthorIds = [
    ...new Set((noteRows ?? []).map((n) => n.author_member_id).filter(Boolean)),
  ] as string[]
  const { data: noteAuthors } = noteAuthorIds.length
    ? await supabase.from('org_members').select('id, name, email').in('id', noteAuthorIds)
    : { data: [] as { id: string; name: string | null; email: string }[] }
  const authorBy = new Map((noteAuthors ?? []).map((o) => [o.id, o.name || o.email]))

  const notesFor = (key: 'task_id' | 'comment_id', id: string) =>
    (noteRows ?? [])
      .filter((n) => n[key] === id)
      .map((n) => ({
        id: n.id,
        text: n.body,
        // A departed colleague's note keeps its text and loses its name —
        // `author_member_id` is ON DELETE SET NULL, so `null` is a real state.
        who: n.author_member_id ? (authorBy.get(n.author_member_id) ?? null) : null,
        dateLabel: fmt(n.created_at) ?? '',
      }))

  const { data: assessed } = await supabase
    .from('task_effect_assessments')
    .select('task_id')
    .in(
      'task_id',
      noteTaskIds.length ? noteTaskIds : ['00000000-0000-0000-0000-000000000000'],
    )
  const assessedSet = new Set((assessed ?? []).map((a) => a.task_id))

  const taskItems: WorklistItem[] = list.map((r) => ({
    key: `t|${r.id}`,
    id: r.id,
    kind: 'task',
    title: r.title,
    typeLabel: t(KIND_KEY[r.kind] ?? 'taskKindTiltak'),
    law: r.law_ref ? (lawBy.get(r.law_ref) ?? null) : null,
    source:
      r.source_kind === 'survey' && r.source_ref
        ? t('taskSourceSurvey', { title: surveyBy.get(r.source_ref) ?? '—' })
        : t('taskSourceManual'),
    owner: r.owner_member_id ? (ownerBy.get(r.owner_member_id) ?? null) : null,
    ownerMemberId: r.owner_member_id,
    dueAt: r.due_at,
    dueLabel: fmt(r.due_at),
    status: r.status as TaskStatus,
    mine: r.owner_member_id !== null && r.owner_member_id === (me?.id ?? null),
    assessed: assessedSet.has(r.id),
    handled: false,
    anonymous: false,
    hasThread: false,
    question: null,
    replies: [],
    notes: notesFor('task_id', r.id),
    // Q97: the closed task this one corrects, by title, so the register reads
    // as a chain rather than as two unrelated rows.
    corrects: r.corrects_task_id
      ? (list.find((x) => x.id === r.corrects_task_id)?.title ?? null)
      : null,
  }))

  const commentItems: WorklistItem[] = cList.map((c) => {
    const surveyId = roundSurvey.get(c.round_id) ?? null
    return {
      key: `c|${c.id}`,
      id: c.id,
      kind: 'comment',
      title: c.body,
      typeLabel: t('wlTypeFeedback'),
      law: null,
      source: surveyId ? (cSurveyTitle.get(surveyId) ?? '—') : '—',
      // A comment has no owner. The bundle sets `owner: f.who` and titles the
      // chip panel «Avsendere» when the list is feedback-only (v5:6933); Q155
      // declines that — see WorklistPanel.
      owner: null,
      ownerMemberId: null,
      dueAt: null,
      dueLabel: null,
      status: null,
      mine: false,
      assessed: false,
      handled: c.handled_at !== null,
      anonymous: c.is_anonymous,
      /*
        C5 — whether a reply can reach anybody. A comment written through a
        share link has no invitation, because every holder of that link is the
        same principal and «her own thread» has no referent. The id itself is
        read as a boolean and discarded: `invitation_id` scopes a thread and is
        not a handle on a person (M:0099's comment).
      */
      hasThread: c.invitation_id !== null,
      // The question the comment is ABOUT. Null is the end-of-survey box, which
      // is a real state and not a missing value.
      question: c.question_id ? (questionText.get(c.question_id) ?? null) : null,
      replies: repliesBy.get(c.id) ?? [],
      notes: notesFor('comment_id', c.id),
      corrects: null,
    }
  })

  /* The «Ny oppgave» form's option sets, read rather than typed: `ntKinds`
     (v5:6875) is a literal array of six strings in the bundle, and five of the
     six are `task_kinds` rows. The sixth is «Tilbakemelding», which is not a
     kind of task at all — it is the OTHER half of this list. */
  const [{ data: kinds }, { data: allSurveys }, { data: members }] = await Promise.all([
    supabase.from('task_kinds').select('key').order('sort_order'),
    supabase
      .from('surveys')
      .select('id, title')
      .eq('org_id', viewer.orgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('org_members')
      .select('id, name, email, status')
      .eq('org_id', viewer.orgId)
      .order('name'),
  ])

  return (
    <WorklistPanel
      persons={vocab.persons}
      type={type}
      view={view}
      items={[...taskItems, ...commentItems]}
      kindOptions={(kinds ?? []).map((k) => ({
        key: k.key,
        label: t(KIND_KEY[k.key] ?? 'taskKindTiltak'),
      }))}
      surveyOptions={(allSurveys ?? []).map((s) => ({ id: s.id, title: s.title }))}
      /* A deactivated member is not offered as an owner: assigning a duty to
         somebody the organisation has said no longer works here is a register
         entry that cannot be actioned. Existing rows keep their owner — the
         column is `on delete set null` and nothing here rewrites it. */
      memberOptions={(members ?? [])
        .filter((m) => m.status === 'active')
        .map((m) => ({ id: m.id, name: m.name || m.email }))}
      canEdit={viewer.role !== 'leser'}
    />
  )
}
