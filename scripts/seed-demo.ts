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
  createShareLink,
  createSurvey,
  dropOrg,
  inviteTo,
  submitResponses,
} from '../tests/db/factories'
import { serviceClient } from '../tests/db/clients'
import {
  DEMO_SHARE_TOKEN,
  GROUP_PRIMARY,
  GROUP_SECONDARY,
  ORG_OTHER,
  ORG_PRIMARY,
  PERSONAS,
} from '../tests/db/personas'

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
  // A second team, so the heatmap and the team rows have the case the k gate
  // exists for: one group above the threshold beside one below it. A seed with
  // a single group can only ever photograph the happy path.
  const svc = serviceClient()
  const { data: secondGroup } = await svc
    .from('groups')
    .insert({ org_id: org.id, name: GROUP_SECONDARY })
    .select('id')
    .single()

  const above = await createSurvey(org.id, 'Arbeidsmiljø — månedlig', [
    { type: 'scale', text: 'Hvordan har uken på jobb vært?' },
    { type: 'text', text: 'Hva bør vi endre?' },
  ], { audience: 'Hele selskapet', langs: ['no', 'en'] })

  // Free text that the seeded theme rules actually match, so the themes panel
  // and the theme-filtered quote list have something real to show. Six people
  // write about "tid", which clears the contributor threshold; two write about
  // "møter", which does not — and must therefore never appear.
  const freeText = [
    'Vi trenger mer sammenhengende tid til dypt arbeid',
    'For lite tid mellom leveransene',
    'Tid til å tenke ville hjulpet mest',
    'Mer tid til fagarbeid, mindre kontekstbytte',
    'Vi mangler tid i kalenderen til å planlegge',
    'Tid er den største flaskehalsen akkurat nå',
  ]

  const aboveRound = await createRound(above, 8, { groupId: org.groupId })
  await submitResponses(
    aboveRound.tokens,
    (i) => ({
      [above.questions[0]!.id]: { value: 3 + (i % 3) },
      [above.questions[1]!.id]: { value: freeText[i] ?? freeText[0]! },
    }),
    6, // > k = 5
  )

  // The second team answers the same round and stays at four: every cell of its
  // heatmap row must come back gated while the first team's shows real numbers.
  const secondTeamText = [
    'For mange møter — møtekulturen må endres',
    'Møtene spiser opp dagen',
    'Færre og kortere møter, takk',
    'Vi bruker for mye av uka i møter',
  ]
  const secondTeamTokens = await inviteTo(aboveRound.id, 5, secondGroup?.id ?? null)
  await submitResponses(
    secondTeamTokens,
    (i) => ({
      // Low scores on purpose: they pull the question's average under 3,6 so the
      // insight panel has a real finding to show rather than an empty box.
      [above.questions[0]!.id]: { value: 1 + (i % 2) },
      [above.questions[1]!.id]: { value: secondTeamText[i] ?? secondTeamText[0]! },
    }),
    4, // < k = 5
  )

  // A second round, so "Mot forrige runde" and the trend panel compare two real
  // numbers rather than the prototype's placeholder `avg - 0.3`.
  const aboveRound2 = await createRound(above, 8, { groupId: org.groupId, roundNo: 2 })
  await submitResponses(
    aboveRound2.tokens,
    (i) => ({
      [above.questions[0]!.id]: { value: 4 + (i % 2) },
      [above.questions[1]!.id]: { value: freeText[(i + 2) % freeText.length]! },
    }),
    6,
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

  // A reusable respondent URL for the harness: /s/<DEMO_SHARE_TOKEN>. An
  // invitation token would answer once and then show the thank-you screen for
  // every later capture.
  await createShareLink(aboveRound.id, DEMO_SHARE_TOKEN)

  const draft = await createSurvey(org.id, 'Utkast uten svar', [
    { type: 'scale', text: 'Et spørsmål som ikke er sendt ennå' },
  ], { status: 'utkast', audience: 'Hele selskapet' })

  console.log(`seeded:
  ${ORG_PRIMARY} (${org.id}) — ${org.members.length} members, group ${GROUP_PRIMARY}
  ${ORG_OTHER} (${other.id}) — cross-org isolation fixture
  "${above.title}" 6 responses (above k=5)
  "${below.title}" 3 responses (below k=5)
  "${draft.title}" draft, no round\n  share link /s/${DEMO_SHARE_TOKEN}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
