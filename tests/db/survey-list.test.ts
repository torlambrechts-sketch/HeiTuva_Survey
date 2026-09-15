import { describe, expect, it } from 'vitest'
import { serviceClient } from './clients'
import { ORG_PRIMARY } from './personas'

/**
 * F4 — the survey list's six columns and five scope filters, asserted against
 * the DEMO SEED rather than against fixtures this file creates.
 *
 * ── WHY THE SEED IS THE SUBJECT ────────────────────────────────────────────
 *
 * The standing rule is that a phase introducing a screen with no seedable state
 * extends the demo seed in the same phase. The table F4 builds has six columns
 * and the rail above it has five filters, and **every one of them is a state
 * the seed either reaches or does not**. A fixture created inside a test proves
 * the schema can hold the value; it proves nothing about whether a person
 * opening the demo — or the capture harness photographing it — ever sees the
 * branch.
 *
 * That distinction is this project's own: «the seed reaches only states the
 * current code creates» is recorded twice in CLAUDE.md as the reason two
 * features were invisible behind green gates. So these tests read the seeded
 * organisation and fail when a column or a filter has nothing to show.
 *
 * ── AND F4 NEEDS NO MIGRATION, WHICH IS A FINDING RATHER THAN A SHORTCUT ───
 *
 * Measured before building: `surveys` already carries `target`, `created_by`
 * and `status`; «Sendt» is the first round's `opens_at` (`survey_rounds`, NOT
 * NULL with a default, so every round has one); «Eier» resolves through
 * `org_members`, whose select policy is `app.is_org_member(org_id)`; and
 * `survey_rounds` is readable through `app.can_view_survey`. The gap was never
 * the schema — it was the FACTORY, which set neither `target` nor `created_by`,
 * so the demo organisation's owner column was empty and its response column had
 * no denominator. Asking «who writes this column?» of the seed rather than of
 * the migration is the same question one step out.
 */
const svc = serviceClient()

async function orgId() {
  const { data } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  if (!data) throw new Error(`the demo organisation ${ORG_PRIMARY} is not seeded`)
  return data.id as string
}

type Row = {
  id: string
  title: string
  status: string
  target: number | null
  created_by: string | null
}

async function surveys(): Promise<Row[]> {
  const { data, error } = await svc
    .from('surveys')
    .select('id, title, status, target, created_by')
    .eq('org_id', await orgId())
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  return (data ?? []) as Row[]
}

describe('F4 — the table has something to put in every column', () => {
  it('BOTH branches of «Svar» are reachable: a row with a target and a row without', async () => {
    /* F1's property applied to one row: a survey with no recipient count has no
       denominator, so the cell renders the COUNT and not a percentage. The seed
       has to produce both or the branch the product must handle is never drawn
       — and it is the COMMON one in production, where seven of nine surveys
       carry no target. */
    const rows = await surveys()
    expect(rows.filter((s) => s.target !== null && s.target > 0).length).toBeGreaterThan(0)
    expect(rows.filter((s) => s.target === null).length).toBeGreaterThan(0)
  })

  it('«Eier» resolves to a member of the SAME organisation, for every row that has one', async () => {
    /* Not «created_by is not null» on every row: a survey created before the
       column had writers legitimately has none, and the product renders that
       state rather than inventing a name — the bundle's own row fabricates
       `owner || "Tuva Berg"` and an email from it (v6:9056-9057), which is the
       never-fabricate rule broken in a fixture.

       What must hold is that a non-null owner is a real member of the same
       organisation, so the column cannot show a name from another tenant. */
    const org = await orgId()
    const rows = await surveys()
    const owned = rows.filter((s) => s.created_by !== null)
    expect(owned.length, 'no survey in the demo org has an owner').toBeGreaterThan(0)

    const { data: members } = await svc
      .from('org_members')
      .select('id')
      .eq('org_id', org)
    const ours = new Set((members ?? []).map((m) => m.id))
    for (const s of owned) {
      expect(ours.has(s.created_by!), `${s.title} is owned outside the org`).toBe(true)
    }
  })

  it('all three statuses exist, so the mix bar has three real numbers', async () => {
    /* The bar draws aktive / utkast / lukket as three dots. A seed with two
       statuses leaves one dot permanently zero, which is indistinguishable in a
       screenshot from a bar that cannot count. */
    const rows = await surveys()
    const present = new Set(rows.map((s) => s.status))
    for (const st of ['aktiv', 'utkast', 'lukket']) {
      expect(present.has(st), `no ${st} survey in the demo org`).toBe(true)
    }
  })

  it('«Sendt» is derivable, and its empty case is reachable', async () => {
    /* The column is the FIRST round's `opens_at`. A draft has no round and
       renders «—», which is what v6:9061 draws (`s.sent || "—"`). Both sides
       have to exist or one of them is never seen. */
    const rows = await surveys()
    const { data: rounds } = await svc
      .from('survey_rounds')
      .select('survey_id, opens_at')
      .in('survey_id', rows.map((s) => s.id))
    const sent = new Set((rounds ?? []).map((r) => r.survey_id))
    expect(sent.size, 'no survey has been sent').toBeGreaterThan(0)
    expect(rows.some((s) => !sent.has(s.id)), 'every survey has been sent').toBe(true)
    for (const r of rounds ?? []) expect(r.opens_at).toBeTruthy()
  })
})

describe('F4 — each of the five scope filters has something to select', () => {
  /* v6:8943 draws five: Alle · Mine · Lav svarprosent · Gjentakende · Delt med
     meg. A filter whose result set is always empty is a control that cannot be
     told apart from a broken one, so each is asserted against the seed. */

  it('«Mine» — at least one survey is owned by a named member', async () => {
    const rows = await surveys()
    const byOwner = new Map<string, number>()
    for (const s of rows) {
      if (s.created_by) byOwner.set(s.created_by, (byOwner.get(s.created_by) ?? 0) + 1)
    }
    expect(byOwner.size, 'no owner to filter by').toBeGreaterThan(0)
    /* And more than one owner, or «Mine» selects everything and the filter
       demonstrates nothing. */
    expect(byOwner.size).toBeGreaterThan(1)
  })

  it('«Lav svarprosent» — an ACTIVE survey with a target and under 70 %', async () => {
    /* The predicate needs all three: active, a denominator, and a rate below
       the threshold. `rowRate` is the app's definition; this asserts the seed
       can satisfy it, using the response counts the list itself reads. */
    const rows = await surveys()
    const { data: counts } = await svc.rpc('survey_response_counts', { p_org: await orgId() })
    const responses = new Map((counts ?? []).map((c) => [c.survey_id, Number(c.responses)]))
    const low = rows.filter(
      (s) =>
        s.status === 'aktiv' &&
        s.target !== null &&
        s.target > 0 &&
        (responses.get(s.id) ?? 0) / s.target < 0.7,
    )
    expect(low.length, 'no active survey is under 70 % with a real denominator').toBeGreaterThan(0)
  })

  it('«Gjentakende» — a schedule whose cadence is not «once»', async () => {
    const rows = await surveys()
    const { data } = await svc
      .from('schedules')
      .select('survey_id, cadence')
      .in('survey_id', rows.map((s) => s.id))
    expect(
      (data ?? []).filter((r) => r.cadence !== 'once').length,
      'no recurring schedule in the demo org',
    ).toBeGreaterThan(0)
  })

  it('«Delt med meg» — a survey_editors row, which is what «shared» means here', async () => {
    /* The bundle's predicate is `!!(s.share && s.share.length)` — «this survey
       has co-editors», which is a property of the SURVEY. Ours is «shared with
       ME», a property of the viewer, because that is what the label says and
       because a list showing every survey that happens to have an editor is not
       a scope at all. The seed has to carry a row either way. */
    const rows = await surveys()
    const { data } = await svc
      .from('survey_editors')
      .select('survey_id, member_id')
      .in('survey_id', rows.map((s) => s.id))
    expect((data ?? []).length, 'no survey is shared with anybody').toBeGreaterThan(0)
  })
})
