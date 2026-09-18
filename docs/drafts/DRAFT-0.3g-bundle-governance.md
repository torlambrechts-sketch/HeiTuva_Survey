# DRAFT — § 0.3g, the ninth handoff

**NOT COMMITTED TO `docs/v2/00-diff.md`. NOT APPLIED. For Tor's approval.**
No directory has been created, named or promoted. 0b is still Tor's decision; this drafts what
§ 0.3's existing rule *would* produce, so the decision has something measured in front of it.

Throughout, the bundle is called `<key>` rather than `v8`, because naming it is the decision.

---

## The facts that bear on it, measured

| | |
|---|---|
| bundle md5 | `b4e430eccd9cfac0105b8089b6ef206f` — matches the zip's hash, so this is the source of record, not the `c0e3fbdc…` loose copy the addendum warns about |
| lines | 11050 (v7: 10558) |
| markup region | 27–6180, by the same rule as v7's 27–6094 (line after `</helmet>` to line before `</x-dc>`) |
| screens | **16**, against v7's 15 |
| added screen | **`packdetail`** |
| removed screens | **none** |
| geometry diff | 87 changed keys over 10 screens; 16 added (all `packdetail`); 4 removed |
| screens with ZERO geometry difference | `admin`, `help`, `livestage`, `profile`, `respond`, `svdetail` |

**This is a re-export with substantial layout change, not a targeted one.** `dashboard` alone moves
16 property groups: borders 29 → 52 declarations, border-radius 45 → 79, font-size 63 → 116. Six
screens are untouched. That distribution is the thing the governance decision turns on.

**Q17 is realised in it** — the threshold picker (3/4/5/8/10, default 5, «Anbefalt: 5»), five
respondent banner variants generated from the threshold, and `NUMWORD` in two languages. That is
not a visual change; it is the drawing catching up with a decision already taken.

---

## What § 0.3's existing rule produces

§ 0.3, verbatim on the point: *«`design-reference-v2/` governs every screen a **v2 phase touches**;
`design-reference-v1/` keeps the screens v1 phases built and v2 does not touch»*, and the two
clarifications — **governance is per SURFACE, not per file**, and **a property check does not move
governance; building to a new drawing does.**

Applied to `<key>`:

| surfaces | governed by | why |
|---|---|---|
| every screen a `<key>` phase **touches** | **`<key>`** | the rule's main clause |
| `packdetail` | **`<key>`** by construction | it exists in no earlier bundle; nothing else can govern it |
| every screen no `<key>` phase touches | **v7 keeps it** | v7 is the governing bundle until a phase builds to the new drawing |
| `admin`, `help`, `livestage`, `profile`, `respond`, `svdetail` | **v7 keeps them, and would keep them even after a `<key>` phase runs elsewhere** | measured zero geometry difference: there is nothing to move governance FOR |
| splash, Bruksområder | **v2 keeps them** | unchanged — neither v3, v4 nor any later handoff has drawn them |

**The six zero-difference screens are the useful half of this table.** Governance is per surface, so
a tranche that rebuilds `dashboard` does not drag `respond` to the new bundle — and for those six
there would be no observable consequence if it did, which is worth stating so nobody argues about it
later.

---

## What changes in `verify:reference`

Per CLAUDE.md's ADDING A BUNDLE checklist, and the `since` field that replaced `only` at V5-0:

1. **`scripts/verify/reference.ts` — one `BUNDLES` entry.** `since: '<key>'` means «present from this
   bundle onward», so **no screen line needs editing**, exactly as v5 confirmed (one entry, 35
   screens, 0 failures).
2. **A new `SCREENS` entry for `packdetail`** — this bundle ADDS a screen, which v5 did not. It needs
   a name, a state that reaches it and a width. Without it the new screen renders in no baseline and
   `tests/unit/fidelity-pairs.test.ts` fails in the commit that adds the bundle, which is that test
   doing its job.
3. **`until` — CHECK, do not assume.** `since` assumes screens are only ever added. **Measured: no
   screen is removed** (16 ⊃ 15), so no `until` is needed. The two commands CLAUDE.md names both
   hold: every state key the manifest sets still exists, and the captured PNGs are pairwise distinct.
4. `.gitignore` — an `!artifacts/reference-<key>/` allowlist line, or the set renders and is
   committed nowhere.
5. `.eslintignore` — a `design-reference-<key>/` line, or eslint lints the bundle's own `support.js`.
6. `CLAUDE.md` and `VERIFY.md` — the new path and which surface it governs.
7. `docs/v2/00-diff.md § 0.3g` — this table.
8. **Commit the rendered directory and check it landed** (`git status artifacts/`).
9. **Run the security-copy sweep over the new bundle's prose, once per bundle.**

**THE ONE EDIT THAT PROMOTES IT** is step 1: `BUNDLES`'s last entry is what `verify:reference`
derives its target set from. Everything else is bookkeeping around that single line.

---

## Two things this draft does NOT decide

**The name.** `design-reference-v8/` continues the sequence and is what every other step assumes,
but naming it is 0b and 0b is Tor's.

**Whether D242/D243 make the new baselines worth committing at all.** `verify:reference` currently
goes green while rewriting 35 of 35 of its own baselines (D248), because every `artifacts/reference-*`
set is the drawing in fallback fonts (D243). Adding a ninth set adds a ninth set of pictures with
that property. That is an argument for fixing the harness before promoting, or for promoting and
accepting it knowingly — but not for doing it without noticing.
