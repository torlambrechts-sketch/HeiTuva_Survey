'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'
import {
  ANONYMITY_KEY,
  ANONYMITY_MODES,
  CADENCES,
  CADENCE_DAYS,
  CADENCE_KEY,
  CHANNELS,
  CHANNEL_KEY,
  PARSED_SOURCES,
  looksLikeXlsx,
  IMPORT_KEY,
  IMPORT_SOURCES,
  REMINDER_DAYS,
  RUN_COUNTS,
  type AnonymityMode,
  type Cadence,
  type Channel,
  type ImportSource,
} from '@/lib/send/registry'
import { policyWarnings } from '@/lib/questions/policy-warnings'
import {
  hasScheduleStatus,
  scheduleStatus,
  type ScheduleState,
} from '@/lib/schedules/status'
import {
  CustomCadence,
  customDays,
  customIntervalPhrase,
  type CustomCadenceValue,
} from './CustomCadence'
import { parseRecipients, type ImportedRecipient } from '@/lib/send/import'
import { sendSurvey, sendTestToSelf, setSchedulePaused, stopSchedule } from './actions'

const CARD = 'rounded-2xl border border-line bg-sf p-[22px]'
const H2 = 'font-display text-[23px] font-bold'

/** The design's default: a round closes after a week (HeiTuva.dc.html:1918). */
const CLOSES_IN_DAYS = 7

type Group = { id: string; name: string; count: number }

export function SendScreen({
  personsCap,
  surveyId,
  title,
  anonymity: initialAnonymity,
  kThreshold,
  respondentKind,
  lockedReason,
  questionCount,
  alreadyOpen,
  canSend,
  smsEnabled,
  syncSources,
  suppressed,
  orgName,
  groups,
  inheritedCadence,
  inheritedLegalRef,
  schedule: scheduleState,
  status,
}: {
  /* W3 · Q122 — the workspace's word for the person who answers. A plain
     string prop rather than a read here: this is a client component and the
     workspace resolves at SERVER render, because the choice is a cookie. One
     form, not the whole vocabulary, so the call site states which the screen
     needs rather than leaving a reader to guess. */
  personsCap: string
  surveyId: string
  /** V2-3b · Q60. Lower-cased addresses on the organisation's Reservasjonsliste.
   *  The DATABASE is what actually refuses these (`M:0060`); this is so the
   *  person importing can SEE it, rather than reading «150 mottakere» and having
   *  149 receive mail. CLAUDE.md's never-fabricate rule applied to a count. */
  suppressed: string[]
  title: string
  /** For the SMS preview — the design's "{{ orgName }} spør: …". */
  orgName: string
  anonymity: AnonymityMode
  /** Q17: the promise the survey makes — shown in «Klar til å sendes» (brief §3). */
  kThreshold: number
  respondentKind: 'person' | 'organisation'
  /** Set when the policy is frozen (statutory pack, or answers exist): the
   *  anonymity chips are disabled and this line says why (brief §1 copy). */
  lockedReason: string | null
  questionCount: number
  alreadyOpen: boolean
  canSend: boolean
  smsEnabled: boolean
  /** Q62: the sync sources this organisation's `feature_flags` rows enable.
   *  Resolved on the server — a client constant is not a gate (D110). */
  syncSources: readonly ImportSource[]
  groups: Group[]
  /**
   * Q21 — the pack's cadence PRE-FILLS the picker and explains itself; it does
   * not lock it. Åpenhetsloven's 30 June is a reporting deadline, not a
   * survey-frequency rule, so locking here would be the product inventing a
   * legal constraint — and a customer cannot tell an invented one from a real
   * one. Null when no pack governs the survey.
   */
  inheritedCadence: Cadence | null
  /** The pack's legal reference, for the explanatory note. */
  inheritedLegalRef: string | null
  /** The live series, or null. Read through RLS — a leser sees it too (Q23). */
  schedule: ScheduleState | null
  /** Whether the survey has been sent, so the status row knows what to draw. */
  status: 'utkast' | 'aktiv' | 'lukket'
}) {
  const t = useTranslations('send')

  const [channels, setChannels] = useState<Channel[]>(['email'])
  const [recipients, setRecipients] = useState<ImportedRecipient[]>([])
  const [emailDraft, setEmailDraft] = useState('')
  const [chosenGroups, setChosenGroups] = useState<string[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [importSource, setImportSource] = useState<ImportSource>('paste')
  const [importError, setImportError] = useState<string | null>(null)
  const [importDraft, setImportDraft] = useState('')
  const [anonymity, setAnonymity] = useState<AnonymityMode>(initialAnonymity)
  // The live series first, then the pack's default, then «Én gang». A survey
  // already running weekly whose picker opened on «Én gang» would be converted
  // to a one-off by a re-send that changed nothing else — the control would
  // have been lying about the current state, which is worse than defaulting
  // badly.
  const [cadence, setCadence] = useState<Cadence>(
    scheduleState?.active && scheduleState.cadence !== 'once'
      ? scheduleState.cadence
      : (inheritedCadence ?? 'once'),
  )
  const [runs, setRuns] = useState(4)
  const [rotate, setRotate] = useState(false)
  // Q20's custom cadence. The defaults are the bundle's opening state (:3260):
  // every week, Monday, 09:00 — a shape a customer can send without touching
  // anything, rather than a blank the CHECK would refuse.
  const [custom, setCustom] = useState<CustomCadenceValue>({
    every: 1, unit: 'weeks', weekday: 1, hour: '09:00',
  })
  const [reminderDays, setReminderDays] = useState<(typeof REMINDER_DAYS)[number]>(2)
  const [testSent, setTestSent] = useState(false)
  const [sent, setSent] = useState<{ invited: number; shareToken: string | null } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const parsed = useMemo(() => parseRecipients(importDraft), [importDraft])

  /**
   * V2-3b — the import preview, split by the Reservasjonsliste (V2:4982, :4993).
   *
   * The bundle badges a suppressed row «Reservert» and leaves it out of the
   * count, and both halves matter: `send_round` will refuse these addresses
   * whatever the screen says, so a preview that counted them would be promising
   * a send the database is going to decline.
   */
  const suppressedSet = useMemo(
    () => new Set(suppressed.map((e) => e.toLowerCase())),
    [suppressed],
  )
  const importSplit = useMemo(() => {
    const blocked = parsed.rows.filter((r) => r.email && suppressedSet.has(r.email.toLowerCase()))
    return {
      reachable: parsed.rows.filter((r) => !r.email || !suppressedSet.has(r.email.toLowerCase())),
      blocked,
    }
  }, [parsed.rows, suppressedSet])

  // The status sentence, from `lib/schedules/status.ts` — the same function the
  // survey row, the context bar and the rounds panel read, so the four cannot
  // disagree about what a paused series says.
  const recurStatus = scheduleStatus(
    scheduleState,
    status,
    (c) => t(CADENCE_KEY[c].label as 'cadOnce').toLowerCase(),
    (iso) => new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }),
  )

  const groupHeads = chosenGroups.reduce(
    (n, id) => n + (groups.find((g) => g.id === id)?.count ?? 0),
    0,
  )
  const reach = recipients.length + groupHeads

  /*
    D94's second home. The Builder's warning reads `surveys.target`, which
    migration 0039 keeps equal to the LATEST round's recipient count — but that
    is the count of the round that has ALREADY been sent. Here the number is
    the one being chosen right now, before anyone is invited, which is the last
    moment where changing it costs nothing.

    Same function as the Builder's panel and the Builder's readiness check, so
    the three cannot disagree about what the rule is. Questions and rules are
    empty deliberately: rule 2 is about question WORDING and belongs where the
    wording can be fixed, and this screen has no editor.
  */
  const reachWarnings = policyWarnings(
    { respondentKind, anonymity, kThreshold, target: reach },
    [],
    [],
    ({ target, k }) => t('reachBelowThreshold', { target, k }),
  )

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value]

  /** One person is one address or one phone — the parser guarantees at least
   *  one of them, and this is what chips, de-duplication and removal key on. */
  const identity = (r: ImportedRecipient) => r.email ?? r.phone ?? ''

  const merge = (incoming: ImportedRecipient[]) =>
    setRecipients((r) => [
      ...r,
      ...incoming.filter((n) => !r.some((x) => identity(x) === identity(n))),
    ])

  const addEmail = () => {
    // The single field takes an address or a number; a bare number has no
    // header to say which column it is, so it is given one.
    const draft = emailDraft.trim()
    const { rows } = parseRecipients(/^[+0-9][0-9 \-]{6,}$/.test(draft) ? `mobil\n${draft}` : draft)
    if (!rows.length) return
    merge(rows)
    setEmailDraft('')
  }

  const runImport = () => {
    // Only the reachable half. Adding the others would put a name in the
    // recipient list that the send is then going to drop in silence.
    merge(importSplit.reachable)
    setImportDraft('')
    setImportOpen(false)
  }

  const send = () => {
    setFailure(null)
    startTransition(async () => {
      const result = await sendSurvey({
        surveyId,
        channels,
        recipients: recipients.map((r) => ({
          ...(r.email ? { email: r.email } : {}),
          ...(r.phone ? { phone: r.phone } : {}),
          ...(r.name ? { name: r.name } : {}),
        })),
        groupIds: chosenGroups,
        anonymity,
        cadence,
        // All three or none — `schedules_custom_shape` refuses a partial set,
        // and storing them on a non-custom cadence would leave settings that
        // become live the moment someone switches the cadence to custom.
        ...(cadence === 'custom'
          ? {
              customEvery: custom.every,
              customUnit: custom.unit,
              customWeekday: custom.weekday,
              sendAtLocal: custom.hour,
            }
          : {}),
        runs: cadence === 'once' ? 1 : runs,
        reminderDays,
        rotate,
        closesInDays: CLOSES_IN_DAYS,
      })
      if (result.ok) setSent({ invited: result.invited, shareToken: result.shareToken })
      else setFailure(result.error)
    })
  }

  /* ---- after sending ---------------------------------------------------- */
  if (sent) {
    const shareUrl = sent.shareToken
      ? `${typeof window === 'undefined' ? '' : window.location.origin}/s/${sent.shareToken}`
      : null
    return (
      <main className="animate-enter mx-auto max-w-[620px] pt-10 text-center">
        <div className={`${CARD} p-[38px]`}>
          <div className="mx-auto h-12 w-12 rounded-full bg-ac" />
          <h1 className="mt-[18px] font-display text-[33px] font-bold">
            {t('sentTitle', { count: sent.invited })}
          </h1>
          <p className="mt-1.5 text-sm text-mut">
            {t('sentMeta', { title, anonymity: t(`anonShort${cap(anonymity)}` as 'anonShortNamed') })}
          </p>
          {shareUrl ? (
            <p className="mt-5 break-all rounded-[10px] border border-dashed border-line px-[15px] py-[13px] font-mono text-[13px] text-mut">
              {shareUrl}
            </p>
          ) : null}
          <div className="mt-[22px] flex flex-wrap justify-center gap-2.5">
            <Link
              href={`/undersokelser/${surveyId}/resultater`}
              className="touch-44 cursor-pointer rounded-[10px] border border-line bg-transparent px-[22px] py-[13px] text-sm font-semibold text-ink no-underline"
            >
              {t('seeLive')}
            </Link>
          </div>
        </div>
      </main>
    )
  }

  /* ---- the screen ------------------------------------------------------- */
  return (
    <main className="animate-enter pt-[28px]">
      {!canSend ? (
        <p className="mb-3 rounded-[12px] bg-sbg px-4 py-[13px] text-[12.5px]">{t('readOnly')}</p>
      ) : null}
      {questionCount === 0 ? (
        <p className="mb-3 rounded-[12px] bg-ac3 px-4 py-[13px] text-[12.5px]">{t('noQuestions')}</p>
      ) : null}
      {alreadyOpen ? (
        <p className="mb-3 rounded-[12px] bg-sbg px-4 py-[13px] text-[12.5px]">{t('alreadySent')}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-[14px] xl:grid-cols-[1.35fr_1fr]">
        {/* left column ---------------------------------------------------- */}
        <div className="flex flex-col gap-[14px]">
          <section className={CARD}>
            <h2 className={H2}>{t('title')}</h2>
            <div className="mt-3.5 grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {CHANNELS.map((c) => {
                const available = c !== 'sms' || smsEnabled
                const on = channels.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    disabled={!available || !canSend}
                    onClick={() => setChannels((list) => toggle(list, c))}
                    className="touch-44 flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-[15px] py-3.5 text-left text-ink disabled:opacity-60"
                    style={{
                      borderColor: on ? 'var(--ink)' : 'var(--line)',
                      background: on ? 'var(--sbg)' : 'var(--sf)',
                    }}
                  >
                    <span>
                      <span className="block text-sm font-semibold">{t(CHANNEL_KEY[c].label as 'chEmail')}</span>
                      <span className="mt-0.5 block text-[13px] text-mut">
                        {available ? t(CHANNEL_KEY[c].desc as 'chEmailDesc') : t('chComingSoon')}
                      </span>
                    </span>
                    <span
                      className="flex h-5 w-5 flex-none items-center justify-center rounded-full border-[1.5px] text-[11px] font-bold"
                      style={{
                        borderColor: on ? 'var(--ink)' : 'var(--line)',
                        background: on ? 'var(--ink)' : 'transparent',
                        color: on ? 'var(--sf)' : 'transparent',
                      }}
                    >
                      {on ? '✓' : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {channels.includes('email') || channels.includes('sms') ? (
            <section className={CARD}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className={H2}>{t('recipients', { personsCap })}</h2>
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={() => setImportOpen((o) => !o)}
                  aria-expanded={importOpen}
                  className="touch-44 cursor-pointer rounded-[10px] border border-line bg-sbg px-[17px] py-2.5 text-[12.5px] font-semibold text-ink disabled:opacity-60"
                >
                  {t('importButton')}
                </button>
              </div>

              {importOpen ? (
                <div className="mt-3.5 rounded-[14px] border border-dashed border-line bg-bg p-[18px]">
                  <div className="grid grid-cols-1 gap-[9px] sm:grid-cols-2 lg:grid-cols-3">
                    {IMPORT_SOURCES.map((s) => {
                      const on = importSource === s
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setImportSource(s)}
                          className="touch-44 cursor-pointer rounded-[11px] border px-[13px] py-3 text-left text-ink"
                          style={{
                            borderColor: on ? 'var(--ink)' : 'var(--line)',
                            background: on ? 'var(--sbg)' : 'var(--sf)',
                          }}
                        >
                          <span className="block text-[13px] font-semibold">
                            {t(IMPORT_KEY[s].label as 'impCsv')}
                          </span>
                          <span className="mt-0.5 block text-[13px] leading-[1.35] text-mut">
                            {t(IMPORT_KEY[s].desc as 'impCsvDesc')}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {[...PARSED_SOURCES, ...syncSources].includes(importSource) ? (
                    <div className="mt-3.5">
                      <p className="text-[13px] text-mut">
                        {importSource === 'csv'
                          ? t('impHintCsv')
                          : importSource === 'excel'
                            ? t('impHintExcel')
                            : t('impHintPaste')}
                      </p>
                      {importSource !== 'paste' ? (
                        <input
                          type="file"
                          accept={importSource === 'csv' ? '.csv,text/csv' : '.csv,.tsv,text/csv'}
                          aria-label={t('impChooseFile')}
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            e.target.value = ''
                            if (!file) return
                            // DECISIONS Q62 — REFUSE a workbook rather than
                            // reading it as text. `parseRecipients` takes a
                            // string, so a real .xlsx becomes garbage rows
                            // SILENTLY, under a label promising «Vi leser
                            // første ark». The check is on the bytes, not the
                            // name: a workbook saved as `.csv` fails a name
                            // test and still is not text, and that is exactly
                            // the file a confused user produces.
                            const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
                            if (looksLikeXlsx(head)) {
                              setImportError(t('impXlsxRefused'))
                              return
                            }
                            setImportError(null)
                            setImportDraft(await file.text())
                          }}
                          className="mt-2.5 block w-full text-[13px]"
                        />
                      ) : null}
                      {importError ? (
                        <p
                          role="alert"
                          className="mt-2.5 rounded-[10px] px-[14px] py-3 text-[12.5px] leading-[1.55] font-semibold text-ink"
                          style={{ background: 'var(--ac3)' }}
                        >
                          {importError}
                        </p>
                      ) : null}
                      <textarea
                        rows={5}
                        value={importDraft}
                        onChange={(e) => setImportDraft(e.target.value)}
                        placeholder={t('impPlaceholder')}
                        aria-label={t('impPaste')}
                        className="mt-[9px] w-full resize-y rounded-[11px] border border-line bg-sf px-[15px] py-[13px] font-mono text-[12.5px] leading-[1.55] text-ink outline-none"
                      />
                      <div className="mt-[13px] flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[13px] text-mut">
                          {importDraft.trim()
                            ? t('impSummary', {
                                ok: importSplit.reachable.length,
                                rejected: parsed.rejected.length,
                              })
                            : t('impNone')}
                          {importSplit.blocked.length ? (
                            <span
                              className="ml-2 rounded-full px-[11px] py-[5px] text-[11px] font-bold text-ink"
                              style={{ background: 'var(--ac3)' }}
                            >
                              {t('impSuppressed', { count: importSplit.blocked.length })}
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          disabled={!importSplit.reachable.length}
                          onClick={runImport}
                          className="touch-44 cursor-pointer rounded-[10px] border-none bg-ac px-[18px] py-2.5 text-[12.5px] font-semibold text-ink disabled:opacity-50"
                        >
                          {t('impRun')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3.5">
                      <p className="max-w-[460px] text-[13.5px] leading-relaxed text-mut">
                        {t('impSyncNote')}
                      </p>
                      <p className="mt-3 rounded-[10px] bg-sbg px-3.5 py-2.5 text-[12.5px]">
                        {t('impSyncComing')}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="mt-3.5 flex flex-col gap-2.5 sm:flex-row">
                <input
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addEmail()
                    }
                  }}
                  disabled={!canSend}
                  placeholder={channels.includes('sms') ? t('recipientPlaceholder') : t('emailPlaceholder')}
                  aria-label={channels.includes('sms') ? t('recipientPlaceholder') : t('emailPlaceholder')}
                  className="touch-44-field flex-1 rounded-[10px] border border-line bg-bg px-3.5 py-3 text-[13.5px] text-ink outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={addEmail}
                  className="touch-44 cursor-pointer rounded-[10px] border border-line bg-transparent px-5 py-3 text-[13.5px] font-semibold text-ink disabled:opacity-60"
                >
                  {t('addRecipient')}
                </button>
              </div>

              {recipients.length ? (
                <div className="mt-[13px] flex flex-wrap gap-2">
                  {recipients.map((r) => (
                    <span
                      key={identity(r)}
                      className="inline-flex items-center gap-[9px] rounded-full px-3 py-[7px] text-[12.5px]"
                      style={{ background: 'var(--sf2)' }}
                    >
                      {identity(r)}
                      <button
                        type="button"
                        aria-label={`${t('removeRecipient')}: ${identity(r)}`}
                        onClick={() => setRecipients((list) => list.filter((x) => identity(x) !== identity(r)))}
                        className="touch-44 cursor-pointer border-none bg-transparent text-sm leading-none text-mut"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              {groups.length ? (
                <>
                  <div className="my-5 h-px" style={{ background: 'var(--line)' }} />
                  <div className="text-[11px] uppercase tracking-[.1em] text-mut">{t('orGroups')}</div>
                  <div className="mt-[11px] grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {groups.map((g) => {
                      const on = chosenGroups.includes(g.id)
                      return (
                        <button
                          key={g.id}
                          type="button"
                          aria-pressed={on}
                          disabled={!canSend}
                          onClick={() => setChosenGroups((list) => toggle(list, g.id))}
                          className="touch-44 flex cursor-pointer items-center justify-between gap-2.5 rounded-xl border px-[15px] py-[13px] text-left text-ink disabled:opacity-60"
                          style={{
                            borderColor: on ? 'var(--ink)' : 'var(--line)',
                            background: on ? 'var(--sbg)' : 'var(--sf)',
                          }}
                        >
                          <span>
                            <span className="block text-sm font-semibold">{g.name}</span>
                            <span className="mt-0.5 block text-[13px] text-mut">
                              {t('groupCount', { count: g.count })}
                            </span>
                          </span>
                          <span
                            className="flex h-[19px] w-[19px] flex-none items-center justify-center rounded-md border-[1.5px] text-[11px] font-bold"
                            style={{
                              borderColor: on ? 'var(--ink)' : 'var(--line)',
                              background: on ? 'var(--ink)' : 'transparent',
                              color: on ? 'var(--sf)' : 'transparent',
                            }}
                          >
                            {on ? '✓' : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {channels.includes('link') || channels.includes('qr') ? (
            <section className={CARD}>
              <h2 className={H2}>{channels.includes('link') ? t('shareTitle') : t('qrTitle')}</h2>
              {/* The link does not exist until the round does: it is a token,
                  and minting one before the user commits would leave live URLs
                  behind every abandoned visit to this screen. */}
              <p className="mt-3.5 rounded-[10px] border border-dashed border-line bg-bg px-[15px] py-3 text-[13px] text-mut">
                {t('shareNotYet')}
              </p>
              <p className="mt-2.5 text-[13px] text-mut">
                {channels.includes('link') ? t('shareNote') : t('qrNote')}
              </p>
            </section>
          ) : null}

          {channels.includes('sms') ? (
            // HeiTuva.dc.html:1810-1816 — the SMS card: title, one line of
            // description, and the message as the phone will show it.
            <section className={CARD}>
              <h2 className={H2}>{t('smsTitle')}</h2>
              <p className="mt-1.5 text-[13.5px] text-mut">{t('smsDesc')}</p>
              <p className="mt-3.5 max-w-[380px] rounded-xl bg-sbg px-4 py-3.5 text-[13px] leading-[1.5]">
                {t('smsPreview', {
                  org: orgName,
                  title,
                  anon: anonymity === 'named' ? t('smsNamed') : t('smsAnonymous'),
                  // The link does not exist until the round does, same as the
                  // share card above: a placeholder shape, never a live URL.
                  link: t('smsLinkPlaceholder'),
                })}
              </p>
              <p className="mt-2.5 text-[13px] text-mut">{t('smsNote')}</p>
            </section>
          ) : null}
        </div>

        {/* right column --------------------------------------------------- */}
        <div className="flex flex-col gap-[14px]">
          <section className={CARD}>
            <h2 className={H2}>{t('cadence')}</h2>
            <div className="mt-3.5 flex flex-col gap-2">
              {CADENCES.map((c) => (
                <Radio
                  key={c}
                  on={cadence === c}
                  disabled={!canSend}
                  label={t(CADENCE_KEY[c].label as 'cadOnce')}
                  desc={t(CADENCE_KEY[c].desc as 'cadOnceDesc')}
                  onPick={() => setCadence(c)}
                />
              ))}
            </div>

            {/* Q21 — the pack pre-filled this, and says so. An explanatory
                note, NOT a lock: the picker above stays live. The padlock icon
                is the bundle's (:2167); it marks provenance here rather than a
                refusal, which is why the sentence ends «Du kan endre den.» */}
            {inheritedCadence && inheritedLegalRef ? (
              <div
                className="mt-3 flex items-start gap-[9px] rounded-[10px] px-3 py-2.5 text-[12.5px] leading-[1.5] text-mut"
                style={{ background: 'var(--sf2)' }}
              >
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" aria-hidden="true" className="mt-[2px] flex-none"
                >
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <span>
                  {t('recurInheritNote', {
                    legalRef: inheritedLegalRef,
                    cadence: t(CADENCE_KEY[inheritedCadence].label as 'cadOnce').toLowerCase(),
                  })}
                </span>
              </div>
            ) : null}

            {/* The status row (:2173-2181) is about the series that ALREADY
                exists, and the picker below is about the next send. Nesting the
                first inside the second hid the Pause control on exactly the
                surveys that have something to pause — a live weekly series whose
                picker happened to be sitting on «Én gang». Seen in the first
                capture; they are siblings now, not parent and child. */}
            {status !== 'utkast' && scheduleState && hasScheduleStatus(recurStatus) ? (
              <div className="mt-3.5 rounded-[13px] border border-line bg-bg p-[15px]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[13.5px] font-semibold">
                      ↻ {t(recurStatus.key, ('values' in recurStatus ? recurStatus.values : {}) as never)}
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        disabled={!canSend || pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await setSchedulePaused(surveyId, !scheduleState.pausedAt)
                            if (!r.ok) setFailure(r.error)
                          })
                        }
                        className="touch-44 cursor-pointer rounded-[9px] border border-line bg-transparent px-3.5 py-2 text-[12.5px] font-semibold text-ink disabled:opacity-60"
                      >
                        {scheduleState.pausedAt ? t('recurResume') : t('recurPause')}
                      </button>
                      <button
                        type="button"
                        disabled={!canSend || pending}
                        onClick={() => {
                          // Stop is not reversible from the UI (Q22), so it is
                          // the one recurrence control that asks. Pause does
                          // not: it undoes itself with the same button.
                          if (!window.confirm(t('recurStopConfirm'))) return
                          startTransition(async () => {
                            const r = await stopSchedule(surveyId)
                            if (!r.ok) setFailure(r.error)
                          })
                        }}
                        className="touch-44 cursor-pointer rounded-[9px] border border-line bg-transparent px-3.5 py-2 text-[12.5px] font-semibold text-mut disabled:opacity-60"
                      >
                        {t('recurStop')}
                      </button>
                    </span>
                </div>
              </div>
            ) : null}

            {cadence !== 'once' ? (
              <div className="mt-3.5 rounded-[13px] border border-line bg-bg p-[15px]">
                {cadence === 'custom' ? (
                  <CustomCadence value={custom} disabled={!canSend} onChange={setCustom} />
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13.5px] font-semibold">{t('runs')}</span>
                  <select
                    value={runs}
                    onChange={(e) => setRuns(Number(e.target.value))}
                    aria-label={t('runs')}
                    className="touch-44-field rounded-[10px] border border-line bg-sf px-3 py-[9px] text-[13px] text-ink outline-none"
                  >
                    {RUN_COUNTS.map((n) => (
                      <option key={n} value={n}>
                        {n === 0 ? t('runsUntilStopped') : t('runsN', { count: n })}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-[13px] flex items-center gap-3.5">
                  <span className="flex-1">
                    <span className="block text-[13.5px] font-semibold">{t('rotate')}</span>
                    <span className="mt-0.5 block text-[13px] text-mut">
                      {rotate
                        ? t('rotateOn', { count: Math.min(3, questionCount) })
                        : t('rotateOff')}
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rotate}
                    aria-label={t('rotate')}
                    disabled={!canSend}
                    onClick={() => setRotate((r) => !r)}
                    className="touch-44 flex h-[26px] w-[46px] flex-none cursor-pointer rounded-full border-none p-[3px] disabled:opacity-60"
                    style={{
                      background: rotate ? 'var(--ac)' : 'var(--sf2)',
                      justifyContent: rotate ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <span className="block h-5 w-5 rounded-full bg-white" />
                  </button>
                </div>
                <div className="mt-3.5 flex flex-wrap gap-[7px]">
                  {Array.from({ length: Math.min(4, runs || 4) }, (_, i) => {
                    // A custom cadence's spacing is the customer's own, not the
                    // registry's 0 for `custom`.
                    const step = cadence === 'custom' ? customDays(custom) : CADENCE_DAYS[cadence]
                    const when = new Date(Date.now() + step * (i + 1) * 86_400_000)
                    return (
                      <span
                        key={i}
                        className="rounded-full px-3 py-[7px] text-[12.5px]"
                        style={{ background: i === 0 ? 'var(--ac)' : 'var(--sf2)' }}
                      >
                        {when.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                      </span>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <p className="mt-3 text-[13px] leading-[1.55] text-mut">
              {cadence === 'once'
                ? t('cadenceSummaryOnce')
                : t('cadenceSummary', {
                    // A custom cadence's word is its INTERVAL, not the chip's
                    // label: the bundle's summary reads «Går automatisk hver 3.
                    // uke …» (`cadOf(rec).label`, :3265), and mine read «Går
                    // automatisk tilpasset …», which says nothing about how
                    // often anything happens. Caught in the first capture.
                    cadence:
                      cadence === 'custom'
                        ? customIntervalPhrase(custom, t)
                        : t(CADENCE_KEY[cadence].label as 'cadOnce').toLowerCase(),
                    runs,
                  })}
            </p>

            <div className="my-5 h-px" style={{ background: 'var(--line)' }} />

            <h2 className={H2}>{t('delivery')}</h2>
            {/* The v1 bundle moves this ABOVE the radios and gives it a `--sf2`
                box with a padlock (NEW:2227-2232). The order is the point: a
                reader who meets the reason first understands why the controls
                below are inert, where one who meets it after has already tried
                to press them. Same sentence as before — Q17's, from Phase 9. */}
            {lockedReason ? (
              <div
                className="mt-3 flex items-start gap-[9px] rounded-[10px] px-3 py-[10px]"
                style={{ background: 'var(--sf2)' }}
              >
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" aria-hidden="true" className="mt-[2px] flex-none text-mut"
                >
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <span className="text-[12.5px] leading-[1.5] text-mut">{lockedReason}</span>
              </div>
            ) : null}
            <div className="mt-3.5 flex flex-col gap-2">
              {ANONYMITY_MODES.map((a) => (
                <Radio
                  key={a}
                  on={anonymity === a}
                  disabled={!canSend || lockedReason !== null}
                  label={t(ANONYMITY_KEY[a].label as 'anonAnonymous')}
                  desc={t(ANONYMITY_KEY[a].desc as 'anonAnonymousDesc')}
                  onPick={() => setAnonymity(a)}
                />
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-sm">{t('reminder')}</span>
              <select
                value={reminderDays}
                onChange={(e) =>
                  setReminderDays(Number(e.target.value) as (typeof REMINDER_DAYS)[number])
                }
                aria-label={t('reminder')}
                className="touch-44-field rounded-[10px] border border-line bg-bg px-[11px] py-[9px] text-[13px] text-ink outline-none"
              >
                {REMINDER_DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d === 0 ? t('reminderNone') : t('reminderAfter', { days: d })}
                  </option>
                ))}
              </select>
            </div>

            <p className="mt-3 rounded-[10px] bg-sbg px-[13px] py-2.5 text-[12.5px] leading-[1.45]">
              {t('bestTime')}
            </p>

            <button
              type="button"
              disabled={!canSend || pending || questionCount === 0}
              onClick={() =>
                startTransition(async () => {
                  const r = await sendTestToSelf(surveyId)
                  if (r.ok) setTestSent(true)
                  else setFailure(r.error)
                })
              }
              className="touch-44 mt-3 w-full cursor-pointer rounded-[10px] border border-dashed border-line bg-transparent p-[11px] text-[13px] font-semibold text-ink disabled:opacity-60"
            >
              {testSent ? t('testSent') : t('sendTest')}
            </button>
          </section>

          <section className="rounded-2xl bg-ac p-[22px] text-ink">
            <div className="text-[11px] uppercase tracking-[.1em] opacity-75">{t('readyLabel')}</div>
            <div className="mt-1.5 font-display text-[31px] font-bold leading-[1.1]">
              {t('readyCount', { count: reach })}
            </div>
            <div className="mt-1 text-[12.5px] opacity-80">{title}</div>
            <div className="mt-0.5 text-xs opacity-70">
              {t('channelSummary', {
                channels: channels.length,
                anonymity: t(`anonShort${cap(anonymity)}` as 'anonShortNamed'),
              })}
            </div>
            {/* The promise, said out loud on the last screen before sending
                (design brief §3): «Anonyme svar · resultater vises fra 5 svar»
                or «Navngitte svar · attribuert til virksomhet». */}
            <div className="mt-0.5 text-xs opacity-70">
              {respondentKind === 'organisation'
                ? t('policyOrganisation')
                : anonymity === 'named'
                  ? t('policyNamed')
                  : anonymity === 'optional'
                    ? t('policyOptional', { k: kThreshold })
                    : t('policyAnonymous', { k: kThreshold })}
            </div>
            {reachWarnings.map((w) => (
              // Same chrome as the failure block below — the card already has a
              // treatment for "a sentence you must read before pressing send",
              // and a second one would be a new pattern for the same job.
              <p key={w.key} className="mt-3 rounded-[10px] bg-sf px-3.5 py-2.5 text-[12.5px] leading-normal">
                {w.text}
              </p>
            ))}
            {failure ? (
              <p role="alert" className="mt-3 rounded-[10px] bg-sf px-3.5 py-2.5 text-[12.5px]">
                {failure === 'no_recipients'
                  ? t('noRecipients')
                  : failure === 'no_questions'
                    ? t('noQuestions')
                    : failure === 'sms_not_enabled'
                      ? t('errSmsNotEnabled')
                      : t('failed')}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!canSend || pending || questionCount === 0}
              onClick={send}
              className="touch-44 mt-[18px] w-full cursor-pointer rounded-[10px] border-none p-3.5 text-sm font-bold disabled:opacity-60"
              style={{ background: 'var(--acf)', color: 'var(--ac)' }}
            >
              {t('sendButton')}
            </button>
          </section>
        </div>
      </div>
    </main>
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** The design's radio row, used by both Hyppighet and Levering. */
function Radio({
  on,
  disabled,
  label,
  desc,
  onPick,
}: {
  on: boolean
  disabled: boolean
  label: string
  desc: string
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onPick}
      className="touch-44 flex cursor-pointer items-start gap-[11px] rounded-xl border px-3.5 py-3 text-left text-ink disabled:opacity-60"
      style={{
        borderColor: on ? 'var(--ink)' : 'var(--line)',
        background: on ? 'var(--sbg)' : 'var(--sf)',
      }}
    >
      <span
        className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border-[1.5px]"
        style={{ borderColor: on ? 'var(--ink)' : 'var(--line)' }}
      >
        <span
          className="block h-2 w-2 rounded-full"
          style={{ background: on ? 'var(--ink)' : 'transparent' }}
        />
      </span>
      <span>
        <span className="block text-[13.5px] font-semibold">{label}</span>
        <span className="mt-0.5 block text-[13px] text-mut">{desc}</span>
      </span>
    </button>
  )
}
