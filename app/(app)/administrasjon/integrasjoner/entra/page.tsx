import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { requireViewer } from '@/lib/auth/session'
import {
  CONNECT_STEPS,
  DIRECTORY_FIELDS,
  REQUESTED_SCOPES,
  connectorState,
  type ConnectionRow,
  type EntraState,
} from '@/lib/directory/catalogue'

/**
 * Microsoft Entra ID — the detail page, v5:3819-3902.
 *
 * The two states v5 adds over v4 are `intDetailOpen` and `intListOpen`, and
 * this is the first of them. Built AS THE DRAWING with every value read from a
 * connection that exists: the reasoning for what each section can and cannot be
 * fed is in `lib/scim/catalogue.ts`, and the one-line version is that **the page
 * is drawn for a pull integration and what exists is a push one.**
 *
 * A SERVER COMPONENT with no client half, deliberately: there is nothing to
 * interact with here. Minting and revoking the token stay on the list screen,
 * where they were built, because a second pair of controls for one credential is
 * two things to keep in step.
 *
 * `intDetail` for `lonn` is NOT a route. Q88 decided sykefravær is not a product
 * feature and lønn is the same class — it reads `gender` and `salaryBand`, and
 * «Kjønnsdelt rapport etter ldl. § 26» is the claim V2-8's sweep already found
 * false against the schema. Confirmed out in V5-0 and still out.
 */
export default async function EntraDetailPage() {
  const viewer = await requireViewer()
  // The list screen renders nothing for a non-administrator; a deep link must
  // do the same, and 404 rather than an empty page — the tab is the only route
  // in, so «this page does not exist for you» is the honest answer.
  if (viewer.role !== 'administrator') notFound()

  const t = await getTranslations('integrations')
  const supabase = await createClient()
  const { data } = await supabase.rpc('entra_connection_status')
  const row = ((data ?? []) as ConnectionRow[])[0] ?? null
  const entra: EntraState = connectorState(row)

  /* The same four chips the list screen draws, from the same state machine.
     Duplicated here rather than exported because they are four literals and a
     shared helper would be a module for a lookup table — but if a fifth state
     is ever added to `connectorState`, `tests/unit/integrations.test.ts`
     asserts every state has a chip on BOTH screens. */
  const statusChip: Record<EntraState['status'], { label: string; bg: string; fg: string }> = {
    connected: { label: t('statusConnected'), bg: '#E4F2E0', fg: '#2F5D2A' },
    needs_setup: { label: t('statusNeedsSetup'), bg: 'var(--ac3)', fg: '#8A4B22' },
    failing: { label: t('statusFailing'), bg: 'var(--ac3)', fg: '#8A4B22' },
    absent: { label: t('statusAbsent'), bg: 'var(--sf2)', fg: 'var(--mut)' },
  }

  const chip = statusChip[entra.status]!

  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('nb-NO', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null

  const CARD = 'rounded-[18px] border border-line bg-sf px-6 py-[22px]'
  const LABEL = 'block text-[11px] uppercase tracking-[.09em] text-mut'

  return (
    <div className="mt-5 flex flex-col gap-[18px]">
      {/* v5:3821-3835 — the header card. */}
      <section className="rounded-[20px] border border-line bg-sf px-[26px] py-6">
        <Link
          href="/administrasjon/integrasjoner"
          className="touch-44 inline-block cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold text-mut no-underline"
        >
          ← {t('detailBack')}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-[26px] font-medium">{t('entraName')}</h2>
            {/* v5:3826 renders «{tenant} · {protocol}» and the tenant is
                `nordiskstudio.onmicrosoft.com` — a fiction. WE STORE NO TENANT:
                SCIM hands us a bearer token, not a directory identity, so there
                is no tenant id anywhere in the schema to render. The line is the
                protocol alone, which is a fact about this endpoint. */}
            <p className="mt-1 text-[13px] text-mut">{t('detailProtocol')}</p>
          </div>
          <span
            className="flex-none whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold"
            style={{ background: chip.bg, color: chip.fg }}
          >
            {chip.label}
          </span>
        </div>
        <p className="mt-3 max-w-[620px] text-[13.5px] leading-[1.6] text-mut">
          {t('detailNote')}
        </p>
        <div className="mt-[18px] flex flex-wrap gap-[22px] border-t border-line pt-4">
          <span>
            <span className={LABEL}>{t('detailLastSync')}</span>
            {/* `last_sync_at`, and it means a COMPLETED sync: `entra_record_sync`
                advances it only when the error is null, so a run that died on
                page 4 leaves yesterday's timestamp standing rather than claiming
                today's. That distinction is the whole of property 1. */}
            <span className="mt-[3px] block text-sm font-semibold">
              {when(entra.lastSyncAt) ?? t('detailNeverSynced')}
            </span>
          </span>
          <span>
            <span className={LABEL}>{t('detailNextSync')}</span>
            {/* A REAL CLOCK NOW, and it is real because the schedule is OURS.
                Under push this read «Bestemmes i Entra», which was the honest
                answer to a question we could not answer. Pull moved the
                schedule to pg_cron, so the page states the cadence rather than a
                fabricated timestamp — «hver natt kl. 03» is a fact about the
                job, where «I morgen kl. 06:00» was a fact about nothing. */}
            <span className="mt-[3px] block text-sm font-semibold">
              {entra.status === 'absent' ? t('detailNextSyncNone') : t('detailNextSyncCadence')}
            </span>
          </span>
          {entra.tenantId ? (
            <span>
              {/* REAL NOW. v5:3826 draws `nordiskstudio.onmicrosoft.com`, which
                  was a fiction under push because SCIM hands us a bearer token
                  and not a directory identity. Consent hands us the tenant, so
                  an administrator can confirm they consented for the right
                  directory — which is the one thing this field is FOR. */}
              <span className={LABEL}>{t('detailTenant')}</span>
              <span className="mt-[3px] block font-mono text-sm font-semibold">
                {entra.tenantId}
              </span>
            </span>
          ) : null}
        </div>
      </section>

      <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        {/* v5:3837-3852 — «Felter vi henter». The heading says «vi mottar»
            instead, because we receive what Entra sends and fetch nothing. */}
        <section className={CARD}>
          <h3 className="text-base font-semibold">{t('detailFieldsTitle')}</h3>
          <p className="mt-1 text-[12.5px] text-mut">{t('detailFieldsPromise')}</p>
          {DIRECTORY_FIELDS.map((f) => (
            <div
              key={f.key}
              className="flex flex-wrap items-baseline gap-3 border-b border-line py-2.5"
            >
              {/* Full width below `md`, 150px above it. RESPONSIVE.md § Data
                  tables: a row whose controls do not fit becomes a card, and a
                  150px fixed column plus an attribute name like
                  `employeeLeaveDateTime` does not fit 320px. `break-all` rather
                  than `truncate` here — an attribute name is the thing the
                  reader is matching against the Entra portal, so an ellipsis
                  would remove the half that identifies it. */}
              <span className="w-full flex-none break-all font-mono text-[11.5px] text-mut md:w-[150px] md:truncate md:whitespace-nowrap">
                {f.key}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{t(`field_${f.key}`)}</span>
                {f.column ? (
                  <span className="mt-0.5 block text-[11.5px] text-mut">
                    {t('detailFieldLands', { column: f.column })}
                  </span>
                ) : (
                  /* The refusal is rendered, not the row hidden. «Ingenting
                     utover dette leses fra katalogen» is only checkable if the
                     list says what it does NOT read — and three of these share
                     one reason on purpose: a directory field describes a person,
                     it does not decide what the product does to her. */
                  <span className="mt-0.5 block text-[11.5px] font-semibold text-mut">
                    {t(`detailRefusal_${f.refusal}`)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </section>

        <div className="flex flex-col gap-[18px]">
          {/* v5:3854-3864 — «Tillatelser», answered about the token that exists
              rather than about Graph scopes we do not hold. */}
          <section className="rounded-[18px] border border-line bg-sbg px-6 py-[22px]">
            <h3 className="text-base font-semibold">{t('detailScopesTitle')}</h3>
            {/* REAL GRAPH SCOPES AGAIN, and read back from what the
                administrator ACTUALLY CONSENTED TO rather than from what we
                asked for — `entra_connections.scopes` is written at consent.
                Before a connection exists the page shows what WILL be asked,
                which is a different claim and is labelled as one.

                ONE SCOPE, not the bundle's three. `Directory.Read.All` is not
                registered at all: it reads the catalogue's structure and is
                broader than the need. `Group.Read.All` IS registered and is not
                REQUESTED, because nothing calls it yet — Entra's own groups are
                an audience and the audience shape is undecided. A permission an
                administrator must approve has to be defensible line by line, and
                «we might use it later» is not a line. */}
            {(entra.scopes.length > 0 ? entra.scopes : [...REQUESTED_SCOPES]).map((scope) => (
              <div
                key={scope}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[rgba(25,21,16,.12)] py-2.5"
              >
                <span className="min-w-0 font-mono text-[11.5px] font-semibold">{scope}</span>
                <span className="min-w-0 flex-1 text-xs text-mut md:text-right">
                  {t('detailScopeUsers')}
                </span>
              </div>
            ))}
            <p className="mt-3 text-[11.5px] leading-[1.5] text-mut">
              {entra.scopes.length > 0 ? t('detailScopesNote') : t('detailScopesPlanned')}
            </p>
          </section>

          {/* v5:3866-3876 — «Grupper i synk», and THE INSTRUCTION AND THE BUILD
              DISAGREE HERE, deliberately.

              «Show which Entra groups sync» assumes Entra's groups are what
              arrives. The model decision says otherwise: a DEPARTMENT breaks
              down (one each, stable, a leader who owns the cell) and an Entra
              GROUP targets (overlapping by design, no owner). So what syncs is
              departments, as breakdown groups — and Entra's own groups are not
              read at all, because they are an audience and `segments` cannot
              carry an explicit membership list as it stands.

              A CUSTOMER WILL ASSUME OTHERWISE — «we have a group for the night
              shift, so we can see how the night shift answered» is the obvious
              reading — so the page says which of the two these are, in as many
              words, rather than leaving it to be discovered from a report. */}
          <section className={CARD}>
            <h3 className="text-base font-semibold">{t('detailGroupsTitle')}</h3>
            <p className="mt-1.5 text-[12.5px] leading-[1.55] text-mut">
              {t('detailGroupsAreDepartments')}
            </p>
            <p className="mt-2 text-[12.5px] leading-[1.55] text-mut">
              {t('detailGroupsNotEntra')}
            </p>
            {/* THE DEPARTMENT-COVERAGE LINE, per the model decision. A person
                with no department lands in NO group, never an invented one — so
                the honest thing is to say how many that is. Rendered only after
                a sync has produced the numbers: before that they are null and
                the sentence would be about nothing. */}
            {entra.membersSeen !== null && entra.membersWithDepartment !== null ? (
              <p className="mt-3 rounded-[11px] bg-sbg px-3.5 py-[11px] text-[12.5px] leading-[1.5]">
                {t('detailDepartmentCoverage', {
                  with: entra.membersWithDepartment,
                  seen: entra.membersSeen,
                  without: entra.membersSeen - entra.membersWithDepartment,
                })}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {/* v5:3878-3890 — «Slik kobler dere til», and the bundle's own note that
          this is the one section that is CONTENT rather than state: it renders
          whether or not a connection exists, because it is how one is made. The
          four steps are rewritten for the direction the integration runs — there
          is no consent screen and no «Kjør første synk» button. */}
      <section className={CARD}>
        <h3 className="text-base font-semibold">{t('detailStepsTitle')}</h3>
        <div className="mt-3.5 grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
          {CONNECT_STEPS.map((s, i) => (
            <div key={s} className="rounded-[14px] border border-line bg-bg px-[18px] py-4">
              <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[9px] bg-ac text-xs font-bold">
                {i + 1}
              </span>
              <div className="mt-2.5 text-[13.5px] font-semibold">{t(`detailStep_${s}`)}</div>
              <div className="mt-1 text-xs leading-[1.55] text-mut">
                {t(`detailStepDesc_${s}`)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3.5 text-[11.5px] leading-[1.5] text-mut">{t('endpointHint')}</p>
      </section>

      {/* v5:3892-3901 — «Synklogg». NOTHING STORES A HISTORY: no scim_* function
          writes audit_events (checked against pg_proc, all nine), and
          scim_credentials holds only the latest outcome. So this is the latest
          outcome, and it says so — one line rather than four rows of fixture. A
          log TABLE is a decision with a retention question attached, not a
          drawing to implement. */}
      <section className={CARD}>
        <h3 className="text-base font-semibold">{t('detailLogTitle')}</h3>
        <p className="mt-1 text-[12.5px] leading-[1.55] text-mut">{t('detailLogNoHistory')}</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-b border-line py-2.5">
          <span className="flex-none whitespace-nowrap text-xs text-mut md:w-[116px]">
            {when(entra.lastErrorAt ?? entra.lastSyncAt) ?? '—'}
          </span>
          <span className="min-w-0 flex-1 text-[13px] font-semibold">
            {entra.status === 'failing'
              ? t('detailLogFailing', { count: entra.errors })
              : entra.lastSyncAt
                ? t('detailLogOk')
                : t('detailLogNever')}
          </span>
          {entra.status === 'failing' && entra.lastError ? (
            /* The provider's own error text, which is why it is rendered as data
               and never interpolated into a sentence — and why no respondent
               free text can reach here: the only writer is
               `recordScimOutcome`, over HTTP statuses and named database
               refusals. */
            <span className="text-right text-xs text-mut">{entra.lastError}</span>
          ) : null}
        </div>
      </section>
    </div>
  )
}
