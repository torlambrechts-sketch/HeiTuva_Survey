# 06 — The remainder: everything between here and a shippable product

**2026-09-09, after V2-10 closed and V2-11 was opened without being built.**
**REVISED 2026-09-10, after the S-block and the mail tranche — and the revision found that this
document had gone stale in the one way it was written to prevent.** § 2 said thirty migrations
stood unapplied. They do not, and the method that produced the thirty cannot produce a right
answer at all (§ 2.0). Every count below has been re-derived; the ones that moved say so.
**That this document went stale IS the finding**, and it is DEVIATIONS **D135**: a claim about a
system nobody is looking at needs the command that looks, beside it — which this document already
knew, having printed one beside every number.

**Sequencing is Tor's and this document does not attempt it.** Its only job is to make the
remainder visible whole, with **every count derivable by a command printed beside it**. No
effort figures.

Position: `git merge-base origin/main HEAD` = `3b7cef5` = `origin/main` head. Repo state as
measured below.

| | 2026-09-09 | **2026-09-10** | Command |
|---|---|---|---|
| Decisions in the register | 89 | **89** | `grep -oE '^\| \*{0,2}Q[0-9]+ ' DECISIONS.md \| tr -d '\|* ' \| sort -u \| wc -l` |
| Deviations logged | 130 | **137** | `grep -cE '^### D[0-9]+' docs/DEVIATIONS.md` |
| Migrations in the repo | 116 | **123** | `ls supabase/migrations \| wc -l` |
| Tests / files | 824 / 53 | **940 / 64** | `CENSUS_WRITE=1 npx vitest run` |
| 5a3 surfaces | 65 of 90 | **67 of 92** | `npm run verify:policy` |
| Global flags OFF | 9 | **9** | `select count(*) from feature_flags where org_id is null and not enabled` |

**The deviation command was returning 130 while 137 entries existed**, and the seven it could not
see were D129–D135 — every entry added since this table was written, all of them mine. They were
headed `## D…` where every other entry is `### D…`, so the register's own re-derivation was blind
to exactly the range it most needed to cover, and `## ` is besides reserved in that file for
structural headings (`Entries`, `Standing rule`). Normalised to `###` on 2026-09-10; the command is
unchanged and now returns 137. **A command beside a number is only a check while the thing it
counts keeps the shape it matches** — the third time in two days that a number and its derivation
drifted apart, and the first where the derivation was right and the data wrong.

*Numbering note:* the highest id is **D135** but there are **137** entries and no D126–D128 — that
range was vacated when D125–D128 were renumbered to D129–D132 to clear a collision with V2-10, and
the mapping is recorded at the head of D129. **Highest id is not a count**, in this file
particularly.

---

## PART 1 — DECIDED, NOT BUILT

Walked end to end rather than taken from a list. **Three of the items I was handed as
examples turned out to be wrong, and that is the point of walking it.**

### 1.1 CORRECTIONS to the list I was given

| Item as given | Measured |
|---|---|
| «Q50 (timezone on the organisation, three `next_run_at` sites)» | **The database work is DONE.** `organizations.timezone` exists, `NOT NULL`, defaults `Europe/Oslo`, validated by `app.timezone_known`; and all three schedule sites read it — `app.resume_schedule`, `app.run_due_schedules`, `public.send_round`. What is missing is different and smaller: **no UI writes the column.** § 1.2 |
| «the census manifest generation» | **BUILT.** `CENSUS_WRITE=1` regenerates `tests/expected-counts.json` (`tests/census.ts:122`) and has been used in every phase since |
| «Q48(b) (registry translation)» | **Correct — genuinely not built.** § 1.3 |

*Command:* `psql -c "select column_default from information_schema.columns where table_name='organizations' and column_name='timezone'"` → `'Europe/Oslo'::text`; and
`select proname, (prosrc ~* 'timezone') from pg_proc where prosrc ~ 'next_run_at'` → three of
four true (`app.cadence_interval` is arithmetic and needs none).

### 1.2 `organizations.timezone` has no writer — the FOURTH instance of one shape

The column is read by three scheduling functions and set by nothing but its default.
`grep -rn "timezone" app/ lib/` returns **one** hit and it is `scripts/verify/capture.ts`'s
browser context. An organisation outside `Europe/Oslo` cannot say so.

**This is the shape CLAUDE.md now asks about in the migration that adds a column** — after
D102's pre-`M:0040` state, `created_by` (no writer at all), and V2-9's `run_mode`. Q50 is the
fourth, and it predates the rule. *Cost:* one field on Administrasjon → Firmaopplysninger and
one server action. *Depends on it:* every recurring send for a customer not in Oslo time.

### 1.3 Q48(b) — the registry overlay

`duty_definitions` (4 rows) and `report_section_types` (12 rows) carry user-visible Norwegian
in `title` / `label` with **no `lang` column and no overlay**, and
`app/(app)/oversikt/page.tsx:35` reads `title` and `law` directly. The 16 `ui_messages` rows
matching `duty_%`/`section_%` are ordinary UI copy, not the overlay.

**Q48(b)'s own line already says the decision changed under it:** V1-4 built the pattern
(registry holds keys, next-intl holds strings, a test binds the set both ways —
`tests/unit/dashboard-panels.test.ts`), so the open question is whether (b) **extends that**
rather than building the overlay it was drafted as. *Cost:* message keys plus a binding test if
extended; a join in three screens and the PDF if not. *Depends on it:* the product being
usable in English at all for statutory duties and report sections — today those render
Norwegian regardless of locale.

### 1.4 The nine global flags that are OFF

*Command:* `select key from feature_flags where org_id is null and not enabled order by 1`

| Flag | State behind it |
|---|---|
| `sms_channel` | **Wired, not enabled.** `FLAGGED_CHANNELS` and the Send screen both read it; the provider adapter is not written |
| `pptx_export` | `lib/export/` exists and `pptxgenjs` renders (`tests/unit/absent-deps.test.ts`). Flag-gated, one org row enabled in the demo seed |
| `entra_sync`, `google_sync`, `hr_sync` | **V2-11.** Read by `lib/send/registry.ts`'s gate; nothing behind them |
| `ai_insights`, `ai_translate` | **Names only.** `grep` finds them in `lib/flags.ts` and nowhere else |
| `event_stream_panel` | **Q27 — blocked on R4**, which is not in this repository (§ 4) |
| `stripe_billing` | No billing engine (D75) |

### 1.5 Decisions whose text defers explicitly

*Command:* `grep -nE "^\| " DECISIONS.md | grep -iE "not built|deferred|when it arrives|later phase|reopen"`

Q6 (SMS provider), Q10 (splash exports), **Q14 (administrator MFA — trigger «first real
organisation»)**, Q27 (stream panel), Q63/Q66/Q67 (populations, and the retention and
send-guard rules that wait for them), Q74 (`helpForum`), Q80 (`audienceQuestions`), Q100
(`avmelding` writer, waits for mail templates), Q101 (bounce never becomes an objection —
decided, no work), **Q78 (live counter — OPEN, with Tor)**, **Q89 (V2-11 — OPEN, with Tor)**.

### 1.6 Logged by the phases' own fix passes, never fixed (the two-pass rule)

- **V2-9:** `live_sessions.step` has no writer — it renders when set and the presenter cannot
  set it. The ten live toggles (V2:6133-6142) are not built as a settings surface.
- **V2-10 — CORRECTED 2026-09-10, because this line misled the fidelity review.**
  It read «quizPreview's chips render a pass mark and an attempt count, which Q84 did not build,
  so they are not rendered at all» — one sentence describing the BUNDLE and the BUILD with no
  boundary between them, which reads as an outstanding defect. It is not one. The **bundle**
  unconditionally pushes `(st.quizPass || 70) + " % for å bestå"` and `(st.quizTries || 2) + " forsøk"`;
  **our `QuizPanel` renders neither**, deliberately and with its reason written beside it. V2-10
  got this right and nothing is owed.
  What WAS owed, and was invisible behind that line: **no customer could turn quiz on at all.**
  `RunModePanel` typed `Mode` as `'standard' | 'live'`, locked the quiz card and printed «Quiz er
  ikke bygget ennå» — true when written, false from the moment V2-10 landed (D135 in shipped copy).
  Fixed 2026-09-10; the demo seed now carries a quiz, so `quiz_leaderboard` can be PROVEN rather
  than CHECKED and the screens can be photographed for the first time. See `docs/review/04-quiz.md`.
- **V1-6 / D102:** the demo seed reaches only states the current code creates.
- **Mail tranche (D133, D134):** `bounced_at` has no writer — this Brevo account exposes no
  Transactional → Webhooks, so there is no delivered event and no bounce event (**D133**); and the
  provider's `messageId` is discarded, so nothing joins a `survey_invitations` row to Brevo's own
  delivery view (**D134**). They compound: no bounce event AND no handle with which to go and ask.
  **To be revisited together, not separately.** An invalid address keeps counting toward target and
  toward «av N inviterte», and «Adressen svarer ikke» can never fire. Acceptable for a demo and a
  pilot with known addresses; the trigger for reopening is a customer uploading 200 recipients from
  an HR system, where a handful are always wrong.
- **Copy held on a mailbox:** `personvern@heituva.no` in `legal.privacy6P` and `legal.privacy8P`
  stays until `personvern@heituva.com` is confirmed to RECEIVE, not merely to exist. A `.com` that
  bounces is worse than a `.no` that is at least someone's inbox.

---

## PART 2 — PROD DISTANCE (Q103)

**Re-derived 2026-09-10. The answer changed, and so did the question's method.**

### 2.0 A VERSION STRING IS NOT AN IDENTITY — read this before answering «how far behind is prod»

`mcp__Supabase__apply_migration` **stamps its own timestamp** into
`supabase_migrations.schema_migrations`, not the repo filename's version. A migration applied that
way is genuinely applied and its ledger row will never match the file it came from. So the two
symmetric-looking observations below are **one artefact seen from two sides**, not two findings:

| Observation | What it actually means |
|---|---|
| **54 of prod's 170 versions have no repo file** | repo migrations applied through MCP, stamped with the apply time |
| **7 repo files have no prod version** | the same migrations, seen from the other end |

**Neither number is a distance.** Diffing filenames against the ledger cannot answer this question
— not approximately, not as a lower bound. It is a comparison between a naming convention and a
clock.

**How the question IS answered: by fingerprint, or by object.** The eight catalogue hashes plus the
ninth per-function `md5(prosrc)` (`docs/OPERATIONS.md`), or a direct existence check on what a
migration creates. Re-derived that way on 2026-09-10, all seven apparently-missing migrations are
**present on prod**:

```sql
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='app' and p.proname='redact_for_role')                       as m0089,
  (select count(*) from pg_constraint where conname='groups_id_org_uniq')         as m0090a,
  (select count(*) from pg_constraint where conname='org_members_group_id_fkey')  as m0090b,
  (select count(*) from pg_constraint where conname='live_sessions_round_id_fkey')   as m0092a,
  (select count(*) from pg_constraint where conname='result_snapshots_round_id_fkey') as m0092b,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='app' and p.proname='guard_run_mode_anonymous')              as m0093,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='app' and p.proname='apply_retention')                       as m0094,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('mail_worker_secret','mail_outbox_depth')) as m0095,
  (select count(*) from cron.job where jobname='mail-worker-minutely')            as m0095_cron;
-- 1,1,1,1,1,1,1,2,1  — all present
```

Note the probe has to be written from what each migration CREATES, read out of the file. A first
attempt guessed at object names and returned three zeroes that were artefacts of the guess. **A
negative from a probe you wrote from memory is not evidence of absence.**

**This is D110 applied to migration versions**, and the command that re-derives the number is the
one above — *not* a filename diff. Written here because this is where the prod-distance question
gets asked; the same rule is recorded beside the fingerprint procedure in `OPERATIONS.md`.

### 2.1 THE THIRTY ARE APPLIED — this section previously said the opposite

**Prod is in step with `supabase/migrations/` as of 2026-09-10.** `M:0058`, `M:0060`–`M:0088` and
everything since, up to and including `M:0095`, are on `heituva-prod`. The capability table that
stood here — segments absent, `suppressions` absent, tasks absent, no round-freeze snapshot, no
help centre, no test mode, no live, no quiz — **described a database that no longer exists** and
each of its rows is now false.

Two of its entries mattered more than the rest and are worth closing explicitly:

- **`M:0068`**, the round-freeze snapshot, was a **data-loss repair** — the one migration whose
  absence destroyed information already on prod. Applied.
- **`M:0060`/`M:0061`**, the reservation machinery, were a **legal obligation** rather than a
  feature: art. 21 is a right and the code honouring it was not deployed, so prod could send to
  someone who had objected. Applied; `suppressions` exists and `send_round` carries the guard.

### 2.2 What the stale section cost, and why it is kept rather than deleted

Nothing was built on the wrong belief — but the belief was load-bearing for sequencing, and it was
read as a fact for a day. **The document warned about exactly the use that was made of it**: § 2.4
already said «anyone applying these thirty must re-run the fingerprint rather than trusting this
count», and the count was still read as a count. A footnote is not a guard. What a guard looks like
is § 2.0's command sitting where the number used to be.

### 2.3 What is genuinely still true about the local/prod gap

- **Every gate reads local. Nothing has ever read prod.** Unchanged and still unowned. Green CI on
  this branch says nothing about `heituva-prod` and could not.
- **Between applies, nothing watches prod at all.** The fingerprint closes drift at apply time
  only; there is no scheduled comparison. § 4.4.
- **This environment CAN now read prod** — the Supabase MCP server is authorised in this session,
  which is how § 2.0 and § 2.1 were derived. The old note that `env | grep -c SUPABASE` → 0 and so
  the count «had to be computed from the ledger» is superseded: the ledger was never able to answer
  it, and the database always was.

### 2.4 New on prod since this document was written

- **Mail is live** — `M:0095`, the `mail-worker` Edge Function on a minutely `pg_cron` job, two
  real invitations delivered 2026-09-10. `OPERATIONS.md`.
- **`pg_net` is installed in `public`** — a WARN-level advisor introduced by that work, logged and
  not moved while `app.run_mail_worker()` depends on `net.http_post`.
- **Six `app` functions have a mutable `search_path`** — `task_step_index`, `below_threshold`,
  `guard_live_is_anonymous`, `live_word_floor`, `guard_run_mode_anonymous`, `guard_quiz_policy`.
  WARN, new since the last advisor reading, one migration to fix. § 5.
- **Two advisor categories are unclassified** — 7 SECURITY DEFINER functions callable by `anon`,
  31 by `authenticated`. Most are the design; none of it is written down against these advisors. § 5.

---

## PART 3 — LAUNCH READINESS (not engineering)

| # | Item | Owner | What unblocks it | Source |
|---|---|---|---|---|
| 1 | **PITR not enabled** | Tor (Supabase dashboard) | A paid tier and a click. **First item on the gate — before the first real send** | `OPERATIONS.md:175` |
| 2 | **Leaked-password protection off** | Tor | Dashboard → Authentication → Passwords. **Re-confirmed still off, 2026-09-10**, by `get_advisors(type: security)` | `OPERATIONS.md:126` |
| 3 | **Turnstile keys** | Tor | Cloudflare widget for the production hostname; `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` on Vercel. **The code is written and reads them** | `OPERATIONS.md:135-137` |
| 4 | **Entra registration** | Tor | App registration, redirect URI, secret. **Also connector 1 of V2-11** | `OPERATIONS.md:143-145` |
| 5 | **Remote load test** | engineering, needs 1–4 | `scripts/verify/load.ts` is `--local` only | `OPERATIONS.md:147` |
| 6 | **Administrator MFA (Q14)** | Tor | Deliberately deferred; **trigger is «the first real organisation»**, not a date | `OPERATIONS.md:153`, Q14 |
| 7 | **Four legal texts unreviewed** | lawyer | Personvernerklæring, Databehandleravtale, sub-processor list, **and the DPA's `dpa4P` clause that has been WRONG TWICE** | `LEGAL_DRAFTS.md:10-16` |
| 8 | **DPIA — NOT STARTED** | Tor + lawyer | Nothing written. **Blocks V2-11 connector 5 (sykefravær, art. 9) outright** | `LEGAL_DRAFTS.md:14` |
| 9 | **Next 16 upgrade** | engineering | `next` is `^15.5.0` (`node -p "require('./package.json').dependencies.next"`). Unblocked since Q17 shipped | `06-closeout.md:81` |
| 10 | **Demo seed reaches only reachable states** | engineering | One seed row + one manifest state; belongs beside the load test | `05-status.md § 3` |

**Items 1, 2, 3, 4, 6, 7 and 8 are not engineering at all.** Seven of the ten need a person
with an account or a licence, and four of those seven are the same person.

---

## PART 4 — NOT SCHEDULED

### 4.1 The expansion catalogue — R2, R3, R4

**Not in this repository, and Tor's to supply.** `grep -rn "R2\|R3\|R4" docs/` finds only the
records saying they are absent. Named in the original request as: **R2** twelve packs, **R3**
contacts/accounts, **R4** event ingestion.

- **R4 and the stream panel are one feature in two halves** — ingestion first, panel second —
  and **V1-7 was descheduled out of the v1 bundle** because of it (`05-status.md:120-124`).
  `event_stream_panel` is the flag that waits.
- **R3 (contacts/accounts)** is what V2-11's connector 13 (CRM) needs: customer contacts are a
  data subject class this product does not hold.

### 4.2 Populations

Q63 split them out of V2-3a; **Q66** (retention per population) and **Q67** (the mixed-population
send guard) both wait for them. The Populasjoner card and every population pill render the
unavailable treatment today, which is honest but is three decisions parked on one absence.

### 4.3 V2-11 itself

Opened and not built — `docs/v2/08-v2-11-register.md`. Fourteen connectors, a public API with
an unanswered k-gate question, and one webhook (`threshold.breached`) that **names a mechanism
Q72 rejected** and must not be built as drawn.

### 4.4 What no phase covers

- **Billing.** `stripe_billing` is off and there is no engine (D75); the splash's paid plans
  have nowhere to go.
- **A scheduled prod comparison.** § 2.4 — the standing half of the local/prod gap, explicitly
  left for whoever picks it up.
- **`app.k_for` on an API path.** § 4 of the V2-11 register: the invariant suite catches a new
  SECURITY DEFINER function, not a service-role query in a route handler.

---

## PART 5 — QUALITY-CHECK DEBT

**Added 2026-09-10.** Items 1–3 are new since this document was written; 4–7 were implicit in it and
are named here so they have a place to be closed from.

### 5.1 Four phases have no Gate 6 report — V2-5, V2-6, V2-7, V2-8

`docs/v2/reports/` holds V2-0, V2-1, V2-2, V2-3a, V2-3b, V2-4, V2-9, V2-10. The four missing are
exactly the four that ran as one continuous session (`CLAUDE.md`: «V2-5 → V2-8 ran as one
continuous session»). **The instruction to run them continuously removed the report; it was not an
oversight in the phases.** But CLAUDE.md requires one per phase, and the section a report carries
that nothing else does is **decision conformance** — which caught two half-built decisions the
first time it ran.

**CLOSED 2026-09-10 by ONE report covering the four** — `docs/v2/reports/V2-5-to-V2-8.md` —
not four retrospective ones. Four reconstructions
would read like evidence and be recollection. The single report separates what is still derivable
now — the diff, the migrations, the tests, the census delta, the gate output — from what is lost,
which is the contemporaneous verification pass and fix pass, and says which is which. **A gap
honestly marked is worth more than a plausible reconstruction.**

Outcome: **decision conformance was fully recoverable and all seven decisions conform** (Q72, Q74,
Q75, Q76, Q77, Q98, Q99, re-derived against the tree). What is lost is the verification pass and
the fix pass *as acts* — which findings were deferred under the two-pass rule, and to where. The
report is marked **CLOSED RETROSPECTIVELY** rather than READY FOR REVIEW, so it stays
distinguishable from the eight that earned the standard marker.

### 5.2 Six `app` functions have a mutable `search_path`

`task_step_index`, `below_threshold`, `guard_live_is_anonymous`, `live_word_floor`,
`guard_run_mode_anonymous`, `guard_quiz_policy`. WARN on `get_advisors(type: security)`, new since
the last reading. **CLOSED 2026-09-10 by `M:0096`**, which pins `search_path = ''` on all six
by `alter function` rather than retyping bodies, after checking body by body that every object
reference in them is schema-qualified. Applied to prod and verified by re-reading the catalogue:
`app` 0 unpinned of 62, `public` 0 of 36.

**And closed so it cannot recur silently:** `tests/db/catalogue-invariants.test.ts` gained a
third catalogue-derived sweep asserting that NO function in `app` or `public` has a null
`proconfig`. Five phases of green gates said nothing about these six because nothing enumerated
`proconfig`; the next one now fails a test in the commit that adds it. Scoped to the six it would
have had the same blind spot as the thing it was written about — D115's argument.

### 5.3 Two advisor categories are unclassified

`anon_security_definer_function_executable` (7) and
`authenticated_security_definer_function_executable` (31). Most are the design — result reads go
through SECURITY DEFINER RPCs by CLAUDE.md invariant 1, and the anon-callable ones are
token-validated (`submit_response`, `get_survey_for_token`, `compose_report`,
`report_for_share_token`, `get_peer_results`, `redeem_live_voucher`, `request_demo`). **None of
that is written down against these advisors**, which is how a category stays unclassified forever:
it is nobody's, and each reading of it starts again. A one-time pass marking each by-design or not,
with the reason, done alongside § 5.2. **DONE 2026-09-10** — the classification is in
`docs/OPERATIONS.md`, derived from `pg_proc` and `has_function_privilege` rather than asserted:
29 of 36 carry an authorisation predicate or validate a token; five `mail_*` are service-role only
with EXECUTE revoked from both roles; `claim_membership` cannot check membership by definition.

**The pass found one thing.** `request_demo` is anon-callable by design and its abuse control is
Turnstile — whose keys are **not configured in production** (PART 3 item 3). That is the known
launch item, but nobody had connected it to an anon-writable RPC standing unprotected on a live
origin, which is a reason to move it up the list.

It also found, in itself, a ninth instance of the enumeration shape: the first classification
predicate listed four authorisation helpers by name, missed `app.can_view_survey`, and reported
`get_trends` as an unguarded cross-org read. False. Re-derived as `app\.(is_|has_|can_)`.

### 5.4 `pg_net` in `public`

WARN, introduced by the mail work, logged and deliberately not moved while `app.run_mail_worker()`
depends on `net.http_post`.

### 5.5 Standing limits of the apparatus, restated so they are not re-found

- **5a3 proves a denial test exists, not that its scope is right** (`VERIFY.md`).
- **A CHECK constraint and an `app`-schema function are neither an RLS table nor a public SECURITY
  DEFINER function**, so neither is a 5a3 surface. A recorded limit, not a gap.
- **`verify:load` is `--local` only.** The remote load test waits on PART 3 items 1–4.

### 5.6 The demo seed reaches only states the current code creates

Two surfaces are consequently unphotographable: V2-9's live `step` (no writer — § 1.6) and
V2-10's quiz, because **the demo seed carries no quiz survey**, so `quiz_leaderboard` is CHECKED by
5a3 but its screen cannot be captured.

### 5.7 Docker is unavailable in some working environments

In the remote session that produced this revision, `supabase start` cannot run at all, so the
thirteen db/browser gates can only run in CI. **This is an environment limit, not a code one, and
the two look identical in a report** — anything failing under it must be named as one or the other,
with the reproduction or the reason there is none.

---

## HOLD

This document sequences nothing. Every number above has its command beside it, and the three
corrections in § 1.1 are the reason it was walked rather than transcribed.
