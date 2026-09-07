# design-reference-v1 — the second Claude Design handoff

`heituva-survey-app-design/` is the bundle as delivered. **It is a SNAPSHOT and it is
frozen.** Nothing in it is edited — not to fix a typo, not to apply a decision. It is the
record of what was handed over, and a record you amend is not one.

`project/HeiTuva.dc.html` is the source of truth for every screen a v1 phase touches
(DECISIONS Q18). `docs/v1/00-diff.md` says what changed between this bundle and the first.

---

## The bundle's copies of governing documents are HISTORICAL. `docs/` governs.

**Read this before reasoning from anything in `project/uploads/`.**

A bundle is a snapshot, so anything inside one that also exists as a working document goes
stale **by design** — the working copy moves when a decision moves it, and the snapshot
cannot. The snapshot is the more authoritative-looking of the two, because it sits inside
the frozen handoff and carries no edit history.

**Today exactly one file is affected**, and it is the one that matters most:

| Bundle copy | Governing copy | Status |
|---|---|---|
| `project/uploads/Designbrief_terskel_Q17.md` | **`docs/Designbrief_terskel_Q17.md`** | **DIVERGED.** Read the `docs/` one |

The divergence is not cosmetic. The bundle's § «Hva som ikke skal designes» says:

> «Ingen visning av **faktisk antall svar** under terskelen, noe sted, uansett rolle.»

The governing copy, amended under **DECISIONS Q28**, says:

> «Ingen visning av et **svarutledet tall** under terskelen, noe sted, uansett rolle.»

Those are opposite rules about the same screens. Q28 settled that a count of PEOPLE is
participation and not a number about what anyone said; Q49 later extended that from the
survey to the round. **The bundle's copy predates both**, and so does the bundle's own
on-screen copy that was written against it — see `docs/DEVIATIONS.md` D103.

**This nearly cost a held phase.** During V1-6 I read the bundle's copy, concluded a
confirmed decision contradicted an absolute prohibition, and was ready to stop the phase
for a ruling that had already been made months of decisions earlier. The trap is not that
the stale text is wrong; it is that it is frozen, unattributed, and inside the folder a
reader treats as authoritative.

**The rule, and it is general:** where a document exists in both places, `docs/` governs
and the bundle's copy is evidence of what the brief said when the bundle was drawn. Check
`docs/` first, and if the two disagree, `DECISIONS.md` says why.

To re-check this table after any bundle is added or a brief is amended:

```sh
for f in design-reference-v1/heituva-survey-app-design/project/uploads/*; do
  b=$(basename "$f"); [ -e "docs/$b" ] && { diff -q "$f" "docs/$b" >/dev/null \
    && echo "SAME     $b" || echo "DIVERGED $b"; }
done
```

The first handoff, `design-reference/`, carries no `.md` uploads at all, so it has no
copies to go stale. If one is ever added there, the same rule applies to it.
