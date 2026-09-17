# WHAT IS LEFT — measured 2026-09-17, after V7-5

Tor: *«Tell me what is left across the whole project, measured rather than remembered — what the
drawing draws and the product does not have, what a decision refuses, and what is neither. I will
sequence from that.»*

**Every number here carries the command that re-derives it.** Where a claim is a reading rather than
a measurement it says so. The three buckets are § 3 (the drawing draws it, we do not have it),
§ 4 (a decision refuses it) and § 5 (neither — the sequencing list).

---

## 0. THE METHOD, AND ITS ONE HONEST LIMIT

Four derivations, in this order, because each one bounds the next:

```bash
# A — what the product has
find app -name page.tsx | sed 's|/page.tsx||; s|^app||' | sort          # 40 routes
find app -name route.ts | sed 's|/route.ts||; s|^app||' | sort          # 6 handlers

# B — what v7 draws, at screen level
grep -o 'st\.screen === "[a-z]*"' <v7 bundle> | sort -u                 # 15 screens

# C — what v7 draws, at SECTION level: its heading-like strings per screen,
#     checked against every shipped Norwegian string
#     (display = a Playfair span; eyebrow = an uppercase label)
#     -> 170 headings, 34 with no counterpart in messages/no.json

# D — what the product refuses IN WORDS, from the shipped copy itself
#     keys or values matching refus|defer|unbuilt|unavailable|ikke bygget|
#     vi (lagrer|viser|sender) ikke|tegningen
#     -> 42 strings
```

**The limit, stated because it decides how much this document is worth.** C works at the grain of a
SECTION HEADING. A control with no heading — a chip, a select, a sort order — does not appear in it,
and a heading we render with different wording appears as missing until somebody reads it (10 of the
34 did). So this is a complete inventory of *sections*, and a sample of *controls*. It is the grain
Tor sequences at; it is not a proof that nothing smaller is missing. The per-screen fidelity pass
(`docs/fidelity/01-per-screen.md`) is the finer-grained document and it is older.

---

## 1. SCREENS: EVERY SCREEN v7 DRAWS EXISTS IN THE PRODUCT

15 of 15. This is the strongest single statement in the document, so it is first.

| v7 screen | our route |
|---|---|
| `dash` | `/oversikt` |
| `dashboard` | `/dashboard` |
| `surveys` | `/undersokelser` |
| `svdetail` | the eight survey tabs (`/sporsmal` … `/historikk`) |
| `build` | `/undersokelser/[id]/bygg` |
| `send` | `/undersokelser/[id]/send` |
| `results` | `/undersokelser/[id]/resultater` |
| `livestage` | `/undersokelser/[id]/live` |
| `respond` | `/s/[token]` |
| `reports` | `/rapporter` |
| `library` | `/bibliotek` |
| `tasks` | `/oppgaver` |
| `admin` | `/administrasjon` + 9 tabs |
| `profile` | `/profil` |
| `help` | `/hjelp` |

**So nothing that is left is a missing screen.** Everything below is a section, a control, a
behaviour or an operational item.

---

## 2. THE DATABASE IS IN STEP, AND IT WAS NOT AN HOUR AGO

Measured by FINGERPRINT rather than by probe, because the distance was not asserted by anyone:

| | local | prod, before | prod, after |
|---|---|---|---|
| RLS-table set md5 | `26377100…` | `f204212d…` | **`26377100…`** |
| `public` tables | 66 | 65 | **66** |
| SECURITY DEFINER in `public` md5 | `3b891b94…` | `3b891b94…` | `3b891b94…` |
| `app` functions | 76 | 75 | **76** |
| last migration | `20260917000128` | `20260916134956` | `20260917202934` |

Production was **exactly M:0127 + M:0128 behind** — V7-3's two migrations — confirmed by object
(`survey_blocks` absent, no `app.*flow*` function, no `survey-media` bucket). Both applied through
the Supabase MCP and then **compared**, not trusted: bucket 1, media policies 4, flow triggers 3,
and `app.run_due_schedules` now carries its emptiness guard and reads `survey_blocks`.

**That closed a live hole rather than a cosmetic gap.** Until this apply, nothing in production
stopped the silent pg_cron job from opening a round on a survey with zero questions and mailing
every recipient a link to it. `send_round` has refused that since Phase 3; `run_due_schedules` never
did.

**And the probe that verified it was wrong first.** My first check looked for the string
`no_questions` in `run_due_schedules` and returned `false` — the guard there is
`jsonb_array_length(v_qs) = 0` and returns no such error. The thing measured was not the thing
claimed, caught by reading the result instead of accepting it.

---

## 3. THE DRAWING DRAWS IT AND WE DO NOT HAVE IT

**One section, from 170.** Everything else in derivation C either ships, ships under other wording,
or is refused with a reason.

| what | where | what it is |
|---|---|---|
| **«Anslått lengde»** | v7:1552, the survey detail | `sd.lint.duration` + `sd.lint.durationWarn` — an estimated-length card with a warning, on the READ view. We compute `estimatedMinutes` in the builder and in the preview; the survey detail does not show it. Small: one card, one existing derivation, no schema. |

**Ten of the 34 read as missing and are not** — they ship under different wording, which is what
derivation C cannot see on its own. Recorded so the next reader does not re-raise them:
«Velg fra målgruppene» is `send.orGroups`; «Spørsmål for spørsmål» is `/sporsmal`'s table with
`qColAvg`; «Metodikksjekk» is `method.title`; «Kanaler», «Kjørte runder», «Inviterte», «Emnefelt»,
«Gjentakende utsending», «Fremdrift per målgruppe» and «Spørsmålsområde» all have shipped
counterparts.

---

## 4. WHAT A DECISION REFUSES — 42 strings, on the screen, in words

Derivation D, and the property worth noticing is that **this product states its refusals to the user
rather than leaving a gap.** Grouped by what the refusal is about:

**Refused because the data does not exist (8)** — `surveys.refuseMatrise` (no theme per question),
`surveys.qNoTheme`, `surveys.refuseLevering` (four of six funnel numbers are not measured),
`surveys.refuseLeveranse` (SPF/DKIM/DMARC describe our setup, not the customer's),
`builder.engageNoEstimate` (no measurements to build a response-rate estimate on),
`admin.mgLawfulBasisUnavailable`, `admin.mgFieldUnavailable`, `integrations.detailRefusal_not_built`.

**Refused because it is a structural promise (4)** — `surveyAudience.dropoffRefused` (we do not show
who has not answered), `respondent`/`live` anonymity notes, `integrations.detailRefusal_self_entered`
(the catalogue does not overwrite what a person wrote about herself),
`integrations.detailRefusal_not_a_trigger`.

**Refused as a product decision (7)** — `integrations.apiUnavailable` («Det er en avgjørelse, ikke en
manglende del»), `surveys.refuseFordeling` and `surveys.refuseFrisvar` (not separate tabs; they live
in the question's own card), `surveys.invNoEmbeddedQuestion`, `surveys.deferBolger` (one reminder,
not four waves), `send.impXlsxRefused`, `builder.quizCertificateUnavailable`.

**Not built yet, and the copy says so (11)** — the four `live.*Unavailable` (fullscreen, closing
screen, audience questions, priority exercise), `admin.mgAuditUnavailable`,
`admin.mgPopulationsUnavailable`, `admin.mgSyncUnavailable`, `admin.errSsoUnavailable`,
`builder.quizInstantUnavailable`, `integrations.unavailableHint`, `surveys.deferSammenlign`.

**Two switches that save and change nothing, and say so (2)** — `admin.oUnread_digest-unbuilt`,
`admin.oUnread_selfserve-unbuilt`. G2/G3's third face, handled by telling the user.

**And the decided-not-built list, which is Tor's and is not derived from copy:** Sitat, Feltarbeid,
the Oversikt tab, Målgruppe's drop-off half, Levering, Leveranse, Segmenter, Tema, the nps card, the
cx workspace, uitest, resume, the thirteen integrations. **Four of § 3's eight original candidates
turned out to be Feltarbeid** — `sd.field.underLine`, `sd.field.breakoff`, `sd.field.dur` and
«Representativitet» are all the same refused surface, which is why § 3 is one row and not five.

---

## 5. NEITHER — the sequencing list

Ordered by size, not by importance. Each row says what it is, what it costs and what it is blocked
on, so the ordering is Tor's rather than mine.

### 5.1 The survey shell card (Q245, D247) — DECIDED, unblocked, unbuilt

The largest remaining visual item, and the specification was changed today to permit it.

- **Scope, measured:** nine of our routes, not four — v7's `isSvDetail` is one screen whose twelve
  pills are our eight tab ROUTES, plus `/bygg`.
- **We already have the header half:** `SurveyContextBar` renders a bordered `--sf` card on all nine
  routes today, above the body. The change is joining the two — one component gains a body slot,
  nine pages pass children instead of a sibling.
- **The sub-1280px answer is pre-decided:** the body's side padding collapses to the page gutter
  below `md`, because 22px each side costs 44px of content width at 320px on the tightest screens
  in the product.
- **The risk is a `verify:responsive` fix pass across nine routes**, which is why V7-5 did not take
  it as a tail item.

### 5.2 «Anslått lengde» on the survey detail — § 3's one row

One card, one existing derivation. The smallest real item on this list.

### 5.3 Three feature flags with no reader at all

`grep -rl '<flag>' app/ lib/ components/`: **`ai_insights`, `ai_translate` and `stripe_billing`
appear in `lib/flags.ts` and nowhere else.** That is D208's second face — a control whose state
nothing reads — three instances, in a registry whose whole point is that a flag gates something.
Either they gate something or they are not flags yet. `lib/org/options.ts` is the shape that answers
this per key; the flag registry has no equivalent.

### 5.4 Leaked-password protection is off

`get_advisors(security)` on production: `auth_leaked_password_protection`, WARN. One setting in the
Auth dashboard, checked against HaveIBeenPwned. The only NEW advisor finding in the whole set — the
other 53 are the standing by-design ones (four `rls_enabled_no_policy` on `answers`, `responses`,
`demo_requests`, `entra_connections`; `pg_net` in `public`; and the 48 definer-executable warnings
that are 5a3's own subject, allowlisted with reasons).

### 5.5 Entra SSO — the login half

I2 built the PULL (directory sync, `entra_connections`, the worker). `admin.errSsoUnavailable` says
the login half is not there: «Entra ID er ikke satt opp for HeiTuva ennå, så pålogging kan ikke
kreve det.» `sso_exempt` and `ssoRequired` exist and are read, so the plumbing is waiting for the
provider. Phase 6's item, and the one that is a real capability rather than a screen.

### 5.6 The benchmark comparison has no reachable state

Q134 removed the seed's invented industry figures; V7-5 removed the two rows a test was leaking into
the global table (D245). **So `benchmarks` is empty everywhere, the comparison never renders, and
the manifest state that photographed it is gone.** Not a defect — Q134's honest consequence — but it
means the feature is unexercised until real sourced figures exist, which is a content decision.

### 5.7 The frozen apparatus — four items logged for whoever unfreezes it

Not work on the product, and each one is a gate that cannot see something:

| item | what it cannot see |
|---|---|
| **D190** | No gate reads an HTTP status. A 500 at the right URL scores as a pass on `verify:i18n` and PERFECTLY on `verify:responsive`. |
| **D168** | 5a3 probes every RLS table with `select id from … where org_id = …`; «every org-scoped table has an `id`» was an enumeration of the forty that existed. |
| **D242** | `verify:reference` asserts that two SCREENS differ; it never renders one screen twice, so four of the 35 v7 baselines are not reproducible and the gate cannot say so. |
| **D243** | Every `artifacts/reference-*` baseline is the drawing in FALLBACK FONTS — the bundle's webfonts fail TLS in this container and `document.fonts.ready` is vacuous with no `@font-face` to load. |

### 5.8 Two production facts that are open checks rather than settled

- **`survey_invitations.sent_at` means ACCEPTED BY THE PROVIDER, not delivered** (D133). This
  account has no Brevo webhooks, so there is no delivered event and `bounced_at` has no writer at
  all. A column with no writer, known and recorded.
- **Whether Brevo keeps the EU/EØS promise** Q6 chose Stockholm for. An open check, not a settled
  fact, and it is a claim the privacy notice makes.
- **`personvern@heituva.no` in `legal.privacy6P` and `legal.privacy8P`.** The production origin is
  `www.heituva.com`; that mailbox is the mock's guess. Left untouched deliberately until a
  replacement is confirmed to RECEIVE — a `.com` that bounces is worse than a `.no` that is at least
  someone's inbox — but it is a contact address in a privacy notice, which makes it the sharpest
  open item in this section.

---

## 6. WHAT THIS DOCUMENT DOES NOT COVER

Said plainly, because a list that looks complete is worse than one that says where it stops:

- **Controls without headings.** See § 0's limit.
- **The seven bundles before v7.** Derivation C was run against v7 only. `docs/v2/00-diff.md § 0.3`
  governs which surface is judged against which bundle, and a v6-governed screen's unbuilt sections
  would not appear here. The four v7 screens carrying the shell card are also the four the governance
  table points at v7, so § 5.1 is safe; a v4-governed screen is not covered.
- **Copy fidelity.** The claim-set sweep is per bundle and per phase, not in this document.
- **Anything about phases 0–5's correctness.** This is an inventory of what is absent, not an audit
  of what is present.
