/**
 * T5 — THE BUILDER'S TABS, AS v8 GROUPS THEM.
 *
 * Ours was a flat four — `general · add · settings · preview` — and
 * `Builder.tsx`'s own comment sourced that from **`V2:6472`**, five handoffs
 * back. v8 carries SIX `buildTab` values and draws them as CONTEXTUAL GROUPS of
 * at most two pills (`v8:10678-10692`):
 *
 *     add | content        «Spørsmål» · «Innhold»
 *     general | settings   «Kjøremodus» · «Personvern og frekvens»
 *     lint                 «Merknader · N», or «Ingen merknader»
 *     preview              «Slik ser den ut»
 *
 * So the strip is not a tab bar over all six: it shows the group the current
 * tab belongs to, and moving between GROUPS happens elsewhere. That is the
 * behaviour, not a styling detail — a flat six-pill row would be a different
 * product from the one the bundle draws.
 *
 * **The two tabs this adds are the R report's finding.** `content` had no tab
 * (BlockPalette lived inside `add`) and `lint` had no tab (MethodPanel was
 * stacked under `settings` beside PolicyPanel — «four panels where the bundle
 * means two», which is what the old comment complained about one level up).
 *
 * GROUPS ARE DERIVED FROM ONE TABLE, not stated twice. A tab that is added to
 * `TAB_GROUP` without a label is a compile error rather than a pill that
 * renders blank.
 */
export const BUILD_TABS = ['add', 'content', 'general', 'settings', 'lint', 'preview'] as const
export type BuildTab = (typeof BUILD_TABS)[number]

/** Which group each tab belongs to. v8's `groups` object, keyed the other way
 *  round so the membership is stated once per tab. */
const TAB_GROUP: Record<BuildTab, BuildTab[]> = {
  add: ['add', 'content'],
  content: ['add', 'content'],
  general: ['general', 'settings'],
  settings: ['general', 'settings'],
  lint: ['lint'],
  preview: ['preview'],
}

/** The message key each tab's pill uses. `lint` is decided at render time —
 *  its label carries a count — so it is the one key that is not a constant. */
export const BUILD_TAB_KEY: Record<BuildTab, string> = {
  add: 'tabAdd',
  content: 'tabContent',
  general: 'tabGeneral',
  settings: 'tabSettings',
  lint: 'tabLint',
  preview: 'tabPreview',
}

/** The pills to draw for the current tab. At most two, always including it. */
export function buildTabGroup(current: BuildTab): BuildTab[] {
  return TAB_GROUP[current]
}

/**
 * v8's own label rule for `lint` (`10683`): the pill counts the notes that are
 * NOT dismissed, and reads «Ingen merknader» when the survey has no rows at
 * all — not when the count happens to be zero. Two different states, and the
 * drawing distinguishes them.
 */
export function lintTabLabel(
  rows: number,
  undismissed: number,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  return rows > 0 ? t('tabLint', { n: undismissed }) : t('tabLintNone')
}

/**
 * LEVEL ONE — THE GROUP RAIL, AND WITHOUT IT FOUR TABS ARE UNREACHABLE.
 *
 * v8's builder navigation has TWO levels and T5's brief described only the
 * second. `v8:9366-9371` is the first: four pills that pick the GROUP, each
 * landing on that group's first tab.
 *
 *     ["Bygg",          ["add","content"],      "add"]
 *     ["Metodikk",      ["lint"],               "lint"]
 *     ["Innstillinger", ["general","settings"], "general"]
 *     ["Forhåndsvis",   ["preview"],            "preview"]
 *
 * A pill is current when the CURRENT TAB IS IN ITS GROUP — `group.indexOf(cur) > -1`
 * — which is why `settings` lights «Innstillinger» and not a fifth pill.
 *
 * **WHERE IT IS DRAWN IS AN OPEN QUESTION, AND THE ASSUMPTION IS STATED RATHER
 * THAN SETTLED.** v8 draws this in the SHELL RAIL, because `build` is its own
 * screen with its own rail. Ours is a survey route whose rail is the survey's
 * eight tabs — an arrangement F5-2 and V7-2 each reasoned about explicitly
 * (the builder is an EXIT, never a tab). Replacing that rail on `/bygg` is a
 * product decision about what the shell means, not a fidelity reading, so it
 * is Tor's under «when the drawing and a decision disagree, ask».
 *
 * Built here as a row inside the pane, above the group's own pills: v8's exact
 * two-level semantics, without touching a shell rail two phases reasoned
 * about. If Tor wants it in the rail it is a move, not a rebuild.
 */
export const BUILD_GROUPS = [
  { id: 'build', tabs: ['add', 'content'], target: 'add', key: 'groupBuild' },
  { id: 'method', tabs: ['lint'], target: 'lint', key: 'groupMethod' },
  { id: 'settings', tabs: ['general', 'settings'], target: 'general', key: 'groupSettings' },
  { id: 'preview', tabs: ['preview'], target: 'preview', key: 'groupPreview' },
] as const satisfies ReadonlyArray<{
  id: string
  tabs: ReadonlyArray<BuildTab>
  target: BuildTab
  key: string
}>

/** Which group pill is lit: the one whose group CONTAINS the current tab. */
export function currentBuildGroup(tab: BuildTab): (typeof BUILD_GROUPS)[number]['id'] {
  return (BUILD_GROUPS.find((g) => (g.tabs as ReadonlyArray<BuildTab>).includes(tab)) ?? BUILD_GROUPS[0]).id
}

/** T5.1 — the search parameter the group rail writes. The tab had to leave
 *  `useState` for the rail to reach it: a server-rendered pill can only carry
 *  an href, and an href cannot set React state. */
export const BUILD_TAB_PARAM = 'fane'

/** Narrow an arbitrary `?fane=` to a tab. An unknown value is `add`, which is
 *  also v8's default (`st.buildTab || "add"`). */
export function resolveBuildTab(raw: string | null | undefined): BuildTab {
  return (BUILD_TABS as ReadonlyArray<string>).includes(raw ?? '') ? (raw as BuildTab) : 'add'
}

/** `/undersokelser/<id>/bygg?fane=<tab>`. The group rail links its target. */
export function buildTabHref(surveyId: string, tab: BuildTab): string {
  return `/undersokelser/${surveyId}/bygg?${BUILD_TAB_PARAM}=${tab}`
}
