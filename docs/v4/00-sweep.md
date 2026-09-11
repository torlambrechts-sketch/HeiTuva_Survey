# v4 — the security-copy sweep over the bundle's prose

CLAUDE.md's add-a-bundle checklist, step 7. **Once per bundle, not once.** A bundle's copy is a
CLAIM SET; every claim about who can see what, what is kept, what is merged, or how many of a
thing there are is a promise the running product either honours or does not. Nothing mechanical
protects prose.

**Every note below names which system it is describing.** «The bundle draws X; we render Y» is two
clauses and cannot be misread — the rule added after `docs/v2/06-remainder.md` manufactured a
defect in `quizPreview` that did not exist.

Method: `diff v3 v4`, take the added lines, extract prose, check each claim against the schema and
the shipped code. v4's prose that v3 already had is not re-swept — C0 did that.

## Hosts, URLs, contact addresses — CLEAN

Measured: the set of hosts, URLs and email addresses in v4 is **identical to v3's**. No new one
arrived. Every address is a `nordiskstudio.no` / `nordisk.no` / `bedrift.no` demo fixture; there is
no `heituva.no` anywhere in this bundle and no contact address that would reach a real mailbox.
Nothing to fix and nothing to carry.

## Findings

### 1. «setter standardvalg for nye undersøkelser» collides with the statutory lock — REAL

**The bundle draws** a header tooltip on the Arbeidsflate chip (`V4:181`):
«Arbeidsflate — velger hvilke moduler Oversikt viser, sorterer maler og setter standardvalg for
nye undersøkelser.» Three claims; the third is the one that bites.

**We render** `M:0032` (`20260904000032_threshold_policy.sql:96`): *«A statutory pack's policy is
applied to a NEW survey, and locks it.»* A statutory pack is already a writer of a new survey's
settings, and its write is a LOCK, not a default.

So on the **HR og arbeidsmiljø** workspace — the one whose whole purpose is «lovpålagte frister …
oppgaver med hjemmel først» — a manager who picks a statutory pack gets the pack's policy and
**not** the workspace's defaults, silently. The tooltip promises a behaviour that is overridden in
precisely the case the workspace exists for.

This is not a defect in either system. It is an unresolved ORDER between two writers of the same
columns, and it must be decided before a W-phase builds the chip — a decision for the plan, with
the tooltip's wording following the decision rather than the other way round. Candidates: the
workspace default applies only where no pack policy exists; or the tooltip says «for nye
undersøkelser uten lovpålagt mal». **Do not build the tooltip as drawn.**

### 2. «Kunde 3307 · sak #2291» is a re-identification handle on a comment row — REAL, and the sharpest

**The bundle draws** feedback rows in the Kunder-og-service workspace labelled
«Kunde 3307 · levering 8. sep», «Kunde 4812 · sak #2291», «Kunde 5120 · sak #2288».

**We render** `survey_comments` with exactly four reference columns — `id`, `round_id`,
`question_id`, `invitation_id` — and **no external reference of any kind.** Grep for
`external_ref|external_id|case_ref` across the migrations returns nothing on invitations or
members either.

Two separate things, and both matter:

- **Who writes this column?** Nothing does, because it does not exist. Building the row as drawn
  means adding a column, and CLAUDE.md's standing question applies in the migration that adds it.
- **It is a linkage, and it is stronger than the one Q113 already paid for.** Q113 accepted that a
  comment carries `invitation_id` — «the thread is the link» — and wrote down what it costs: a
  comment is attributable to its author by whoever holds the database. A case number rendered
  **on screen beside the comment text** moves that from «whoever holds the database» to «whoever
  can read the Tilbakemeldinger list», which is every `redaktor`. That is a different promise, and
  it is not the one Q113 took.

**Stop-and-ask, not a default.** This one is on the list for the plan with the reasoning above, not
something to take on my own classification: taking the default here would build something Tor might
want unbuilt.

### 3. «Fire alternativer» is a demo quiz's shape, not the product's — WATCH

**The bundle draws**, on the quiz workspace's Oversikt card: «Fire alternativer med farge og ikon,
nedtelling og resultattavle på storskjerm.»

**We render** `M:0085:20` — `quizzable` is `choice | yesno | dropdown`. A `yesno` quiz has **two**
options. The bundle's sentence describes the particular quiz in its fixture, and as a module label
it would be false for any yesno quiz.

Not a defect in the bundle; a trap for the phase that copies the sentence into `ui_messages`. The
label must not assert a count. Same shape as row 2 of CLAUDE.md's enumeration table
(«nothing in this string asserts a fixed number»), and `verify:copy` will catch it if the numeral
is written in Norwegian — «fire» is in that gate's list.

### 4. «Valget huskes på denne enheten» — ACCURATE, with a consequence

**The bundle draws** the Tilpasset workspace's hint: «Velg modulene du vil se. Valget huskes på
denne enheten», and implements it at `V4:4682` with
`localStorage.getItem("heituva.workspace")`.

**We would render** Oversikt as a server component. A per-device `localStorage` value cannot reach
a server render, so the modules would flash the org default and then swap — or the workspace has to
be a column and the copy «på denne enheten» becomes false. The sentence is honest about what the
prototype does; it is a design decision for the plan, not a false claim.

`ORG_WORKSPACE = "hr"` (`V4:4441`) implies an organisation-level default underneath the per-device
override. That is a column, and the standing question applies to it.

### 5. Claims that are TRUE against the running product — checked, not assumed

- **«Kritikere (0–6)» / «Ambassadører (9–10)»** — matches our eNPS exactly: *«promoters (9-10)
  minus detractors (0-6)»*, in `M:0001`, `M:0032` and `M:0042`. The bands agree.
- **«Dashboard beholder ditt eget oppsett» / «Dashboard følger oppsettet «…»»** — `dashboard_layouts`
  (`M:0046:36-42`) carries a nullable `user_id`: NULL is an organisation preset, non-null is one
  person's saved setup. Both halves of the copy are supportable.
- **«Deltakerne bruker mobilen, uten app»** — `/s/[token]` is a web page. True.
- **«resultattavle»** — `quiz_leaderboard` exists (`M:0086`) and is a CHECKED 5a3 surface.

### 6. The vocabulary does not reach the respondent — CHECKED, and it is the one that would have mattered

`wsPerson` / `wsPersonDef` / `wsPersons` / `wsPersonsCap` substitute «ansatt / kunde / deltaker /
respondent» across the app. Measured: **zero `ws*` identifiers anywhere in v4's `/s/[token]`
region.** Every substitution site is manager-facing — a preview label (`V4:1024`), Oppgaver
(`:2288`), Administrasjon → Språk (`:3021`), the send screen's heading (`:3218`).

That is the right answer and worth recording as a positive result rather than as silence: a
per-organisation word for the respondent, rendered on the respondent's own screen, would be a
fingerprint on an anonymous surface. It is not there, and a W-phase must not put it there.
