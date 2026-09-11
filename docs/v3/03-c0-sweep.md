# C0 — the v3 bundle installed, and its copy swept

**Phase:** C0. **Database: none.** **Closes on:** the seven-item ADDING A BUNDLE checklist
done and checked, and the claim-set sweep run over the 254 new lines.

---

## 1. The checklist, item by item, with the check that proves it

| # | Item | Done | The check, not the intent |
|---|---|---|---|
| 1 | `scripts/verify/reference.ts` `BUNDLES` entry | ✅ | `reference.ts:94–101`; run output names `v3 — fourth handoff` |
| 2 | `.gitignore` allowlist line | ✅ | `.gitignore:49`; `git status artifacts/` shows `?? artifacts/reference-v3/` — **checked, not assumed** |
| 3 | `.eslintignore` line | ✅ | `.eslintignore:6` |
| 4 | `CLAUDE.md` + `VERIFY.md` third path | ✅ | `CLAUDE.md § Design fidelity`; `VERIFY.md:73`, `:124` |
| 5 | `docs/v2/00-diff.md § 0.3` governance row | ✅ | new `§ 0.3b`, six rows |
| 6 | **Commit the rendered directory** | ✅ | 35 screens captured, 0 failed; committed in this phase |
| 7 | **Security-copy sweep** | ✅ | § 3 below — **six findings** |

**The bundle is byte-identical to the handoff.** `md5 c6f635891eb75236b54c555778fd2fd4`, checked
after copying rather than before. 6981 lines, 266 added / 12 removed against v2 — re-derived here,
matching `00-diff.md`.

---

## 2. Three things in the harness were enumerations, and v3 broke all three

This is the section that would have been «added a bundle entry» in a less careful phase. None of
the three was a v3 feature; each was a property of bundles written down as the list of bundles that
existed.

### 2.1 `Bundle.splash: string` — required, because the first three all had one

**v3 is a ONE-FILE handoff.** A required field would have been satisfied the obvious way — point
v3's `splash` at v2's file — and that is precisely the failure the per-screen declarations exist to
prevent: a screen captured from a page its own bundle never drew, then compared against as though
it had. `splash` and `bruksomrader` are both optional now, and a screen whose file its bundle lacks
is **skipped**. The run says so out loud: `(4 screen(s) not in this bundle — skipped, not rendered
from another page)`.

**The consequence is recorded in § 0.3b and it is not cosmetic:** `artifacts/reference-v2/splash*.png`
and `bruksomrader.png` are now **live references, not archived evidence**. The v2 freeze protects
two different things at once from here on.

### 2.2 `only: string[]` — every v2 surface was written `only: ['v2']`

True of the bundles that existed; **false the moment a fourth arrived.** v3 contains all eight of
those screens, and `only` would have silently withheld every one of them from the set they are the
target for — `oppgaver`, `live`, `hjelp`, the three admin tabs. Not a crash: eight missing PNGs in
the target baseline, which is the "green for something that structurally could not be seen" shape.

The property is «present from v2 **onward**», so the field is now `since`. A fifth bundle needs no
edit to any screen line. **The limit is stated rather than left implicit:** this assumes screens are
added and not removed, which held v2 → v3 and was *verified* (`00-diff.md`'s sorted `sc-if` key-set
comparison, `comm -23` empty), not assumed. A handoff that drops a screen needs an `until`.

### 2.3 A state that no literal can reach

`qcSaved` is keyed by a question id and `uid()` is `Math.random()` (D143). `stateFrom` takes the
prototype's own `st` **and its logic instance**, so a patch can derive a key the way the prototype
derives it instead of reimplementing the derivation. That distinction earned itself on its first
run, and what it found is § 3's D156.

---

## 3. THE SWEEP — six findings, and the sharpest is unconditional

The rule this phase is bound by: **name the system in the sentence.** Every row below says what the
BUNDLE does and what OURS does, separately, so none of them can be read as a defect in the running
product that does not exist.

### 3.1 «Lederen kan svare uten å se hvem som skrev» — **rendered unconditionally**

`V3:5349` — `qcHint`, the helper directly under the respondent's comment box:

> «Fortell hva som ligger bak svaret. **Lederen kan svare uten å se hvem som skrev.**»

**The bundle renders this at every `feedbackMode`.** There is no condition on it — compare
`anonReplyNote` at `V3:5409`, which *is* conditioned (`f.anon ? … : "Svaret sendes til " + f.who`),
so the bundle knows how to write a conditional note and did not write one here.

In `named` mode the bundle's own description of that mode is «**Navnet følger kommentaren**»
(`V3:5339`). So the screen tells the respondent her manager cannot see who wrote it, on a survey
configured so that her name follows the comment. **This is a false promise on the exact screen where
she decides whether to write**, which is the worst place in the product for one.

**Ours: nothing is built yet, so nothing is wrong yet.** C3 builds this surface, and this finding is
why the hint is mode-derived there rather than a constant.

### 3.2 «Et valg per kommentar» — false against the bundle's OWN behaviour, twice over

`V3:5339`, the `optional` mode description: «Et valg per kommentar: anonymt eller med navn».

Measured against the bundle's implementation, not against our intentions:

1. **`V3:5362` and `V3:5378` are the same line:** `const anon = mode === "anonymous" ? true : mode === "named" ? false : (st.fbAnon !== false)`. The variable source is **`st.fbAnon`, one submission-level toggle**, shared by the per-question comment and the end-of-survey box. A respondent who flips it on question 3 has flipped it for questions 1 and 2.
2. **D156 below:** the storage key is `undefined` for every question, so there is one slot regardless.

**And the bundle contradicts itself in prose** — the Oppgaver surface's own subtitle says «Valget
anonymt eller med navn styres **per undersøkelse** under Generelt». Two sentences in one handoff,
disagreeing about the feature's central privacy property.

**This corrects something I wrote.** `00-diff.md § 4.2` recorded `qcSaved[id].anon` as «genuinely
per question», on the strength of the storage *shape*. The shape is per-id; the *behaviour* is one
choice per submission, because the value comes from one toggle and the key never varies. **The
bundle already does what Q113 decides.** Only its copy says otherwise, which makes Q113 a copy
correction rather than an override of behaviour — a weaker claim than the decision document makes,
and the weaker one is the true one.

### 3.3 D156 — `respondList` emits no `id`, so all five reads share one slot

Measured: `awk 'NR>=4851 && NR<=4962' | grep -o '[a-zA-Z]*[iI]d:'` over the whole function returns
**`slotId` and nothing else.** The five sites at `V3:5346`, `5347`, `5356`, `5358` and `5363` all
key on `(rq[stepIdx] || {}).id`, which is `undefined` at every step, so the prototype stores every
comment under the string `"undefined"`.

**Ours: this is a bundle defect and it is not ours to inherit.** It is recorded because it is the
thing that makes 3.2 provable, and because the baseline capture had to key the same way the
prototype does in order to photograph the state at all.

### 3.4 «neste innlogging» — twice, and a respondent does not log in

`V3:5339` (builder-facing mode description) and `V3:5409` (`anonReplyNote`, manager-facing).
Already the subject of Q111; recorded here as a sweep finding because there are **two** occurrences,
not the one `00-diff § 4.1` found, and the second is on the manager's screen where it sets an
expectation about what the respondent will experience.

### 3.5 «Kommentaren ligger hos den som eier undersøkelsen» — narrower than the truth will be

`V3:5375`, the respondent's confirmation after sending. It names one reader.

**Ours will have more than one.** Q114's second condition puts the verneombud on the thread on the
same footing as the rest of the documentation, and org roles read it besides. A claim about who can
see what that **understates** the readership is the direction that matters: it is the one a data
subject would rely on. C3 and C4 must not copy this sentence.

### 3.6 The sentence that is ABSENT — and it is the most important finding

**The bundle has no sentence anywhere telling the respondent that a comment is read as it stands.**
Its respondent-facing comment copy is `qcHint` (3.1) and `fbHint` («Dette gjelder selve
undersøkelsen, ikke svarene dine»), and above both of them sits the survey's existing anonymity
banner: «Svarene er anonyme. Resultater vises først når minst fem har svart.» — visible in
`artifacts/reference-v3/respondent-kommentar.png`, directly above the comment box.

So the bundle's respondent screen makes the k-promise over a control the k-promise does not cover.
**That is Q112's «technically true and materially misleading», and it is drawn, not hypothetical.**

**No copy fix belongs in C0** — this is a surface C3 builds, and Q112's sentence is C3's deliverable.
Recorded here so C3 cannot close by reusing the banner.

---

## 4. Hosts, URLs and contact addresses

**The v3 handoff introduces no new host, URL or contact claim.** Measured over the 266 added lines:
`grep -nE 'heituva\.no|https?://|@[a-z]+\.(no|com)'` returns nothing.

Repo-wide the count moved **28 → 41**, and the split is what matters rather than the total:

| Where | Count | Inert or shipped |
|---|---|---|
| the four bundles | 12 (v3 adds 4, all copies of v2's) | inert |
| `messages/{no,en}.json` | **4** | **shipped copy** |
| docs, `.next/`, `.git` logs | 25 | inert (docs quoting the finding; build output; git metadata) |

**The four shipped occurrences are the `personvern@heituva.no` in `legal.privacy6P` and
`legal.privacy8P`, both languages — unchanged and deliberately so.** CLAUDE.md's rule holds: they
stay until the replacement mailbox is confirmed to **receive**, not merely to exist, because a
`.com` that bounces is worse than a `.no` that is at least someone's inbox. The two
`send.smsLinkPlaceholder` occurrences remain fixed in both the file and prod's `ui_messages`.

The rise from 28 is documentation of the finding plus the new bundle's inert copies. **Nothing new
reached shipped copy**, which is the only half of that number a customer can read.

---

## 5. What C0 did NOT do

- No schema, no UI, no server action.
- **No copy fix.** Every finding above lands on a surface a later phase builds; fixing copy for a
  screen that does not exist yet would be fixing it in the bundle, which is not ours to edit.
- **No governance change for screens v3 does not touch** — `send`, `resultater`, `dashboard`,
  `rapporter`, `bibliotek`, the admin tabs and the marketing pages keep the bundle they have,
  though v3's file contains a drawing of every one of them.

## 6. Numbers

| | Predicted | Measured |
|---|---|---|
| census | unchanged | unchanged — C0 adds no test |
| 5a3 | unchanged | unchanged — C0 adds no RLS table and no SECURITY DEFINER function |
| baselines | 3 re-render, `uid()` noise expected | **35 captured, 0 failed, one new set only.** No older set was re-rendered, so there is no `uid()` noise to triage — the D143 prediction assumed a `--all` run and this was not one. |
