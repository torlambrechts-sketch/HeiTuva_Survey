# 03 — EFFICIENCY

**91 surviving findings from seven probes (C1a, C1b, C2, C3, C4, C6a, C6b), each adversarially
re-checked.** Read `00-method.md` for the evidence tiers.

Severity after triage: **13 MAJOR · 37 MINOR · 26 LIMITATION · 15 CLEAN.** One claim was refuted.

**Two rules governed this part and both bit.** *Measure, do not reason* — so C3 reports structural
claims only and no memoisation is recommended on an unmeasured basis. And *do not report the
zero-row plans* — C2 was re-run after the database was seeded, and what survives is the half that
does not depend on row counts at all.

---

## 3.1 C4 — the bundle, measured by an A/B build

The production build was run, and then run again in a throwaway copy of the repository with
`instrumentation-client.ts` deleted. Nothing else differed; both exited 0.

```
with instrumentation-client.ts : shared First Load JS = 184 kB
without it                     : shared First Load JS = 102 kB
delta across all 37 routes     : 80–82 kB, mean 81.2 kB
middleware                     : 147 kB in BOTH -> the cost is purely the browser bundle
```

**`C4-1` · MAJOR · BITES YES — 81 kB of Sentry ships to every visitor and may never initialise.**
`Sentry.init` is guarded by `if (enabled)` (`instrumentation-client.ts:4`), and `enabled`
(`sentry.config.ts:57`) is true only for a `*.ingest.de.sentry.io` DSN. But line 16 is
`export const onRouterTransitionStart = Sentry.captureRouterTransitionStart` — an unconditional
live reference — so the guard removes the *call*, not the *module*. Whether a DSN is configured on
Vercel could not be checked from here; **the cost is unconditional either way.**

**`C4-2` · MAJOR · BITES YES — 57.1% of the respondent page's bytes are admin strings it cannot
render.** `/s/[token]` is the heaviest route in the product at **227 kB** — the mobile-first
surface CLAUDE.md holds to 380–420px. Without Sentry it would be 145 kB.

**`C4-4` · LIMITATION — a static legal document costs 186 kB of JavaScript.** `/personvern`'s own
Size is 175 B. Nothing this app serves costs less than 184 kB.

**`C4-7` · LIMITATION — nothing in the 22-script apparatus measures bundle size or page weight.**
Eleven phases have shipped and no gate would have noticed any of the above.

**`C4-8` · LIMITATION — 78 MB of browser binary sits in production dependencies** for one route
(`playwright-core` + `@sparticuz/chromium`, for the PDF export).

---

## 3.2 C2 — RPC cost, re-done after seeding, structural only

The probes ran against an empty database (`00-method.md` § 0.2). After seeding —
**2 orgs · 6 surveys · 22 responses · 53 answers** — the section was re-run. **These are not
production volumes**, and no timing claim below rests on them.

**The structural finding, which is scale-independent.** `app.aggregate_rows` is the only function
in the database that loops over `survey_questions`, and inside the loop it issues **three separate
traversals** of the responses-joined-answers set per question: the `n` count, the distribution
subquery and the avg subquery. For a survey with Q questions that is 3Q traversals where one pass
grouped by `question_id` would produce the same result.

A verifier then **measured** it, which the probe had said was impossible — by setting
`request.jwt.claims`, assuming the `authenticated` role, and diffing `pg_stat_statements`:

```
one aggregate_results call on a 2-question survey issued
  1 × app.k_for  +  1 × the question cursor  +  2 × count  +  2 × distribution
```

Index support is present (`answers(response_id, question_id)` unique, `answers(question_id)`,
`responses(round_id)`), so each traversal is cheap and the finding is about their *number*.
`app.freeze_round` runs the same body, so the fan-out also happens inside the transaction that
closes a round. **Downgraded to MINOR by the verifier** — the loop is over an indexed join and no
user-visible consequence was demonstrated at any volume available.

**`C2-2` · MAJOR — three mutually inconsistent definitions of "which question type has a numeric
average".**

```
app.scale_types()      -> array['scale','likert','smiley']
app.aggregate_rows     -> type in ('scale','enps','slider')
public.get_peer_results-> type in ('scale','likert','smiley','enps','slider')
```

`results_summary` uses the helper; `aggregate_rows` does not. `compose_report`'s `drivers` section
filters `where q->>'avg' is not null` over `aggregate_results` output — so **a likert question can
never be named a driver in a statutory report**, while the headline average in `results_summary`
includes it. The divergence could not be shown live (no seeded survey has both a likert question
and ≥5 respondents), so the consequence is derived from the three lists, which are measured.

---

## 3.3 C1 — query shape

**`C1a-2` · MAJOR · INFERRED · BITES YES — `saveDraft` is not atomic.** Its reposition loop writes
negative positions, then a second loop writes the real ones. There is no transaction and no
rollback; `position` carries no CHECK (verified against `pg_constraint`); and `bygg/page.tsx:44-46`
reads `.order('position')` ascending, so `-1` sorts before `0`. A mid-loop failure leaves the
Builder rendering a scrambled order, and the next successful save writes that order back. Marked
INFERRED because inducing the mid-loop failure requires a write this pass forbade — every
*enabling* fact is measured, the composite is not.

**`C1a-3` · MAJOR — «Kopier som ny runde» drops the quiz answer key.** The copy's `.select(…)`
names neither `answer_index` nor `points`, and the insert spreads the result, so defaults apply: a
copied quiz gets NULL answers and 100 points everywhere, silently. The verifier noted the same
select also omits `run_mode`, so a live survey copies as `standard` — reported here, not filed as a
finding, because the probe did not claim it.

**`C1b-03` · MAJOR — Oversikt fetches one row per invitation ever sent.** The post-login landing
page computes participation client-side over the whole invitation history.

**`C1b-14` · LIMITATION — no pagination exists anywhere in the product.** Every list screen fetches
all rows and filters in the browser.

**`C1b-05` · MINOR · BITES YES — the authenticated shell costs 4 GoTrue `/user` round trips and
4–5 table reads before any page query runs.** That is the highest-leverage query path in the
product because every navigation pays it.

---

## 3.4 C3 — React, structural only

**`C3-2` · LIMITATION — `react-hooks/exhaustive-deps` is a WARNING and `eslint .` carries no
`--max-warnings`.** So the hooks gate cannot fail, and every missing-dependency defect is invisible
to CI by construction. This is the valuable half of C3: not a render cost, a *gate* that cannot
report.

**`C3-1` · MAJOR · INFERRED — `SurveySearch` derives state from a prop and never reconciles it**,
so the header nav link to `/undersokelser` leaves a stale filter applied.

**`C3-5` / `C3-6` · MINOR · BITES YES** — a 1 Hz `setInterval` re-renders the whole respondent tree
for one text node, for the session's duration; and index keys sit on four lists that support
mid-list removal in `QuestionCard`.

**Not claimed:** actual render counts and timings. They need a browser with the React profiler,
which this container has but which no probe was permitted to drive for a *performance* measurement.
Marked UNVERIFIED in `00-method.md` § 0.5 rather than estimated.

---

## 3.5 C6 — dead code

**A methodological correction that had to be made before any of this could be believed.**
`lib/results/read.ts:32` is `supabase.rpc(fn as 'aggregate_results', args as never)` — **the RPC
name is a variable**. A literal-string call-site grep therefore returns zero for `results_summary`,
`dashboard_summary`, `get_heatmap`, `get_themes`, `get_benchmarks` and `get_quotes`, all of which
are live. Every "no call site" finding was re-derived against this dispatcher; the ones below
survived it.

**`C6b-1` · MAJOR · BITES YES — the mail queue has two hourly cron producers and no scheduled
consumer.** This is the same defect as `B4-F01` and it is *live on prod right now* — see
`02-security.md` § 2.2 for the measured evidence.

**`C6b-2` · MAJOR · BITES YES — the help centre tells the user an administrator sees their
message; no screen in the product reads `support_messages`.**

**`C6a-1` · MAJOR — `publishDuty` has no call site.** Publishing a statutory redegjørelse is
reachable from the seed and from nothing else.

**`C6a-2` · MAJOR — next-intl message keys are not type-checked at all**, and the file that claims
to make a missing key a build error does not. `C6a-5` counts **47 message keys referenced by
nothing**, including a «Krever handling» string.

**`C6b-7` · LIMITATION — `app.k_threshold()`, the knob CLAUDE.md names as the k-anonymity control,
is now called by nothing.** The control moved to `app.k_for`; the document did not.

**`C6b-8` · LIMITATION — `audit_events` has seven writers and no reader anywhere in the product.**
Nothing renders the audit trail the compliance story depends on.

**`C6b-3` — three feature flags still have zero call sites**: `ai_insights`, `ai_translate`,
`stripe_billing`. D44 recorded this shape for `entra_sync`/`google_sync`/`hr_sync`; it recurs.

---

## 3.6 C5 — the harness, timed per gate

`verify:all` is a `&&` chain, so it stops at the first failure and yields no per-gate numbers and
nothing about the gates after it. Each of the 17 gates was therefore run **individually**, once, on
an idle machine, from a freshly `db reset` + fully seeded database.

**A false start worth recording, because it is the same shape this audit keeps finding.** The first
attempt produced timings that were quietly wrong: a detached earlier run and the new run were both
executing `time-gates.sh`, both mutating the same database and both appending to the same file.
`verify:roundtrip` "failed" as a result. Two concurrent measurements of the same thing are not a
measurement. Both were killed, the database was reset and reseeded, and the numbers below come from
a single clean run.

**RUN IN PROGRESS AT THE TIME OF THIS COMMIT — partial.** The gates below completed; the
browser and mail gates that follow them in the chain had not, and are NOT reported as passing
or failing. This section is updated in a follow-up commit with the full table.

```
GATE                    SECONDS  RESULT
verify:quality               11  pass
verify:copy                   0  pass
verify:db                    72  pass
verify:policy                 4  pass
verify:attack                 1  pass
verify:roundtrip             38  pass
verify:hermetic             203  pass
verify:interaction           23  pass
```

What is already visible: `verify:db` at 72 s dominates everything measured so far, and
`verify:copy` completes in under a second — the gate that `B7b-02` shows is looking at the
wrong artefact is also the cheapest one in the chain.

---

## 3.7 Every surviving Part C finding

| § | id | finding | sev | tier | bites prod today |
|---|---|---|---|---|---|
| C1a | `C1a-2` | saveDraft is not atomic across its round trips: a mid-loop failure leaves questions at negative positions, and the page renders them in that order | **MAJOR** | INFERRED | YES — prod has 2 `utkast` surveys and saveDraft's status gate at :105 admits exactly those, so t |
| C1a | `C1a-3` | «Kopier som ny runde» drops the quiz answer key and resets per-question points | **MAJOR** | PROBE-VERIFIED | NO |
| C1a | `C1a-4` | «Lagre som mal» round-trips a question through a shape that cannot carry its config, so a 7-point scale comes back as a 5-point one | **MAJOR** | PROBE-VERIFIED | NO |
| C1b | `C1b-03` | Oversikt — the post-login landing page — fetches one row per invitation ever sent, to compute per-survey integers | **MAJOR** | PROBE-VERIFIED | NO |
| C2 | `C2-12` | UNVERIFIED — compose_report calls aggregate_results, which re-checks auth.uid(); on the anonymous share-token path the drivers section may compose to nothing | **MAJOR** | VERIFIED | NO |
| C2 | `C2-2` | Three mutually inconsistent definitions of "which question type has a numeric average" — a likert question is inside results_summary's headline average and simultaneously avg:null in aggregate_results | **MAJOR** | PROBE-VERIFIED | NO |
| C3 | `C3-1` | SurveySearch derives state from a prop and never reconciles it, so the header nav link to /undersokelser is un-done 250 ms later | **MAJOR** | INFERRED | YES — needs only one signed-in user and >1 survey to filter; prod has 1 administrator and 4 surv |
| C4 | `C4-1` | 81 kB gzip of Sentry ships to every visitor on all 37 routes and never initialises — the `if (enabled)` guard gates the init call, not the download | **MAJOR** | PROBE-VERIFIED | YES — this is a bundle fact independent of tenant data; every visitor to the deployed app downlo |
| C4 | `C4-2` | 57.1% of the respondent page's bytes are admin message strings it cannot render — and the whole catalogue is serialised twice | **MAJOR** | PROBE-VERIFIED | YES — prod has 2 survey_invitations and 1 share_link, so /s/[token] is a live reachable surface, |
| C6a | `C6a-1` | publishDuty has no call site: publishing a statutory redegjørelse is reachable from the seed and psql, not from the product | **MAJOR** | PROBE-VERIFIED | NO |
| C6a | `C6a-2` | next-intl message keys are not type-checked at all; the file that claims to make a missing key a compile error is dead and 449 keys stale | **MAJOR** | PROBE-VERIFIED | NO |
| C6b | `C6b-1` | The mail queue has two hourly cron producers and no scheduled consumer anywhere in the repository | **MAJOR** | PROBE-VERIFIED | YES — prod's pgmq.q_mail_outbox holds 2 messages enqueued 2026-09-08 05:44:47+00 with a_mail_out |
| C6b | `C6b-2` | The help centre tells the user an administrator sees their message; no screen in the product reads support_messages | **MAJOR** | PROBE-VERIFIED | YES — the hjelp contact form and its ui_messages copy are live on prod with 1 administrator; sup |
| C1a | `C1a-1` | saveDraft issues two PostgREST round trips per existing question, up to ~400 for one save | **MINOR** | PROBE-VERIFIED | NO |
| C1a | `C1a-10` | editableReport fetches nine columns for six callers that use two | **MINOR** | PROBE-VERIFIED | NO |
| C1a | `C1a-5` | Four actions re-read the caller's own org_members row for an id requireViewer already resolved | **MINOR** | PROBE-VERIFIED | NO |
| C1a | `C1a-6` | createReport makes three independent reads back-to-back, and its two callers read the same 12-row registry first | **MINOR** | PROBE-VERIFIED | NO |
| C1a | `C1a-7` | ensureDuty reads the same duty_definitions row twice, with two different column lists | **MINOR** | PROBE-VERIFIED | NO |
| C1a | `C1a-8` | Three read-modify-write pairs over the same row can silently lose a concurrent edit | **MINOR** | PROBE-VERIFIED | NO |
| C1a | `C1a-9` | The public Bruksområder page transfers 9 KB of question jsonb per request to compute nine integers, and its revalidate directive is inert | **MINOR** | PROBE-VERIFIED | YES — it is an unauthenticated marketing page whose query runs on every visit regardless of tena |
| C1b | `C1b-01` | /s/[token] serialises the entire 109 KB message catalogue TWICE into the RSC payload | **MINOR** | PROBE-VERIFIED | YES — the payload is data-independent; every respondent hitting /s/<token> on prod downloads it, |
| C1b | `C1b-04` | Dashboard issues two SEQUENTIAL result RPCs per survey, for every survey in the organisation by default | **MINOR** | PROBE-VERIFIED | NO |
| C1b | `C1b-05` | The authenticated shell costs 4 GoTrue /user round trips and 4-5 table reads before any page query runs, and half of them are duplicates | **MINOR** | PROBE-VERIFIED | YES — prod has 1 administrator and the shell runs on every authenticated render regardless of da |
| C1b | `C1b-06` | Målgrupper reads every bounced invitation in the table, filtered on two columns that carry no index at all | **MINOR** | PROBE-VERIFIED | NO |
| C1b | `C1b-08` | Sequential await chains where the reads are independent: Live 7 generations, Resultater 8, Send 6, Valg 3 | **MINOR** | INFERRED | YES — the chains run on every render regardless of data, but in-region each hop is a few ms, so  |
| C1b | `C1b-09` | `export const revalidate = 300` on the public Bruksområder page is inert — the route is dynamic | **MINOR** | PROBE-VERIFIED | YES — the same build config ships to prod, so every anonymous visit re-renders and re-queries; t |
| C1b | `C1b-10` | Bruksområder fetches 10 KB of jsonb to use only its array length, on a public unauthenticated page | **MINOR** | PROBE-VERIFIED | YES — prod carries 17 packs / 8,230 bytes of `questions` jsonb, fetched on every anonymous visit |
| C1b | `C1b-11` | resolveLocale is not React-cached, and the comment beside it says the pair is | **MINOR** | PROBE-VERIFIED | NO |
| C1b | `C1b-12` | organizations is read twice per Administrasjon tab view, once by the layout and once by the tab | **MINOR** | PROBE-VERIFIED | YES — one extra round trip on each admin tab view; prod's single administrator pays it, at negli |
| C1b | `C1b-13` | Per-item database calls inside maps: duty_status per duty, get_quotes per free-text question, a count per group and per segment, a signed URL per logo slot | **MINOR** | PROBE-VERIFIED | NO |
| C2 | `C2-1` | app.aggregate_rows issues 1–3 SQL statements per question where one grouped pass would do — and get_heatmap in the same schema already does that one pass | **MINOR** | PROBE-VERIFIED | NO |
| C2 | `C2-11` | get_heatmap calls app.scale_questions twice per invocation with identical arguments | **MINOR** | PROBE-VERIFIED | NO |
| C2 | `C2-4` | The dashboard issues 2 + 2×(every survey in the organisation) RPCs on its default view, uncapped, and the two per-survey reads are awaited sequentially | **MINOR** | PROBE-VERIFIED | NO |
| C2 | `C2-5` | compose_report's `drivers` section calls aggregate_results twice with identical arguments | **MINOR** | PROBE-VERIFIED | NO |
| C2 | `C2-6` | overview_activity makes 15 separate passes over the responses→survey_rounds→surveys chain where two grouped passes would do | **MINOR** | PROBE-VERIFIED | NO |
| C2 | `C2-7` | The Resultater screen issues one get_quotes RPC per free-text question, on top of six parallel aggregation RPCs | **MINOR** | PROBE-VERIFIED | NO |
| C2 | `C2-8` | get_quotes, live_cloud and quiz_leaderboard are VOLATILE while every sibling aggregate RPC is STABLE, and none of them writes | **MINOR** | PROBE-VERIFIED | NO |
| C3 | `C3-3` | SendScreen's recipient merge is O(n·m) and blocks the main thread for 129 ms at the product's own 5000-recipient ceiling | **MINOR** | PROBE-VERIFIED | NO |
| C3 | `C3-4` | The recipient import has no client-side cap, so the UI will parse, stage and render more recipients than the server will ever accept — and the refusal says nothing about a limit | **MINOR** | PROBE-VERIFIED | NO |
| C3 | `C3-5` | A 1 Hz setInterval re-renders the entire respondent tree for one text node, for the whole session, and never stops — including after the countdown reaches zero and after the survey is submitted | **MINOR** | PROBE-VERIFIED | YES — prod has 1 share_link, 2 invitations and 1 recorded response, so /s/[token] is a live rout |
| C3 | `C3-6` | Index keys on four lists that support mid-list removal in QuestionCard — no wrong value is displayed today, and the exposure is the state React does not control | **MINOR** | PROBE-VERIFIED | YES — needs only a draft survey and a question with options; prod has 4 surveys, 2 of them utkas |
| C4 | `C4-3` | zod (23.1 kB gzip) is in the respondent's phone bundle to supply two pure helper functions that never use it | **MINOR** | PROBE-VERIFIED | YES — /s/[token] is reachable on prod (1 share_link, 2 invitations), so the 23.1 kB ships to any |
| C6a | `C6a-3` | lib/i18n/revalidate.ts is dead, so the ui_messages shipped-layer cache tag is never revalidated — and the comment beside the cache says otherwise | **MINOR** | PROBE-VERIFIED | YES — YES, but bounded — prod carries ui_messages 2730, so the next `seed:i18n` against prod ser |
| C6a | `C6a-4` | Five more dead exports, one of them a Zod schema exported from a 'use server' module | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| C6a | `C6a-5` | 47 message keys exist in both languages and are referenced by nothing — including a Krever-handling card that was never built | **MINOR** | PROBE-VERIFIED | NO |
| C6a | `C6a-8` | Seven values are exported but used only inside their own file | **MINOR** | PROBE-VERIFIED | NOT-APPLICABLE |
| C6b | `C6b-12` | report_exports is written by the two export routes and read by nothing | **MINOR** | PROBE-VERIFIED | NO |
| C6b | `C6b-4` | event_stream_panel is queried on every dashboard render and the result is explicitly discarded | **MINOR** | PROBE-VERIFIED | YES — YES for the wasted query (the dashboard is live on prod and issues it per render); NO for  |
| C6b | `C6b-5` | logic_rules is deleted and re-inserted on every survey save and read by nothing; the comment beside the write claims the opposite | **MINOR** | PROBE-VERIFIED | NO |
| C6b | `C6b-6` | task_kinds is a registry the product never reads; labels and ordering live in a hard-coded constant with a fallback that mislabels an unknown kind | **MINOR** | PROBE-VERIFIED | NO |
| C1a | `C1a-11` | Ten static registries with no tenant column are read from the database on every request, uncached | **LIMITATION** | PROBE-VERIFIED | YES — the cost is paid on every authenticated render regardless of tenant count; prod's single o |
| C1a | `C1a-12` | Identity is resolved four separate times per authenticated request, and audit() adds a fifth per write | **LIMITATION** | INFERRED | YES — every authenticated page load by prod's single administrator goes through middleware, next |
| C1b | `C1b-02` | Every page ships all 29 namespaces / 2093 keys to the browser; client components use at most 11 of them | **LIMITATION** | PROBE-VERIFIED | YES — data-independent; every prod page load carries the full catalogue (prod ui_messages 2730 r |
| C1b | `C1b-14` | No pagination exists anywhere in the product; every list screen fetches all rows and filters, sorts and counts in JavaScript | **LIMITATION** | PROBE-VERIFIED | NO |
| C1b | `C1b-15` | 31 read sites hit migration-seeded registry tables on every request; only two things in the whole app use the data cache | **LIMITATION** | PROBE-VERIFIED | YES — these reads run per request on prod today; the cost is a handful of small queries per page |
| C1b | `C1b-16` | Four org-scoped columns that pages filter on carry no index at all | **LIMITATION** | PROBE-VERIFIED | NO |
| C1b | `C1b-17` | ui_messages org-override read is deliberately per-request, and the shipped read's filter is not covered by the table's one useful index | **LIMITATION** | PROBE-VERIFIED | YES — prod holds 2730 ui_messages rows (1357 shipped 'no'), so the same plan runs there on every |
| C1b | `C1b-18` | The Live screen has no realtime or polling — every update is a manual reload costing seven serial round trips | **LIMITATION** | PROBE-VERIFIED | NO |
| C2 | `C2-3` | app.numeric_answer is IMMUTABLE but PARALLEL UNSAFE and non-inlinable, which blocks parallel plans on every aggregation scan in the product | **LIMITATION** | PROBE-VERIFIED | NO |
| C2 | `C2-9` | 60 foreign keys have no index on the referencing column, including responses.invitation_id — every parent delete seq-scans the child | **LIMITATION** | PROBE-VERIFIED | NO |
| C3 | `C3-2` | exhaustive-deps is a WARNING and `eslint .` carries no --max-warnings, so the hooks gate cannot fail — today's clean result is luck, not enforcement | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| C3 | `C3-7` | State that exactly one region reads sits at the top of the largest single-function components — a structural claim about blast radius, not a measured performance claim | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| C3 | `C3-8` | No virtualisation anywhere, and two client lists render straight from an unbounded source | **LIMITATION** | PROBE-VERIFIED | NO |
| C4 | `C4-4` | A static legal document costs 186 kB of JavaScript; nothing this app serves costs less than 184 kB | **LIMITATION** | PROBE-VERIFIED | YES — /personvern and /databehandleravtale are public marketing routes served from the same buil |
| C4 | `C4-5` | The 147 kB middleware runs on every non-static request, and about 54 kB gzip of it is the Sentry edge SDK | **LIMITATION** | PROBE-VERIFIED | YES — the middleware executes for every prod request that is not a static asset, regardless of h |
| C4 | `C4-6` | Every authenticated request pays a Supabase Auth round trip in the middleware before the page renders | **LIMITATION** | PROBE-VERIFIED | YES — prod has 1 auth user and 1 org_member, so every navigation that administrator makes pays i |
| C4 | `C4-7` | Nothing in the 22-script verification apparatus measures bundle size or page weight, and there is no lazy loading anywhere to regress against | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| C4 | `C4-8` | 78 MB of browser binary sits in production dependencies for one route | **LIMITATION** | PROBE-VERIFIED | NO |
| C6a | `C6a-6` | The dashboard panel vocabulary is guarded against one migration file, not against the registry — a seventh on_dashboard row would render a raw key | **LIMITATION** | PROBE-VERIFIED | NO |
| C6a | `C6a-7` | Splash and Bruksområder copy is bound to hard-coded loop counts with nothing tying them to the catalogue | **LIMITATION** | PROBE-VERIFIED | NO |
| C6b | `C6b-10` | Three more tables with no product reader or writer: template_pack_translations, question_translations, duty_survey_links | **LIMITATION** | PROBE-VERIFIED | NO |
| C6b | `C6b-11` | Three SECURITY DEFINER RPCs granted to authenticated have no product call site: close_round, snapshot_results, snapshot_report | **LIMITATION** | PROBE-VERIFIED | NO |
| C6b | `C6b-3` | Three feature flags still have zero call sites: ai_insights, ai_translate, stripe_billing | **LIMITATION** | PROBE-VERIFIED | NO |
| C6b | `C6b-7` | app.k_threshold() — the knob CLAUDE.md names as the k-anonymity control — is now called by nothing | **LIMITATION** | PROBE-VERIFIED | NOT-APPLICABLE |
| C6b | `C6b-8` | audit_events has seven writers and no reader anywhere in the product | **LIMITATION** | PROBE-VERIFIED | YES — prod already holds 7 audit_events rows and there is no product surface that can display an |
| C6b | `C6b-9` | import_jobs and notifications have neither a writer nor a reader; their only rows are synthetic fixtures inserted so Gate 5a3 can report PROVEN | **LIMITATION** | PROBE-VERIFIED | NO |

---

## 3.8 Refuted

- `C1b-07` The same schedules row is read twice per render on Send and twice on Resultater; readScheduleChip is not memoised and schedules.survey_id has no index — REFUTED — the command measures the wrong thing in the probe's version: it read the source and inferred a second HTTP request that the framework does not issue. The residual observation (schedules.survey_id carries no ind
