# design-reference-v4 — what this bundle is, and what it is not

**The v4 handoff was ONE FILE**: `heituva-survey-app-design/project/HeiTuva.dc.html`,
md5 `85c0ce00a4794ef6f4209409025bd6b8`, 7172 lines. Byte-identical to what was handed over —
verified after copying, not before.

`support.js`, `image-slot.js` and `uploads/` are **copied from v3 because the file cannot render
without them** (`HeiTuva.dc.html:6` and `:13` load the two scripts). They are a rendering
necessity, not a claim that v4 re-issued them. v3 in turn copied them from v2, and all three are
byte-identical.

**`HeiTuva Splash.dc.html` and `HeiTuva Bruksomrader.dc.html` are deliberately ABSENT**, for the
second handoff running. v2 keeps governance of both surfaces and is the set they render from.
`Bundle.splash` was made optional when v3 arrived without one, because typing it as required had
been an enumeration of the three bundles that happened to have one; v4 arriving without one too is
the evidence that a one-file handoff is the norm rather than the anomaly.

## Four files reached this bundle's conversation; only this one is installed

Tor's upload order, measured on his side:

| | md5 | lines | distinct `ws*` |
|---|---|---|---|
| `HeiTuva_dc.html` | `cad82fcdf178123c401a0c66c7eeb5f1` | 7129 | 8 |
| `__1_` | `6b3a6e4baebcf56a61a5cf2afe5202b7` | 7157 | 11 |
| `__2_` | `194c83898b3c955d3b91f9d0643b0ef9` | 7172 | 16 |
| **`__3_` — INSTALLED** | **`85c0ce00a4794ef6f4209409025bd6b8`** | **7172** | **16** |

The first three are iterations inside one conversation — the switcher, then the library sort and
defaults after criticism, then Q35's fix and `ORG_WORKSPACE` — each made in answer to an objection
to its predecessor.

**The `ws*` count rising 8 → 11 → 16 → 16 is monotone, which rules out an identifier being REMOVED
and says nothing about a property being CHANGED AWAY.** That distinction is not theoretical here:
`__2_` → `__3_` is exactly one changed property and no changed identifier — a pill-shaped header
(`border-radius:999px`) reverted to the theme's 16px — so a count-based check would have reported
those two files as identical.

What is verified, and how:

- **`__2_` → `__3_`: nothing vanished beyond the radius.** Proven by construction rather than by
  possession: taking `__3_`, changing `border-radius:16px` → `999px` on line 160 alone, and hashing
  the result gives `194c83898b3c955d3b91f9d0643b0ef9` — Tor's `__2_`, byte for byte. A single-property
  edit reproducing the whole file is a stronger statement than a diff, because it leaves no room for
  a second difference anywhere else in 7172 lines.
- **`HeiTuva_dc.html` and `__1_`: NOT VERIFIED.** Those two files never reached this session, so
  there is nothing here to diff. Recorded as an open item rather than assumed clean.
