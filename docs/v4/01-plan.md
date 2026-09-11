# W0–W3 — the workspace, scoped against the installed bundle

Written after v4 was installed and its sweep answered (Q119–Q121). Everything below is measured
against `design-reference-v4/…/HeiTuva.dc.html` (`85c0ce00`, 7172 lines) and the current schema, not
against a description of either.

**Four phases, database first**, the order C0–C5 used and for the same reason: the phase that
decides who may see what is the phase that must be built and tested before anything renders.

---

## The three open questions, raised before any of it is built

**All three are now ANSWERED (Tor, 2026-09-11) and promoted to `DECISIONS.md`.** They are kept here
with their full reasoning because a plan that records only the answer loses why the alternatives were
rejected, and the rejected alternative is what a later phase reaches for.

### Q122 — where does the workspace selection LIVE? — **ANSWERED: cookie + column**

**The bundle does both.** `ORG_WORKSPACE = "hr"` is an organisation default (`V4:4441`); every read
site is `st.workspace || ORG_WORKSPACE`; and the setter writes
`localStorage.setItem("heituva.workspace", v)` (`V4:6059`). The Tilpasset hint says so out loud:
«Valget huskes på denne enheten.»

**The consequence we cannot avoid deciding.** Oversikt is a server component, and `wsShow.*` decides
which modules it renders. A `localStorage` value is not available at server render, so:

- **(a) column on `organizations` + column on `org_members`** — org default, per-person override.
  Server-rendered correctly, first paint right, survives a device change. **Costs:** the copy «på
  denne enheten» becomes false and must change, and it is a migration with a writer
  (the standing question: a server action, added in the same phase, with a test asserting it exists).
- **(b) `localStorage` only** — matches the bundle exactly, no migration. **Costs:** Oversikt renders
  the org default and then swaps on hydration — a visible flash of the wrong modules on every load —
  or Oversikt becomes a client component, which is a bigger change than the feature.
- **(c) cookie** — readable at server render, per-device, no migration. Matches «på denne enheten»
  honestly and paints right the first time. **Costs:** it is not in the bundle, so it is an invention
  in the mechanism (not in the UI), and it needs a `DEVIATIONS.md` line.

**ANSWERED (Tor): (c) for the per-device choice, (a) for the ORG DEFAULT.** A cookie remembers what
this person chose on this device; `organizations.workspace` decides what a new person sees. A
`DEVIATIONS.md` line records the cookie, **because the mechanism is not in the bundle and that must
be visible.**

Tor's reasoning narrows it further than «recommendation»: **«Oversikt is a server component, so
`localStorage` cannot reach the render that needs it: that is not a preference between mechanisms,
it is one of them not working.»** And (c) is the only option of the three **where the copy does not
also have to change** — «på denne enheten» stays true of a cookie and becomes false of a column.

### Q123 — v4 reverts C4's nav label — **ANSWERED: DO NOT REVERT**

**Measured, not inferred:**

```
v3:4965   ["tasks","Oppgaver og tilbakemeldinger"]
v4:5095   ["tasks","Oppgaver"]
```

and `messages/no.json:37` ships `"tasks": "Oppgaver og tilbakemeldinger"` today, because C4 built
it from v3's drawing.

**This is the radius's shape again** — a property changed away between handoffs, invisible to any
count, and it is the reason the `ws*`-count check was the wrong instrument. It is also a real
governance question rather than a typo, because v4 governs the shell (it restructures the header)
and the nav is the shell.

**A hypothesis, labelled as one:** the header is now `flex-wrap:nowrap` with five pills at 15.5px
plus logo, help button and the Arbeidsflate chip, where v3's nav was `flex-wrap:wrap` at 13px. A
28-character nav label may simply not fit the new row. If that is the reason, the shortening is a
consequence of the header restructure and should be adopted with it — but I have not measured the
overflow, and I am not going to assert a cause I have not.

**ANSWERED (Tor): keep «Oppgaver og tilbakemeldinger».** And the hypothesis being *probably right*
is what settles it against the revert, not for it: **«it is a LAYOUT decision wearing a NAMING
decision's clothes.»** The surface is what C4 built — tasks and feedback in one list with a filter —
so «Oppgaver» is untrue of half the content, and reverting **solves a space problem by promising
less than the page does.**

**If space is the problem, solve the space** — a shorter word, a smaller size, `flex-wrap` restored.
**W1 measures the overflow first.** Naming the cause as a hypothesis rather than asserting it was
the right order and the measurement is still owed.

### Q124 — «Dashboard følger oppsettet «Arbeidsmiljø»» — **ANSWERED, and it needed no database**

`WORKSPACES[].layout` is a string — `"Arbeidsmiljø"`, `"Kundeopplevelse"`, `"Medlem og frivillig"`,
and `null` for Tilpasset, which renders «Dashboard beholder ditt eget oppsett» (`V4:6063-6064`).

**ANSWERED (Tor): bind by id, and measure whether the preset exists. Both halves are now measured,
and my framing of the question was wrong in two ways.**

**First correction — it did not need a database.** I said it was a W-phase item because measuring it
needed a running stack. It did not: `dashboard_presets` is a SHIPPED registry, seeded by
`M:0047:161`, so the rows are readable in the migration. Measured there:

| bundle's `layout` | shipped row |
|---|---|
| «Arbeidsmiljø» | `('arbeidsmiljo', 'Arbeidsmiljø')` |
| «Kundeopplevelse» | `('kundeopplevelse', 'Kundeopplevelse')` |
| «Medlem og frivillig» | `('medlem', 'Medlem og frivillig')` |
| `null` (Tilpasset) | — renders the other sentence |

**All three exist.** The sentence does not promise a layout that is not there, so the
never-fabricate rule is satisfied rather than at risk, and **the sentence is not blocked.**

**Second correction — the title I worried about is on the wrong table.** I cited
`dashboard_layouts`' editable-title CHECK. The preset the workspace points at is in
`dashboard_presets`, the shipped registry that 5a3 allowlists because it carries no org id — so it
is not customer-editable at all, and the rename I was guarding against cannot happen from the
product.

**So the binding is trivial and has an exact precedent one migration away**:
`use_cases.preset_key text references public.dashboard_presets(key) on delete set null`
(`M:0049:22`), added for the same reason — «a dangling one would give the card a button that loads
nothing». The workspace registry takes the identical column. **Bind by `key`, render
`dashboard_presets.title` from the joined row**, so the displayed word stays correct by
construction rather than by being copied.

## W0 — the model, and nothing that renders

Depends on Q122. Builds:

- `organizations.workspace` (the org default; today `ORG_WORKSPACE = "hr"` is a constant in a
  prototype). **Who writes it?** Administrasjon → Firma, a server action added in this phase, with a
  test asserting the action exists and writes the validated column — the `writesValidatedColumn`
  helper already exists for exactly this.
- The workspace **registry as data**, not as a constant: four rows carrying key, label, short, tint,
  dot, `person`/`personDef`/`persons`, `lifts` and `modules`. Data-not-code: «adding a pack/duty/
  language is a migration or a row, not a component», and a workspace is the same kind of thing.
  RLS on the new table in the same migration; it is a shipped registry carrying no org id, no
  survey id and no number, so it is the `use_cases` allowlist case — **and CHECKED against that
  reason the way `use_cases` and `segment_fields` are, not trusted.**
- The per-person selection, in whatever Q122 decides.

**Negative tests first, proven failing before the schema exists** — the C1 discipline, with D158's
correction applied: every assertion must be proven non-vacuous first, because four of C1's negative
tests passed against a database with none of the feature.

**5a3 and the census move or the phase has not closed.** One new RLS table ⇒ the denominator rises;
the table is CHECKED or it is allowlisted with a reason whose every clause has a test.

## W1 — the shell: the header, the nav pills, the Arbeidsflate chip

`V4:160-215`. Pure v4-governed fidelity, and the largest visual change since V2-0:

- header `flex-wrap:nowrap`, padding `12px 14px 12px 18px`, `box-shadow:0 6px 20px rgba(25,21,16,.05)`
- nav items become pills: `padding:9px 13px`, `border-radius:10px`, **13px → 15.5px**, active
  `background:var(--sbg)`, hover `var(--sf2)`
- the wide toggle and the language `<select>` **leave the header row**; where they go is drawn and
  must be read off the file before building, not guessed
- the Arbeidsflate chip: 34px tall, colour dot, `{{ wsShort }}`, and the tooltip **as Q119 settled
  it — two clauses, not three**
- `border-radius:16px` on the frame is **unchanged**; the pill header was an intermediate handoff
  (`194c8389`) and was reverted

**Responsive is the risk here, and the gate has earned the right to be run first.** A `nowrap` row
with five pills, a logo, a help button and a chip at 390px is precisely the arithmetic
`verify:responsive` caught twice. Run it before claiming the phase, not at the end.

Q123 is decided here or the phase cannot close.

## W2 — Oversikt's modules become conditional

`V4:272-485`, `wsShow.{action,activity,duties,loop,nps,quiz,rowA,rowB}` in two rows, plus
`wsEmpty` — «Ingen moduler er valgt» / «Slå på minst én modul i raden over, eller bytt til en ferdig
arbeidsflate i toppmenyen.»

Six modules (`WS_MODULES`), and **the Tilpasset workspace lets a person pick them**, which is the
second piece of per-person state Q122 governs.

**Nothing here may fabricate.** A module whose data does not exist yet renders the design's empty
treatment, not a zero.

## W3 — the vocabulary, the template sort, and the layout note

- **The vocabulary** — `wsPerson`/`wsPersonDef`/`wsPersons`/`wsPersonsCap` at four measured sites:
  a preview label (`V4:1024`), Oppgaver (`:2288`), Administrasjon → Språk (`:3021`), the send
  screen's heading (`:3218`).
  **BOUND BY THE STANDING CONSTRAINT NOW BESIDE SECURITY INVARIANT 3**: no per-organisation value
  reaches `/s/[token]`, a report share link or the splash. Measured today: zero `ws*` in v4's
  respondent region. A test asserts it stays zero — the constraint is cheap to state and cheap to
  check, and vocabulary switching feels like an improvement everywhere, which is exactly why.
  Every string goes through `ui_messages` with the word as an ICU argument; **a per-workspace
  sentence is not a new hard-coded string.**
- **Template sorting** — `lifts` ranks `PACKS` by `useOf(k)`, which is a **`use_cases` key**
  (V1-5, Q24/Q45). A registry-to-registry binding, and the phase asserts the mapping is total the
  way V1-5's did.
- **The layout note** — Q124.

---

## What is NOT in this plan, deliberately

- **Anything the sweep answered NO to.** No «setter standardvalg» clause (Q119), no external
  customer reference (Q120), no «Fire alternativer» (Q121).
- **Per-surface governance rows in `docs/v2/00-diff.md § 0.3c`.** They get written as each phase
  touches a screen, not now. v4's file draws the whole app; drawing is not governance.
- **`cad82fcd` and `6b3a6e4b`.** Still unverified; they never reached the session. If one of them
  carries something `__3_` dropped, it is a Q52 question before it is a planning one.

## One thing outside the plan that is now overdue

**Production is four migrations behind** — `M:0099`–`M:0102`, the whole C-tranche. It is on `main`
and it is not in the database. Every gate is green against a local stack that has them. This is
the shape CLAUDE.md lists six times: green for something that structurally could not be seen.
Deploying to production is a decision, so it is stated here rather than taken.
