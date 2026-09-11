# v3 — the plan: communication on every survey

Derived from `00-diff.md` (measured) and `01-decisions.md` (Q111–Q113 taken, **Q114 open**).
Same constraints as B0–B3. **Database before UI, and here that is not a formality: the comment
table and the token capability ARE the feature's security boundary.**

Six phases. Each closable in one verification pass and one fix pass.

## Constraints

- **Database before UI**, always. C0 and C1 are the database half and nothing in C2+ starts until
  both close.
- Any phase touching an aggregate path carries the **two-sided catalogue-derived `k_for`
  assertion**. **C1 carries a second sweep of the same shape**: no SECURITY DEFINER function reads
  the comment table (Q112).
- No phase builds a screen absent from a bundle.
- Anything already built is a **fidelity check**, not a rebuild.
- Any phase introducing a screen with no seedable state **extends the demo seed in the same phase**.
- The apparatus stays frozen. A check the gates cannot make is logged as a limit.
- Docker is unavailable here, so **every visual half is UNVERIFIED** with the reason, and the
  database half is CI's.
- **Q114 is not assumed in either direction.** No phase builds a `feedbackMode` pack lock, and no
  phase makes one hard to add: C1 puts `feedback_mode` on `surveys` beside the columns the pack
  policy already governs, so a lock is a guard and a policy key, not a migration of the model.

## Starting numbers

| | value | re-derive |
|---|---|---|
| census | **1040 across 75 files** | `node -e 'const c=require("./tests/expected-counts.json");console.log(Object.keys(c).length,Object.values(c).reduce((a,b)=>a+b))'` |
| 5a3 | **67 of 92** | `npm run verify:policy 2>&1 \| grep -cE '^  (ok\|NO DATA)'` against `grep -E 'enumerated'` |

**5a3 moves in this plan, and that is the point.** C1 adds an RLS table and at least one SECURITY
DEFINER function; both must land CHECKED, not allowlisted.

---

# C0 — Install the bundle, and sweep its copy

**Depends on:** nothing. **No database.**

### Scope
The seven-item ADDING A BUNDLE checklist, in full: `scripts/verify/reference.ts` `BUNDLES` entry
with `only:` on screens the older bundles lack; `.gitignore` allowlist line; `.eslintignore` line;
`CLAUDE.md` + `VERIFY.md` paths; the `docs/v2/00-diff.md § 0.3` governance rows; **commit the
rendered directory and check `git status artifacts/`**; and the security-copy sweep.

### The sweep is the phase, not a step in it
`00-diff.md § 4.1` already found one: «respondenten ser svaret ved neste innlogging», in the
**builder-facing** mode description. That is one sentence found while measuring structure. The
sweep reads every promise-shaped sentence in 254 new lines against the running database — who can
see what, what is kept, what is merged, how many roles.

### Explicitly NOT in it
No schema. No UI. No governance change for screens v3 does not touch.

### Numbers
Census unchanged. 5a3 unchanged. Three baselines re-render; expect `uid()` noise (D143) and commit
only what moved for a real reason.

---

# C1 — The comment table and the token capability

**Depends on:** Q111, Q112, Q113. **This is the database half and it is the whole security story.**

### Order inside the phase
1. **Negative tests first, proven failing.** All five of Q111's, plus Q112's catalogue sweep and
   Q113's association test. They fail because nothing exists yet — that is the point.
2. The table, its RLS, and the `submit_response` change that writes comments in the same
   transaction as the response.
3. The read capability.

### The table
`survey_comments` — outside the answers vault, its own RLS, org-scoped via the round.
Carries the comment, its optional `question_id`, whether it is anonymous, the `invitation_id` that
scopes the thread, and the manager `replies` (own table or jsonb — decided in the phase, from
whether a reply needs its own RLS).

**«Who writes this column?» is answered in the migration for every column added**, in writing,
beside the column. `handled` and `tag` are the two most likely to arrive without a writer, because
both are manager-facing and both are easy to read before anything sets them.

### The two sweeps
- **`k_for`, two-sided** — nothing calls the old constant; everything reading the vault calls it.
- **No SECURITY DEFINER function reads `survey_comments`** — catalogue-derived over `pg_proc`, so
  the next aggregate that touches it fails in the commit that adds it, not in review.

### Explicitly NOT in it
No UI. No reply *sending*. No Oppgaver surface. No `feedbackMode` pack lock (Q114).

### Numbers
Census **+~26** (five token tests, the catalogue sweep, the association test, RLS per role, the
writer assertions). 5a3 **67 of 92 → 68 of 93 at least**: `survey_comments` is a new RLS table and
must be **CHECKED**, not allowlisted; the read RPC is a new SECURITY DEFINER function and is
CHECKED too. **If either lands allowlisted, the phase has not closed.**

---

# C2 — `feedback_mode` on the survey, and the builder control

**Depends on:** C1. **Database first: the column, its CHECK, its writer.**

### Scope
`surveys.feedback_mode` with the four values; the Kjøremodus-adjacent control in the Builder
(`feedbackModes`, four cards); the mode's effect on what the respondent surface will render.

**The default is `anonymous` and every existing survey inherits it** (`00-diff.md § 3`). The
migration states that explicitly and the phase reports how many live surveys it turns on.

### Fidelity
Built to the bundle's four cards. **The `anonymous` description is corrected, not copied** — «neste
innlogging» is false against the product (Q111) and against the sweep's rule.

### RESPONSIVE.md
**§ Tab rails and chip groups** for the mode cards — and **count the tabs**, per the note that
section now carries after «three buttons» was wrong.

### Numbers
Census +~10. 5a3 unchanged — a column and a CHECK are neither surface.

---

# C3 — The respondent surface: the promise, then the comment

**Depends on:** C1, C2. **Q112's sentence ships in this phase or the phase does not close.**

### Scope
`qcClosed` / `qcOpen` / `qcSaved` per question; `fbNotSent` / `fbSent` for the end-of-survey box;
`fbChoosable` / `fbFixedNote` for the mode's treatment; **and Q113's one-choice-per-submission**,
which is where the bundle is overridden.

### The copy is the deliverable
> «Kommentaren leses som den står. Den kobles ikke til navnet ditt, men den vises ikke sammen med
> andres svar.»

Not the anonymity banner's wording, and the phase asserts the two are different strings — because
the cheap failure here is reuse.

### RESPONSIVE.md
**Respondent surfaces are mobile-first pixel-perfect at 380–420px**, which is a stricter bar than
the app's. The comment editor is a new control on the narrowest screen in the product.

### Explicitly NOT in it
Reading the reply. That is C5, and it needs the capability to be proven first.

### Numbers
Census +~14. 5a3 unchanged.

---

# C4 — Oppgaver og tilbakemeldinger: one surface, one filter

**Depends on:** C1. Independent of C3 — **can run in parallel if someone wants it to.**

### Scope
`tfTabs` (`Alt` / `Oppgaver` / `Tilbakemeldinger`), `showTasks` / `showFeedback`, the feedback row
with `fb.hasQuestion` / `fb.hasReplies`, `tag` and `handled`, and the nav label change to
**«Oppgaver og tilbakemeldinger»**.

### Seed, in the same phase
The demo seed carries no comments. This surface is *entirely* comments, so on a bare reset it opens
empty — the shape this project has hit six times. Seeded with both kinds (anonymous and named), with
and without `question`, with and without `replies`, handled and not.

### RESPONSIVE.md
**§ Data tables** — and **count the controls in the feedback row rather than trusting a sentence**,
which is the clause D129 was filed against and S3 broke while quoting it.

### Numbers
Census +~12. 5a3 unchanged.

---

# C5 — The reply, end to end

**Depends on:** C1, C3, C4. **Last, because it is the only part that cannot be verified without the
other four.**

### Scope
The manager's reply; the respondent reading it through the Q111 capability; `fb.replyOpen`.

### What closes it
Not a green gate. **A round trip**: a comment written from `/s/<token>`, a reply written by a
manager, and the reply read back **through the same token**, after submission, with the four
refusals of Q111 still refusing.

### Numbers
Census +~8. 5a3 unchanged if the read RPC from C1 is reused; **if C5 adds a second SECURITY DEFINER
function, it is CHECKED**.

---

## What this plan does not cover

- **Q114.** No phase builds it, and C1's column placement keeps it to a guard plus a policy key.
- **Notifying the respondent that a reply exists.** Email would need `sent_at`'s meaning settled
  (D133/D134, still open) and would put a second credential in an inbox. Out of scope, stated.
- **Anything about how long a comment is kept.** A message from an identified person is
  personopplysninger with a retention question attached; the DSR path already exists and whether
  comments join it is not decided here.
