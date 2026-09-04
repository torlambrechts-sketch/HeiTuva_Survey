import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { DutyChecklist } from './DutyChecklist'
import { DutySettings } from './DutySettings'
import { DutySigners } from './DutySigners'
import type { DutyCardData } from './types'

/** The design states these two literally; they are the only greens and browns
 *  in the app, the same pair the survey status pill uses. */
const READY = { background: '#E4F2E0', color: '#2F5D2A' }
const OPEN = { background: 'var(--sf2)', color: 'var(--mut)' }

const nb = (iso: string) =>
  new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * One statutory duty — HeiTuva.dc.html:932-1032.
 *
 * The card's primary action walks the same ladder the design does: no survey →
 * start one; answers coming in → follow them up; checklist incomplete → finish
 * the documentation; no report → make one; not signed → send for signing;
 * signed → publish. What differs is that each rung is a fact from the database
 * rather than a flag in component state, so the button cannot claim a step is
 * done when it is not.
 */
export async function DutyCard({
  card,
  members,
  canEdit,
  viewerMemberId,
}: {
  card: DutyCardData
  members: { id: string; name: string }[]
  canEdit: boolean
  viewerMemberId: string
}) {
  const t = await getTranslations('reports')
  const tNav = await getTranslations('surveyNav')

  const checks = card.checks
  const doneKeys = new Set((card.status?.checks ?? []).filter((c) => c.done).map((c) => c.key))
  const done = checks.filter((c) => doneKeys.has(c.key)).length
  const total = checks.length
  const pct = total ? Math.round((done / total) * 100) : 0
  const ready = total > 0 && done === total

  const signers = card.status?.signers ?? []
  const allSigned = signers.length > 0 && signers.every((s) => s.signed)
  const anyStale = signers.some((s) => s.stale)
  const published = (card.status?.versions ?? []).length > 0

  const statusLabel = published
    ? t('statusPublished')
    : ready
      ? t('statusReady')
      : done > 0
        ? t('statusInProgress')
        : t('statusMissing')

  const live = card.linked.find((s) => s.status === 'aktiv')

  // The ladder. Each branch is a question about stored state, in the design's
  // own order (HeiTuva.dc.html:3190-3201) — with one correction.
  //
  // The prototype tests "has a linked survey" FIRST, which is fine while the
  // duty is being worked and wrong once it is finished: a published
  // redegjørelse with an archive entry underneath it was telling the reader to
  // start a survey. A duty that is published and whose signatures still cover
  // the current content has no next step, so it gets none. The deadline line
  // below already says when it comes round again.
  const complete = published && !anyStale && ready
  const ladder = complete
    ? null
    : !card.linked.length
      ? { key: 'survey', label: t('primaryStartSurvey'), href: '/bibliotek?fane=maler' }
      : live && !ready
        ? { key: 'results', label: t('primaryFollowUp'), href: `/undersokelser/${live.id}/resultater` }
        : !ready
          ? { key: 'complete', label: t('primaryComplete'), href: null }
          : !card.hasReport
            ? { key: 'report', label: t('primaryMakeReport'), href: null }
            : !allSigned || anyStale
              ? { key: 'sign', label: t('primarySendToSigning'), href: null }
              : { key: 'publish', label: t('primaryPublish'), href: null }

  // A `leser` sees the state of every duty — that is the point of the role —
  // but is not told to do things they cannot do. Reading the results is theirs;
  // starting a survey, finishing the documentation, signing and publishing are
  // not, and offering "Start undersøkelse" to someone who lands on a Bibliotek
  // they cannot create from is a dead end wearing a call to action.
  const primary = ladder && (canEdit || ladder.key === 'results') ? ladder : null

  return (
    <section className="flex flex-col rounded-[18px] border border-line bg-sf p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-display text-[21px] font-medium leading-[1.25]">{card.title}</span>
          <span className="mt-[3px] block text-[12.5px] text-mut">{card.law}</span>
        </span>
        <span
          className="flex-none whitespace-nowrap rounded-full px-[13px] py-[6px] text-xs font-bold"
          style={ready || published ? READY : OPEN}
        >
          {statusLabel}
        </span>
      </div>

      <p className="mt-[10px] text-[13px] leading-[1.55] text-mut">{card.basis}</p>

      <div className="mt-[14px] flex items-center gap-3">
        <span className="block h-[9px] flex-1 overflow-hidden rounded-full bg-sf2">
          <span
            className="block h-full rounded-full"
            style={{ background: ready ? 'var(--ac2)' : 'var(--ac)', width: `${pct}%` }}
          />
        </span>
        <span className="whitespace-nowrap text-[12.5px] text-mut">
          {t('progress', { done, total })}
        </span>
      </div>

      <DutyChecklist
        definitionKey={card.definitionKey}
        checks={checks.map((c) => ({ ...c, done: doneKeys.has(c.key) }))}
        canEdit={canEdit}
      />

      <div className="mt-4 rounded-[13px] bg-bg px-4 py-[14px]">
        <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('linkedSurveys')}</div>
        {card.linked.length ? (
          <div className="mt-2 flex flex-col gap-[2px]">
            {card.linked.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-[11px] border-b border-line py-[9px]">
                <span
                  className="flex-none whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11.5px] font-bold"
                  style={s.status === 'aktiv' ? READY : OPEN}
                >
                  {tNav(
                    s.status === 'aktiv' ? 'statusAktiv' : s.status === 'lukket' ? 'statusLukket' : 'statusUtkast',
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{s.title}</span>
                </span>
                <Link
                  href={`/undersokelser/${s.id}/resultater`}
                  className="touch-44 flex-none whitespace-nowrap rounded-[9px] border border-line px-[13px] py-[7px] text-xs font-semibold text-ink no-underline"
                >
                  {t('linkedCta')}
                </Link>
              </div>
            ))}
          </div>
        ) : (
          /*
            The empty state is a ROW of the same shape, not a sentence
            (HeiTuva.dc.html:3172-3174): a "Mangler" chip, the title, the reason
            it matters, and a Start. Rendering it as a muted line lost the one
            thing the design uses this box for — telling a reader with no data
            what to do about it — and made the box look like a section that
            simply had nothing in it.
          */
          <div className="mt-2 flex flex-wrap items-center gap-[11px] py-[9px]">
            <span
              className="flex-none whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11.5px] font-bold"
              style={OPEN}
            >
              {t('statusMissing')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{t('noLinkedSurveys')}</span>
              <span className="mt-[1px] block text-[11.5px] text-mut">{t('noLinkedSurveysHint')}</span>
            </span>
            {canEdit ? (
              <Link
                href="/bibliotek?fane=maler"
                className="touch-44 flex-none whitespace-nowrap rounded-[9px] border border-line px-[13px] py-[7px] text-xs font-semibold text-ink no-underline"
              >
                {t('linkedStartCta')}
              </Link>
            ) : null}
          </div>
        )}

        <DutySettings
          definitionKey={card.definitionKey}
          members={members}
          canEdit={canEdit}
          ownerMemberId={card.duty?.ownerMemberId ?? null}
          intervalMonths={card.duty?.intervalMonths ?? null}
          reminderWeeks={card.duty?.reminderWeeks ?? 4}
          // NULL means "follow the law's default", so the toggle shows the
          // registry value until somebody sets it either way.
          publish={card.duty?.publish ?? card.registryPublish}
          labels={{
            open: t('settingsOpen'),
            close: t('settingsClose'),
            owner: t('owner'),
            nobody: t('ownerNobody'),
            cadence: t('cadence'),
            cadence6: t('cadence6'),
            cadence12: t('cadence12'),
            cadence24: t('cadence24'),
            reminder: t('reminderBefore'),
            reminder2: t('reminder2'),
            reminder4: t('reminder4'),
            reminder8: t('reminder8'),
            publish: t('publishPublicly'),
          }}
        />
      </div>

      <DutySigners
        definitionKey={card.definitionKey}
        roles={card.signerRoles}
        signers={signers}
        viewerMemberId={viewerMemberId}
        labels={{
          heading: t('signing'),
          signed: t('signed'),
          stale: t('signedStale'),
          waiting: t('waiting'),
          sign: t('signAction'),
        }}
      />

      {published ? (
        <div className="mt-[14px]">
          <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('archive')}</div>
          {(card.status?.versions ?? []).map((v) => (
            <div key={v.id} className="flex items-center gap-[10px] border-b border-line py-2">
              <span className="block h-2 w-2 flex-none rounded-full bg-ac2" />
              <span className="min-w-0 flex-1 text-[12.5px] font-semibold">{v.label}</span>
              <span className="whitespace-nowrap text-[11.5px] text-mut">
                {t('archivedAt', { date: nb(v.published_at) })}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-mut">
          {card.duty?.nextDueAt ? t('dueAt', { date: nb(card.duty.nextDueAt) }) : t('noDue')}
        </span>
        {primary === null ? null : primary.href ? (
          <Link
            href={primary.href}
            className="touch-44 cursor-pointer whitespace-nowrap rounded-[10px] bg-ac px-5 py-[11px] text-[13px] font-bold text-ink no-underline"
          >
            {primary.label}
          </Link>
        ) : (
          // The remaining rungs are handled by the controls above — the
          // checklist, the signer buttons, and (next slice) the report editor.
          // A button that repeats one of them would be a second way to reach
          // the same state, and a second place for it to disagree.
          <span className="whitespace-nowrap rounded-[10px] bg-sbg px-5 py-[11px] text-[13px] font-bold">
            {primary.label}
          </span>
        )}
      </div>
    </section>
  )
}
