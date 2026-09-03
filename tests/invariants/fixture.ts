import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { admin, asUser, uniq } from '../helpers'

/** Mirrors app.hash_token — tokens are only ever stored hashed. */
export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex')

export type Fixture = Awaited<ReturnType<typeof buildFixture>>

/**
 * Two orgs, three users, one survey with a numeric and a free-text question,
 * an open round, and six invitation tokens. Built with the service role
 * deliberately: setup is not what we are testing — the assertions below all run
 * through user-scoped clients so RLS is exercised honestly.
 */
export async function buildFixture() {
  const a = admin()

  const orgA = await insert(a, 'organizations', { name: uniq('Org A') })
  const orgB = await insert(a, 'organizations', { name: uniq('Org B') })

  const adminA = await asUser(uniq('admin-a') + '@example.test')
  const leserA = await asUser(uniq('leser-a') + '@example.test')
  const adminB = await asUser(uniq('admin-b') + '@example.test')
  const redaktorA = await asUser(uniq('redaktor-a') + '@example.test')

  const groupA = await insert(a, 'groups', { org_id: orgA.id, name: 'Team Alfa' })

  await insert(a, 'org_members', {
    org_id: orgA.id, user_id: adminA.userId, email: uniq('admin-a') + '@example.test',
    role: 'administrator', status: 'active',
  })
  const leserMember = await insert(a, 'org_members', {
    org_id: orgA.id, user_id: leserA.userId, email: uniq('leser-a') + '@example.test',
    role: 'leser', status: 'active', group_id: groupA.id,
  })
  await insert(a, 'org_members', {
    org_id: orgB.id, user_id: adminB.userId, email: uniq('admin-b') + '@example.test',
    role: 'administrator', status: 'active',
  })
  const redaktorMember = await insert(a, 'org_members', {
    org_id: orgA.id, user_id: redaktorA.userId, email: uniq('redaktor-a') + '@example.test',
    role: 'redaktor', status: 'active',
  })

  const surveyA = await insert(a, 'surveys', {
    org_id: orgA.id, title: 'Arbeidsmiljø — test', status: 'aktiv', anonymity: 'anonymous',
  })
  const surveyB = await insert(a, 'surveys', {
    org_id: orgB.id, title: 'Org B survey', status: 'aktiv', anonymity: 'anonymous',
  })

  const scaleQ = await insert(a, 'survey_questions', {
    survey_id: surveyA.id, position: 1, type: 'scale', text: 'Hvordan har uken vært?',
  })
  const textQ = await insert(a, 'survey_questions', {
    survey_id: surveyA.id, position: 2, type: 'text', text: 'Hva bør vi endre?',
  })
  // Answered by only two respondents, so the k gate — not an empty table — is
  // what makes get_quotes refuse. Asserting the refusal on textQ alone passed
  // trivially because nothing ever wrote free text.
  const sparseTextQ = await insert(a, 'survey_questions', {
    survey_id: surveyA.id, position: 3, type: 'text', text: 'Noe annet?',
  })

  /**
   * A draft whose only round is still 'scheduled'.
   *
   * D31 freezes questions once a round has actually gone out. Without this
   * survey the freeze test would only prove the trigger fires — never that it
   * leaves a survey scheduled in advance editable, which is the case a
   * too-broad trigger would break.
   */
  const draftSurvey = await insert(a, 'surveys', {
    org_id: orgA.id, title: 'Planlagt — ikke sendt', status: 'utkast', anonymity: 'anonymous',
  })
  const draftQ = await insert(a, 'survey_questions', {
    survey_id: draftSurvey.id, position: 1, type: 'scale', text: 'Fortsatt redigerbart',
  })
  await insert(a, 'survey_rounds', {
    survey_id: draftSurvey.id, round_no: 1, status: 'scheduled',
    question_snapshot: [{ id: draftQ.id, type: 'scale', text: 'Fortsatt redigerbart' }],
  })

  // The redaktør is a co-editor on both, so RLS permits the write and only the
  // D31 trigger can refuse it. Without this the freeze test would pass on an
  // empty result set — an RLS filter, not a denial.
  for (const sid of [surveyA.id, draftSurvey.id]) {
    await insert(a, 'survey_editors', { survey_id: sid, member_id: redaktorMember.id })
  }

  const round = await insert(a, 'survey_rounds', {
    survey_id: surveyA.id, round_no: 1, status: 'open',
    question_snapshot: [
      { id: scaleQ.id, type: 'scale', text: 'Hvordan har uken vært?' },
      { id: textQ.id, type: 'text', text: 'Hva bør vi endre?' },
      { id: sparseTextQ.id, type: 'text', text: 'Noe annet?' },
    ],
  })

  // Six invitations: five to reach k, one spare for the replay test.
  const tokens: string[] = []
  for (let i = 0; i < 6; i++) {
    const raw = uniq(`token-${i}`)
    tokens.push(raw)
    await insert(a, 'survey_invitations', {
      round_id: round.id, email: `r${i}@example.test`, token_hash: hashToken(raw),
      group_id: groupA.id, channel: 'email',
    })
  }

  return {
    orgA, orgB, groupA, surveyA, surveyB, scaleQ, textQ, sparseTextQ, round, tokens,
    adminA, leserA, adminB, redaktorA, leserMemberId: leserMember.id as string,
    redaktorMemberId: redaktorMember.id as string,
    draftSurvey, draftQ,
  }
}

async function insert(client: SupabaseClient, table: string, row: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(row).select().single()
  if (error) throw new Error(`insert ${table}: ${error.message}`)
  return data as Record<string, string> & { id: string }
}
