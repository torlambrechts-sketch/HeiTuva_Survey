/**
 * Gate 2d probe — attempt the violation each constraint exists to prevent.
 *
 * Every one of these runs with the SERVICE ROLE on purpose. RLS is not the
 * subject: a constraint that only holds because a policy filtered the row is
 * not a constraint, and the service role is exactly the caller that would
 * discover that. What must refuse here is the database itself.
 */
import { config } from 'dotenv'
import { serviceClient } from '../../tests/db/clients'
import { ORG_PRIMARY } from '../../tests/db/personas'

config({ path: '.env.local', quiet: true })

let failures = 0
function refused(label: string, error: { message: string } | null, expect: RegExp) {
  const pass = !!error && expect.test(error.message)
  if (!pass) failures++
  console.log(
    `  ${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(48)} ${(error?.message ?? 'ACCEPTED — no error').slice(0, 76)}`,
  )
}

async function main() {
  const svc = serviceClient()
  const { data: org } = await svc.from('organizations').select('id').eq('name', ORG_PRIMARY).single()
  const { data: duty } = await svc.from('duties').select('id').eq('org_id', org!.id).limit(1).single()
  const { data: survey } = await svc.from('surveys').select('id').eq('org_id', org!.id).limit(1).single()
  const { data: round } = await svc
    .from('survey_rounds').select('id').eq('survey_id', survey!.id).limit(1).single()
  const { data: invitation } = await svc
    .from('survey_invitations').select('id').eq('round_id', round!.id).limit(1).maybeSingle()

  console.log('\n== CHECK constraints ==')
  {
    const { error } = await svc.from('duties').update({ reminder_weeks: 3 }).eq('id', duty!.id)
    refused('duties.reminder_weeks must be 2, 4 or 8', error, /reminder_weeks|check constraint/i)
  }
  {
    const { error } = await svc.from('report_exports').insert({
      report_id: '00000000-0000-0000-0000-000000000000', format: 'docx', storage_path: 'x/y.docx',
    })
    refused('report_exports.format must be pdf or pptx', error, /format|check constraint|foreign key/i)
  }
  {
    // The anonymity CHECK: an anonymous response may not reference an invitation.
    const { error } = await svc.from('responses').insert({
      round_id: round!.id, anonymity_at_submission: 'anonymous', invitation_id: invitation?.id ?? null,
    })
    refused('anonymous response cannot carry invitation_id',
      invitation ? error : { message: 'no invitation to link — SKIPPED' },
      invitation ? /responses_anonymous_unlinked|check constraint/i : /SKIPPED/)
  }

  console.log('\n== UNIQUE constraints ==')
  {
    const { data: share } = await svc
      .from('report_shares').select('report_id, token_hash, scope').limit(1).maybeSingle()
    if (share) {
      const { error } = await svc.from('report_shares').insert({
        report_id: share.report_id, token_hash: share.token_hash, scope: share.scope,
      })
      refused('report_shares.token_hash is unique', error, /duplicate key|unique/i)
    } else {
      console.log('  --   report_shares.token_hash is unique               SKIPPED — no share row seeded')
    }
  }
  {
    const { data: check } = await svc.from('duty_checks').select('duty_id, key').limit(1).single()
    if (!check) throw new Error('fixture: no duty_checks row')
    const { error } = await svc.from('duty_checks').insert({ duty_id: check.duty_id, key: check.key })
    refused('duty_checks (duty_id, key) is unique', error, /duplicate key|unique/i)
  }

  console.log('\n== FOREIGN KEYS ==')
  {
    const { error } = await svc.from('reports').insert({
      org_id: '00000000-0000-0000-0000-000000000000', title: 'ingen org', sections: [], filters: {},
    })
    refused('reports.org_id must reference an organisation', error, /foreign key|violates/i)
  }
  {
    const { error } = await svc.from('loop_actions').insert({
      org_id: '00000000-0000-0000-0000-000000000000', text: 'ingen org',
    })
    refused('loop_actions.org_id must reference an organisation', error, /foreign key|violates/i)
  }

  console.log('\n== TRIGGERS ==')
  {
    // The signature guard. A direct write is the whole attack: an administrator
    // with table access must not be able to manufacture somebody's signature.
    const { data: signer } = await svc
      .from('duty_signers').select('id').eq('duty_id', duty!.id).limit(1).single()
    if (!signer) throw new Error('fixture: no duty_signers row')
    const { error } = await svc
      .from('duty_signers')
      .update({ signed_at: new Date().toISOString(), signed_content_hash: 'forged' })
      .eq('id', signer.id)
    refused('duty_signers signature cannot be written directly', error, /sign_duty|check_violation/i)
  }
  {
    const { data: signer } = await svc
      .from('duty_signers').select('id').eq('duty_id', duty!.id).limit(1).single()
    const { error } = await svc.from('duty_signers').insert({
      duty_id: duty!.id, role_key: 'forged-role', label: 'Forfalsket',
      signed_at: new Date().toISOString(),
    })
    void signer
    refused('a signature cannot be INSERTED already signed', error, /sign_duty|check_violation/i)
  }
  {
    const { data: version } = await svc
      .from('duty_versions').select('id, label').eq('duty_id', duty!.id).limit(1).maybeSingle()
    if (version) {
      const { error } = await svc
        .from('duty_versions').update({ label: 'omskrevet historie' }).eq('id', version.id)
      refused('duty_versions content is append-only', error, /append-only/i)
    } else {
      console.log('  --   duty_versions content is append-only            SKIPPED — no version row')
    }
  }
  {
    // The counterpart the CLAUDE.md rule exists for: the freeze must NOT block
    // the FK maintenance PostgreSQL does on its own behalf. Deleting the report
    // a version points at must succeed and null the reference.
    //
    // Built and destroyed here rather than borrowed from the seed. An earlier
    // version of this probe deleted a SEEDED report, and the Phase 5 round-trip
    // probe — which expects that report to exist — then failed on its second
    // run. A probe that manufactures its condition by mutating shared fixture
    // data passes once and breaks the next run.
    const { data: ownReport } = await svc.from('reports').insert({
      org_id: org!.id, title: 'Constraint probe — engangsbruk', kind: 'lov', status: 'utkast',
      duty_id: duty!.id, sections: [], filters: {},
    }).select('id').single()

    if (ownReport) {
      const { data: ownVersion } = await svc.from('duty_versions').insert({
        duty_id: duty!.id, label: 'Constraint probe', content_hash: 'probe',
        report_id: ownReport.id,
      }).select('id').single()

      const { error } = await svc.from('reports').delete().eq('id', ownReport.id)
      const { data: afterDelete } = await svc
        .from('duty_versions').select('id, report_id').eq('id', ownVersion?.id ?? '').maybeSingle()
      const pass = !error && !!afterDelete && afterDelete.report_id === null
      if (!pass) failures++
      console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${'FK SET NULL passes through the freeze'.padEnd(48)} ${
        error?.message ?? `report deleted, version kept with report_id=${afterDelete?.report_id}`}`.slice(0, 140))

      if (ownVersion) await svc.from('duty_versions').delete().eq('id', ownVersion.id)
    }
  }

  console.log(failures === 0 ? '\nevery constraint refused what it exists to refuse' : `\n${failures} constraint(s) did not hold`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
