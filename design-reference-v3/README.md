# design-reference-v3 — what this bundle is, and what it is not

**The v3 handoff was ONE FILE**: `heituva-survey-app-design/project/HeiTuva.dc.html`,
md5 `c6f635891eb75236b54c555778fd2fd4`, 6981 lines. Byte-identical to what was handed over —
verified after copying, not before.

`support.js`, `image-slot.js` and `uploads/` are **copied from v2 because the file cannot render
without them** (`HeiTuva.dc.html:6` and `:13` load the two scripts). They are a rendering
necessity, not a claim that v3 re-issued them.

**`HeiTuva Splash.dc.html` and `HeiTuva Bruksomrader.dc.html` are deliberately ABSENT.** v3 did not
hand them over, so those two surfaces stay governed by v2 and are rendered from the v2 bundle. A
copy here would have said "v3 re-issued the splash", which is false, and the next fidelity question
about the splash would have been answered against a file nobody drew.

What changed v2 → v3, measured: `docs/v3/00-diff.md`.
Which surface is judged against which bundle: `docs/v2/00-diff.md § 0.3`.
