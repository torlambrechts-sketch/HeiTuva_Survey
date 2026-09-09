# 06 — The remainder: everything between here and a shippable product

**2026-09-09, after V2-10 closed and V2-11 was opened without being built.**

**Sequencing is Tor's and this document does not attempt it.** Its only job is to make the
remainder visible whole, with **every count derivable by a command printed beside it**. No
effort figures.

Position: `git merge-base origin/main HEAD` = `3b7cef5` = `origin/main` head. Repo state as
measured below.

| | Count | Command |
|---|---|---|
| Decisions in the register | **89** | `grep -oE '^\| \*{0,2}Q[0-9]+ ' DECISIONS.md \| tr -d '\|* ' \| sort -u \| wc -l` |
| Deviations logged | **130** | `grep -cE '^### D[0-9]+' docs/DEVIATIONS.md` |
| Migrations in the repo | **116** | `ls supabase/migrations \| wc -l` |
| Tests / files | **824 / 53** | `CENSUS_WRITE=1 npx vitest run` |
| 5a3 surfaces | **65 of 90** | `npm run verify:policy` |
| Global flags OFF | **9** | `select count(*) from feature_flags where org_id is null and not enabled` |

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
- **V2-10:** `quizPreview`'s chips render a pass mark and an attempt count, which Q84 did not
  build, so they are not rendered at all. **The demo seed has no quiz survey**, so
  `quiz_leaderboard` is CHECKED but its screen is not photographable.
- **V1-6 / D102:** the demo seed reaches only states the current code creates.

---

## PART 2 — PROD DIVERGENCE (Q103)

**This is the size of the single action being authorised, and it grows with every phase.**

Prod's state is not guessed: it was **fingerprinted** on 2026-09-08
(`docs/OPERATIONS.md:551-560`) — eight catalogue hashes, all matching a clean local build of
`0001–0057 + 0059`. That is the last thing anyone verified about `heituva-prod`.

*Command:*
```
python3 - <<'PY'
import os, re
byn = {int(re.match(r'^\d{10}(\d{4})_', f).group(1)): f for f in sorted(os.listdir('supabase/migrations'))}
prod = set(range(1, 58)) | {59}
print(len([n for n in byn if n not in prod]))
PY
→ 30
```

### 2.1 THIRTY MIGRATIONS STAND UNAPPLIED — `M:0058`, `M:0060`–`M:0088`

### 2.2 What is therefore ABSENT from prod, named

| Capability | Migrations | Prod today |
|---|---|---|
| **Segments and group provenance** | `M:0058` | No `segments`, no `segment_fields`, no `groups.kind`/`source`/`synced_at`. Målgrupper's segment half cannot run |
| **The reservation machinery (GDPR art. 21)** | `M:0060`, `M:0061` | **No `suppressions` table.** An objection cannot be recorded, and `send_round` has no suppression guard — **prod can send to someone who has objected, because the mechanism that stops it is not there** |
| **Tasks / Oppgaver** | `M:0062`–`M:0067`, `M:0069` | No `tasks`, no `task_kinds`, no `task_effect_assessments`, no close guard. The statutory task register does not exist |
| **Round freeze on close** | `M:0068` | **`close_round` and the scheduled closers do not snapshot.** V2-5's finding — «Summerte tall beholdes» is false on prod today, and `apply_retention` would destroy a closed round's aggregates |
| **Blind-spot tasks** | `M:0070`–`M:0072` | Not generated; `send_round` does not fire them |
| **Help centre** | `M:0073`, `M:0074` | No `help_articles`, no `support_messages`. `/hjelp` has no data |
| **Test mode** | `M:0075`–`M:0078` | No dry run; no `is_test`; **the scheduler still copies a preview forward** |
| **Live** | `M:0079`–`M:0084` | No `live_sessions`, no voucher, no `live_cloud` |
| **Quiz** | `M:0085`–`M:0088` | No answer key, no `quiz_leaderboard`, no `run_mode` at all |

### 2.3 The two that are not features

- **`M:0068`** is a **data-loss repair**, not a feature: it is the one migration in this list
  whose absence destroys information that already exists on prod.
- **`M:0060`/`M:0061`** are a **legal obligation**, not a feature: art. 21 is a right, and the
  code that honours it is not deployed.

### 2.4 The standing limitation this sits inside

**Every gate reads local. Nothing has ever read prod** (`docs/v1/06-closeout.md § 3`). Six
phases of green CI said nothing about `heituva-prod` and could not have. The fingerprint
procedure closes the *drift* half at apply time; **between applies, nothing watches prod at
all.** Recorded, not solved, and it is the reason § 2.1's number had to be derived from a
document rather than from the database.

**And this environment cannot read prod either** — no Supabase credentials are present
(`env | grep -c SUPABASE` → 0), which is why § 2.1 is computed from the ledger. **Anyone
applying these thirty must re-run the fingerprint rather than trusting this count.**

---

## PART 3 — LAUNCH READINESS (not engineering)

| # | Item | Owner | What unblocks it | Source |
|---|---|---|---|---|
| 1 | **PITR not enabled** | Tor (Supabase dashboard) | A paid tier and a click. **First item on the gate — before the first real send** | `OPERATIONS.md:175` |
| 2 | **Leaked-password protection off** | Tor | Dashboard → Authentication → Passwords | `OPERATIONS.md:126` |
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

## HOLD

This document sequences nothing. Every number above has its command beside it, and the three
corrections in § 1.1 are the reason it was walked rather than transcribed.
