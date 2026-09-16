/**
 * «Kom i gang» — the four-step checklist v6 draws on Oversikt
 * (HeiTuva.dc.html:445-467, steps at :9245-9250).
 *
 * G3. The bundle stores the four ticks in `st.onboardDone`, a fixture object
 * seeded `{ mal:true, import:false, test:false }` (v6:6535) that nothing but
 * the buttons themselves ever writes: clicking «Gjør det» marks the step done
 * whether or not the thing was done. That is the shape CLAUDE.md's who-writes-
 * this question exists to catch — a tick with no writer but the tick.
 *
 * So there is no checklist column and no writer for one. **Every step is
 * DERIVED from state the product already keeps**, which means it cannot
 * disagree with the product, cannot be ticked by looking at it, and unticks
 * itself if the thing is undone. The derivations are here rather than in the
 * page so they can be tested without a database or a browser.
 */

export type OnboardKey = 'wizard' | 'mal' | 'import' | 'test'

/** What the page must count before `onboardDone` can answer. */
export type OnboardFacts = {
  /** Surveys in the organisation, deleted ones excluded. */
  surveys: number
  /** Of those, how many were created from a template pack. */
  fromPack: number
  /** Groups the organisation has — pasted, imported or synced from Entra. */
  groups: number
  /** Invitations that have actually gone out, test ones excluded. */
  invitations: number
  /** Invitations sent with `is_test` — «send en test til deg selv». */
  testInvitations: number
}

export type OnboardStep = {
  key: OnboardKey
  /** Where «Gjør det» goes. Every one is a static route that exists. */
  href: string
  /** The i18n key pair: title, then the line beneath it. */
  copy: [string, string]
}

/**
 * v6:9245-9250's order and its four destinations, with two substitutions.
 *
 * The bundle's third and fourth steps both go to its `send` SCREEN, which in
 * this product is `/undersokelser/[id]/send` — survey-scoped, so it does not
 * exist for the organisation the checklist is addressed to. `import` goes to
 * Målgrupper instead, which is where a group is actually made, and `test` to
 * the survey list, because choosing WHICH survey to test is the respondent's
 * first real decision and picking one here would be a guess (D213).
 */
export const ONBOARD_STEPS: readonly OnboardStep[] = [
  { key: 'wizard', href: '/undersokelser/ny', copy: ['onbWizard', 'onbWizardSub'] },
  { key: 'mal', href: '/bibliotek', copy: ['onbMal', 'onbMalSub'] },
  { key: 'import', href: '/administrasjon/malgrupper', copy: ['onbImport', 'onbImportSub'] },
  { key: 'test', href: '/undersokelser', copy: ['onbTest', 'onbTestSub'] },
]

export const ONBOARD_KEYS: readonly OnboardKey[] = ONBOARD_STEPS.map((s) => s.key)

/**
 * The four derivations, each one sentence.
 *
 * `import` is satisfied by EITHER a group or a sent invitation, because the
 * bundle's own subline names two roads in («Lim inn en liste, eller koble til
 * Entra ID») and this product has a third: pasting addresses at send, which
 * creates invitations and no group. A step that only counted groups would tell
 * an organisation that has invited ninety people it has not put anyone in yet.
 */
export function onboardDone(f: OnboardFacts): Record<OnboardKey, boolean> {
  return {
    wizard: f.surveys > 0,
    mal: f.fromPack > 0,
    import: f.groups > 0 || f.invitations > 0,
    test: f.testInvitations > 0,
  }
}

export function onboardCount(done: Record<OnboardKey, boolean>): number {
  return ONBOARD_KEYS.filter((k) => done[k]).length
}
