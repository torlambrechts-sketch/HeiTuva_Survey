/**
 * Seeds the deterministic demo org used by the verification harness.
 * Local/CI only — never point this at a real project.
 *
 * Idempotent: drops and recreates the two demo orgs each run so captures are
 * reproducible. Auth users are reused, so their ids stay stable.
 */
import { config } from 'dotenv'
import {
  createOrg,
  createRound,
  createSurvey,
  dropOrg,
  submitResponses,
} from '../tests/db/factories'
import { GROUP_PRIMARY, ORG_OTHER, ORG_PRIMARY, PERSONAS } from '../tests/db/personas'

if (!process.argv.includes('--local')) config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
if (!url.includes('127.0.0.1') && !url.includes('localhost') && !process.env.ALLOW_REMOTE_SEED) {
  console.error(`Refusing to seed demo data into ${url}. Set ALLOW_REMOTE_SEED=1 to override.`)
  process.exit(1)
}

async function main() {
  await dropOrg(ORG_PRIMARY)
  await dropOrg(ORG_OTHER)

  const org = await createOrg(
    ORG_PRIMARY,
    [
      { email: PERSONAS.administrator.email, role: 'administrator', name: PERSONAS.administrator.name },
      { email: PERSONAS.redaktor.email, role: 'redaktor', name: PERSONAS.redaktor.name },
      { email: PERSONAS.leser.email, role: 'leser', name: PERSONAS.leser.name },
    ],
    { groupName: GROUP_PRIMARY },
  )

  const other = await createOrg(ORG_OTHER, [
    { email: PERSONAS.outsider.email, role: 'administrator', name: PERSONAS.outsider.name },
  ])

  // One survey above the k threshold and one below, so screens can be captured
  // in both their real-data and insufficient-data states.
  const above = await createSurvey(org.id, 'Arbeidsmiljø — månedlig', [
    { type: 'scale', text: 'Hvordan har uken på jobb vært?' },
    { type: 'text', text: 'Hva bør vi endre?' },
  ], { audience: 'Hele selskapet' })
  const aboveRound = await createRound(above, 8, { groupId: org.groupId })
  await submitResponses(
    aboveRound.tokens,
    (i) => ({
      [above.questions[0]!.id]: { value: 3 + (i % 3) },
      [above.questions[1]!.id]: { value: `Frisvar nummer ${i + 1}` },
    }),
    6, // > k = 5
  )

  const below = await createSurvey(org.id, 'Psykososial kartlegging', [
    { type: 'likert', text: 'Jeg vet hva som forventes av meg i jobben min' },
  ], { audience: 'Alle ansatte · årlig' })
  const belowRound = await createRound(below, 6, { groupId: org.groupId })
  await submitResponses(
    belowRound.tokens,
    (i) => ({ [below.questions[0]!.id]: { value: 4 - (i % 2) } }),
    3, // < k = 5, so aggregates must report insufficient_data
  )

  const draft = await createSurvey(org.id, 'Utkast uten svar', [
    { type: 'scale', text: 'Et spørsmål som ikke er sendt ennå' },
  ], { status: 'utkast', audience: 'Hele selskapet' })

  console.log(`seeded:
  ${ORG_PRIMARY} (${org.id}) — ${org.members.length} members, group ${GROUP_PRIMARY}
  ${ORG_OTHER} (${other.id}) — cross-org isolation fixture
  "${above.title}" 6 responses (above k=5)
  "${below.title}" 3 responses (below k=5)
  "${draft.title}" draft, no round`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
