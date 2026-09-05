'use client'

import { useActionState, useState } from 'react'
import { Logo, Wordmark } from '@/components/Logo'
import { requestDemo, signUpFromSplash, type SplashState } from './actions'

/**
 * The splash — `HeiTuva Splash.dc.html`.
 *
 * A client component because four of its controls change the page rather than
 * navigate: the auth tab, the billing toggle, the FAQ accordion and the
 * language select. Everything else is static markup.
 *
 * The colours are the design's own literals rather than the theme tokens. The
 * splash prototype is a separate file with its own hard-coded palette — it
 * never had CSS variables — and several of its values (#CFE7E4, #F3E7DB, the
 * dark #191510 legal panel) do not correspond to a token. Quoting them is the
 * same judgement `undersokelser/keys.ts` makes about the status pills.
 */
const LINE = '#E8DFC9'
const MUT = '#5F5849'
const INK = '#191510'
const SF = '#FFFDF6'
const BG = '#FCF6E9'
const AC = '#F5C64A'
const AC2 = '#A8D5D2'

type Plan = {
  name: string
  price: string | null
  priceM: string | null
  priceY: string | null
  unit: string
  desc: string
  cta: string
  features: string[]
}

export type SplashCopy = {
  langLabel: string
  /** The locale actually rendered, so the picker shows it rather than `no`. */
  locale: string
  nav: { label: string; href: string }[]
  login: string
  tryFree: string
  or: string
  heroBadge: string
  heroLine1: string
  heroLine2: string
  heroBody: string
  ctaMain: string
  ctaSee: string
  ctaDemo: string
  risk: string[]
  proof: { value: string; label: string }[]
  showKicker: string
  showTitle: string
  showBody: string
  chips: string[]
  heatTitle: string
  heatMeta: string
  heatCta: string
  heatCols: string[]
  heatTeams: string[]
  few: string
  navWhy: string
  driverTitle: string
  drivers: { stat: string; title: string; desc: string }[]
  navUse: string
  useTitle: string
  useBody: string
  useCases: { tag: string; cadence: string; title: string; desc: string; chips: string[] }[]
  legalKicker: string
  legalTitle: string
  legalBody: string
  legalCta: string
  duties: { title: string; law: string; due: string; tone: string }[]
  stepKicker: string
  stepTitle: string
  steps: { title: string; desc: string }[]
  navPrice: string
  priceTitle: string
  popular: string
  priceFine: string
  billing: { key: string; label: string }[]
  plans: Plan[]
  faqKicker: string
  faqTitle: string
  faq: { q: string; a: string }[]
  endTitle: string
  endBody: string
  authTabs: string[]
  authTitleUp: string
  authTitleIn: string
  authSubUp: string
  authSubIn: string
  authCtaUp: string
  authCtaIn: string
  fields: { name: string; company: string; email: string; password: string }
  ph: { name: string; company: string; email: string; passUp: string; passIn: string }
  noteMissing: string
  noteUp: string
  noteIn: string
  noteSso: string
  noteDemo: string
  noteWeak: string
  noteFreemail: string
  noteFailed: string
  fineUp: string
  fineIn: string
  footLegal: string
  footNote: string
  footPrivacy: string
  footDpa: string
  navProduct: string
  /** The panel's third mode — see the note on `mode` below. */
  demoTitle: string
  demoSub: string
  demoSubPlan: string
  demoCta: string
  demoFine: string
}

/** The design's demo heatmap (HeiTuva Splash.dc.html:624). `null` is a gated
 *  cell — the one thing on this page that has to be honest about the k-gate,
 *  because the gate is what the page is selling. */
const HEAT: ([string, string] | null)[][] = [
  [['4,2', '#CFE7E4'], ['3,9', '#FBEBBE'], ['4,4', '#CFE7E4'], ['4,1', '#FBEBBE']],
  [['4,6', '#CFE7E4'], ['4,3', '#CFE7E4'], ['4,5', '#CFE7E4'], ['4,4', '#CFE7E4']],
  [['3,3', '#FBD5C4'], ['3,8', '#FBEBBE'], ['3,5', '#FBD5C4'], ['3,9', '#FBEBBE']],
  [null, null, null, null],
]
const DRIVER_TINTS = ['#FFFDF6', '#CFE7E4', '#FBEBBE']
const CASE_TINTS = ['#FBEBBE', '#FFFDF6', '#CFE7E4', '#FBD5C4', '#FFFDF6', '#F3E7DB']

/** RESPONSIVE.md: the design is a fixed 1440 canvas, so every multi-column grid
 *  here collapses to one column below md and nothing is hidden. */
/*
  1328, not 1240.

  The prototype's sections are `max-width:1240px; padding:0 44px` under the
  browser default `box-sizing: content-box`, so 1240 is the width of the
  CONTENT and the padding sits outside it — 1328 overall. Tailwind's preflight
  sets `border-box`, so writing the same two numbers here gave a 1152px content
  column and every heading in the page wrapped a line early. The measured
  content width is what has to match, so the cap carries the padding.
*/
const SECTION = 'mx-auto w-full max-w-[1328px] px-6 md:px-11'

export function Splash({ copy }: { copy: SplashCopy }) {
  /*
    Three modes behind the design's two tabs.

    `demo` is not a tab — the design draws two — but it is a state the paid
    plans and "Få en gjennomgang" put the panel into. Their prototype
    equivalents pop a toast; here the request is real and has to reach
    somebody, which needs a name and an address. Reusing this panel is what
    keeps that from becoming a second form somewhere else on the page
    (docs/DEVIATIONS.md D74).
  */
  const [mode, setMode] = useState<'signup' | 'login' | 'demo'>('signup')
  const [demoPlan, setDemoPlan] = useState<string | null>(null)
  const [yearly, setYearly] = useState(true)
  const [faqOpen, setFaqOpen] = useState(0)
  const [signUpState, signUpAction, signingUp] = useActionState<SplashState, FormData>(
    signUpFromSplash,
    {},
  )
  const [demoState, demoAction, demoPending] = useActionState<SplashState, FormData>(
    requestDemo,
    {},
  )

  const signup = mode === 'signup'
  const demo = mode === 'demo'

  /** Put the panel into a mode. Every CTA on the page points at this one
   *  panel rather than at four different behaviours. */
  const openPanel = (next: 'signup' | 'login' | 'demo', plan?: string) => {
    setMode(next)
    setDemoPlan(plan ?? null)
  }

  /*
    One note per mode, so a stale one cannot outlive what produced it.

    Reading both action states in a single chain meant a successful sign-up
    kept saying "Kontoen er klar" over the NEXT submit's refusal — the
    free-mail rejection rendered as a success, which is the one direction a
    note must never be wrong in.
  */
  const active: SplashState = demo ? demoState : signup ? signUpState : {}
  const note = active.sent
    ? demo
      ? copy.noteDemo
      : copy.noteUp
    : active.error === 'weak'
      ? copy.noteWeak
      : active.error === 'freemail'
        ? copy.noteFreemail
        : active.error === 'invalid'
          ? copy.noteMissing
          : active.error === 'failed'
            ? copy.noteFailed
            : ''

  /*
    `leading-[normal]`, and no `touch-44-field`.

    The prototype's input has no line-height, so it renders at the browser's
    `normal` and stands 44px tall — already over the touch minimum, which is
    why the hit-area treatment is not needed here and why applying it made
    every field 6px taller than the design. Tailwind's inherited 1.5 would add
    another 6 on top.
  */
  const field =
    'mt-[6px] box-border w-full rounded-[11px] border px-[15px] py-[13px] text-[14.5px] leading-[normal] outline-none'
  const legend = 'block text-[11px] uppercase tracking-[.09em]'

  return (
    <div className="min-h-dvh" style={{ background: BG, color: INK }}>
      {/* ---------------------------------------------------------------- nav */}
      <header className="mx-auto flex max-w-[1328px] flex-wrap items-center justify-between gap-4 px-6 py-5 md:gap-6 md:px-11">
        <div className="flex items-center gap-[11px]">
          <Logo />
          <Wordmark />
        </div>
        <nav aria-label={copy.navProduct} className="order-3 flex flex-wrap items-center gap-x-1 gap-y-[9px] text-sm md:order-none">
          {copy.nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="touch-44 inline-flex items-center rounded-[9px] px-[13px] py-[9px] font-medium no-underline"
              style={{ color: MUT }}
            >
              {n.label}
            </a>
          ))}
        </nav>
        {/* `flex-wrap`: below the design's 380-420px band the three controls
            cannot sit on one line, and an un-wrapped row pushes the page's
            scrollWidth past the viewport (RESPONSIVE.md's 320px floor).
            Spacing is layout and may change; the controls do not. */}
        <div className="flex flex-wrap items-center gap-[9px]">
          {/*
            Two languages, not the prototype's four. DECISIONS Q11 confirms
            no + en at launch; sv/da are seeded but inactive, and a public page
            that offers them would be promising a capability the product does
            not have (docs/DEVIATIONS.md D73).

            It is a real navigation, not a state toggle: `?lang=` is a URL the
            visitor can share and the server can render.
          */}
          <label className="relative inline-flex items-center">
            <span className="sr-only">{copy.langLabel}</span>
            <LangSelect label={copy.langLabel} locale={copy.locale} />
          </label>
          <a
            href="/logg-inn"
            className="touch-44 inline-flex items-center whitespace-nowrap rounded-[10px] border px-[17px] py-[10px] text-[13.5px] font-semibold no-underline"
            style={{ borderColor: LINE, color: INK }}
          >
            {copy.login}
          </a>
          <a
            href="#konto"
            onClick={() => openPanel('signup')}
            className="touch-44 inline-flex items-center whitespace-nowrap rounded-[10px] px-[17px] py-[10px] text-[13.5px] font-semibold no-underline"
            style={{ background: INK, color: SF }}
          >
            {copy.tryFree}
          </a>
        </div>
      </header>

      {/* -------------------------------------------------------------- hero */}
      <section className={`${SECTION} grid grid-cols-1 items-center gap-12 pt-[30px] xl:grid-cols-[1.05fr_.95fr]`}>
        <div className="animate-enter">
          <span
            className="inline-flex items-center gap-[9px] rounded-full px-[14px] py-[7px] text-[12.5px] font-semibold"
            style={{ background: '#FBD5C4' }}
          >
            {copy.heroBadge}
          </span>
          <h1 className="mt-[22px] text-pretty font-display text-[38px] font-medium leading-[1.06] tracking-[-.02em] md:text-[56px]">
            {copy.heroLine1}
            <br />
            {copy.heroLine2}
          </h1>
          <p className="mt-5 max-w-[470px] text-pretty text-[16.5px] leading-[1.65]" style={{ color: MUT }}>
            {copy.heroBody}
          </p>
          <div className="mt-7 flex flex-wrap gap-[11px]">
            <a
              href="#konto"
              onClick={() => openPanel('signup')}
              className="touch-44 inline-flex items-center rounded-xl px-7 py-4 text-center text-[15.5px] font-bold no-underline"
              style={{ background: AC, color: INK }}
            >
              {copy.ctaMain}
            </a>
            {/* The prototype links to its own sibling file; the real product is
                behind a login, so "Se det i bruk" goes where a visitor can
                actually go. */}
            <a
              href="/logg-inn"
              className="touch-44 inline-flex items-center rounded-xl border px-[26px] py-4 text-center text-[15px] font-semibold no-underline"
              style={{ borderColor: LINE }}
            >
              {copy.ctaSee}
            </a>
          </div>
          <div className="mt-4 flex flex-wrap gap-[14px] text-[12.5px]" style={{ color: MUT }}>
            {copy.risk.map((r) => (
              <span key={r}>{r}</span>
            ))}
          </div>
          <div className="mt-[34px] flex flex-wrap gap-[30px]">
            {copy.proof.map((p) => (
              <div key={p.value}>
                <div className="font-display text-[30px] font-medium leading-none">{p.value}</div>
                <div className="mt-1 max-w-[155px] text-[12.5px] leading-[1.4]" style={{ color: MUT }}>
                  {p.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------ auth panel */}
        <div
          id="konto"
          className="animate-enter scroll-mt-6 rounded-[22px] border p-[30px]"
          style={{ borderColor: LINE, background: SF, boxShadow: '0 20px 50px rgba(25,21,16,.08)' }}
        >
          <div
            className="flex w-fit gap-[3px] rounded-full p-1"
            style={{ background: 'rgba(25,21,16,.05)' }}
          >
            {copy.authTabs.map((label, i) => {
              const key = i === 0 ? 'signup' : 'login'
              const on = mode === key
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => openPanel(key as 'signup' | 'login')}
                  aria-pressed={on}
                  className="touch-44 cursor-pointer rounded-full border-none px-5 py-[9px] text-[13px] font-semibold leading-[normal]"
                  style={{
                    background: on ? SF : 'transparent',
                    boxShadow: on ? '0 1px 3px rgba(25,21,16,.14)' : 'none',
                    color: INK,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="mt-[18px] font-display text-[26px] font-medium">
            {demo ? copy.demoTitle : signup ? copy.authTitleUp : copy.authTitleIn}
          </div>
          <div className="mt-1 text-[13px]" style={{ color: MUT }}>
            {demo
              ? demoPlan
                ? copy.demoSubPlan.replace('{plan}', demoPlan)
                : copy.demoSub
              : signup
                ? copy.authSubUp
                : copy.authSubIn}
          </div>

          {/*
            Sign-up posts to a server action; sign-in is a LINK to /logg-inn
            rather than a second password form. One password field on a public
            page is enough: two would mean this file also owns the sign-in error
            vocabulary, and the generic "invalid" message that keeps /logg-inn
            from being an account-existence oracle only works if there is one
            place that answers.
          */}
          {/*
            A completed request replaces the form rather than sitting above it.

            React 19 resets a `<form action>` on success, so the panel was left
            showing four empty required fields under "Kontoen er klar" — which
            reads as "that did not work, try again", and the browser's own
            validation then blocked the retry. The confirmation IS the state
            now, and there is nothing left to submit.
          */}
          {active.sent ? (
            <div role="status" className="mt-5 rounded-[11px] px-[14px] py-[14px] text-sm leading-[1.6]"
              style={{ background: AC2 }}>
              {note}
            </div>
          ) : demo ? (
            <form action={demoAction} className="contents">
              <input type="hidden" name="plan" value={demoPlan ?? ''} />
              <div className="mt-5 flex flex-col gap-3">
                <label className="block">
                  <span className={legend} style={{ color: MUT }}>{copy.fields.name}</span>
                  <input name="name" type="text" required autoComplete="name" placeholder={copy.ph.name}
                    className={field} style={{ borderColor: LINE, background: BG, color: INK }} />
                </label>
                <label className="block">
                  <span className={legend} style={{ color: MUT }}>{copy.fields.company}</span>
                  <input name="company" type="text" required autoComplete="organization" placeholder={copy.ph.company}
                    className={field} style={{ borderColor: LINE, background: BG, color: INK }} />
                </label>
                <label className="block">
                  <span className={legend} style={{ color: MUT }}>{copy.fields.email}</span>
                  <input name="email" type="email" required autoComplete="email" placeholder={copy.ph.email}
                    className={field} style={{ borderColor: LINE, background: BG, color: INK }} />
                </label>
              </div>
              <button type="submit" disabled={demoPending}
                className="touch-44 mt-[18px] w-full cursor-pointer rounded-xl border-none p-[15px] text-[15px] font-bold leading-[normal]"
                style={{ background: INK, color: SF }}>
                {copy.demoCta}
              </button>
            </form>
          ) : signup ? (
            <form action={signUpAction} className="contents">
              <div className="mt-5 flex flex-col gap-3">
                <label className="block">
                  <span className={legend} style={{ color: MUT }}>{copy.fields.name}</span>
                  <input name="name" type="text" required autoComplete="name" placeholder={copy.ph.name}
                    className={field} style={{ borderColor: LINE, background: BG, color: INK }} />
                </label>
                <label className="block">
                  <span className={legend} style={{ color: MUT }}>{copy.fields.company}</span>
                  <input name="company" type="text" required autoComplete="organization" placeholder={copy.ph.company}
                    className={field} style={{ borderColor: LINE, background: BG, color: INK }} />
                </label>
                <label className="block">
                  <span className={legend} style={{ color: MUT }}>{copy.fields.email}</span>
                  <input name="email" type="email" required autoComplete="email" placeholder={copy.ph.email}
                    className={field} style={{ borderColor: LINE, background: BG, color: INK }} />
                </label>
                <label className="block">
                  <span className={legend} style={{ color: MUT }}>{copy.fields.password}</span>
                  <input name="password" type="password" required minLength={10} autoComplete="new-password"
                    placeholder={copy.ph.passUp}
                    className={field} style={{ borderColor: LINE, background: BG, color: INK }} />
                </label>
              </div>
              <button
                type="submit"
                disabled={signingUp}
                className="touch-44 mt-[18px] w-full cursor-pointer rounded-xl border-none p-[15px] text-[15px] font-bold leading-[normal]"
                style={{ background: INK, color: SF }}
              >
                {copy.authCtaUp}
              </button>
            </form>
          ) : (
            <>
              <div className="mt-5 flex flex-col gap-3">
                <label className="block">
                  <span className={legend} style={{ color: MUT }}>{copy.fields.email}</span>
                  <input type="email" autoComplete="email" placeholder={copy.ph.email} readOnly
                    className={field} style={{ borderColor: LINE, background: BG, color: MUT }} />
                </label>
              </div>
              <a
                href="/logg-inn"
                className="touch-44 mt-[18px] flex w-full cursor-pointer items-center justify-center rounded-xl p-[15px] text-[15px] font-bold leading-[normal] no-underline"
                style={{ background: INK, color: SF }}
              >
                {copy.authCtaIn}
              </a>
            </>
          )}

          {note && !active.sent ? (
            <div role="alert" className="mt-3 rounded-[11px] px-[14px] py-[11px] text-[13px]" style={{ background: AC2 }}>
              {note}
            </div>
          ) : null}

          <div className="my-[18px] flex items-center gap-3">
            <span className="block h-px flex-1" style={{ background: LINE }} />
            <span className="text-xs" style={{ color: MUT }}>{copy.or}</span>
            <span className="block h-px flex-1" style={{ background: LINE }} />
          </div>
          {/*
            SSO is Phase 6's own item and is not wired yet (DECISIONS Q5). The
            buttons render as the design draws them and say so, rather than
            posting nowhere — the same treatment the admin screen's Entra
            toggle already gets.
          */}
          <div className="grid grid-cols-1 gap-[9px] sm:grid-cols-2">
            {['Entra ID', 'Google Workspace'].map((label) => (
              <button key={label} type="button" disabled
                className="touch-44 cursor-not-allowed rounded-[11px] border p-3 text-[13px] font-semibold leading-[normal] opacity-55"
                style={{ borderColor: LINE, color: INK }}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-[14px] text-[11.5px] leading-[1.55]" style={{ color: MUT }}>
            {demo ? copy.demoFine : signup ? copy.fineUp : copy.fineIn}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- product show */}
      <section className={`${SECTION} pt-16`}>
        <div
          className="grid grid-cols-1 items-center gap-[30px] rounded-3xl border px-[34px] py-[30px] xl:grid-cols-[1.1fr_.9fr]"
          style={{ borderColor: LINE, background: SF }}
        >
          <div>
            <span className="text-[11px] uppercase tracking-[.1em]" style={{ color: MUT }}>{copy.showKicker}</span>
            <div className="mt-2 font-display text-[28px] font-medium leading-[1.2]">{copy.showTitle}</div>
            <div className="mt-[10px] max-w-[440px] text-sm leading-[1.65]" style={{ color: MUT }}>{copy.showBody}</div>
            <div className="mt-4 flex flex-wrap gap-[7px]">
              {copy.chips.map((c) => (
                <span key={c} className="rounded-full border px-3 py-[6px] text-xs"
                  style={{ borderColor: LINE, background: BG }}>
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border p-[18px]" style={{ borderColor: LINE, background: BG }}>
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold">{copy.heatTitle}</span>
              <span className="text-[11.5px]" style={{ color: MUT }}>{copy.heatMeta}</span>
            </div>
            {/*
              `min-w-0 break-words` on the column headers, which the prototype's
              `flex:1` does not have. A flex item's automatic minimum size is its
              min-content width, so a one-word label like "Anbefale" refuses to
              shrink: below about 1100px the header row broke out of the card and
              stopped lining up with the cells underneath it, and at 320px it
              pushed the page into horizontal scroll. The body cells already
              shrink because their contents are two characters wide. Nothing
              changes at the design's own width (docs/DEVIATIONS.md D75).
            */}
            <div className="mt-3 flex gap-[5px] pl-[92px]">
              {copy.heatCols.map((c) => (
                <span key={c} className="min-w-0 flex-1 break-words text-[10px] leading-[1.3]" style={{ color: MUT }}>{c}</span>
              ))}
            </div>
            <div className="mt-[6px] flex flex-col gap-[5px]">
              {copy.heatTeams.map((team, ri) => (
                <div key={team} className="flex items-center gap-[5px]">
                  <span className="w-[88px] flex-none text-xs font-semibold">{team}</span>
                  {HEAT[ri]!.map((cell, ci) => (
                    <span key={ci}
                      className="flex h-8 flex-1 items-center justify-center rounded-[7px] text-xs font-semibold"
                      style={{ background: cell ? cell[1] : 'rgba(25,21,16,.06)' }}>
                      {cell ? cell[0] : copy.few}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <span className="rounded-full px-[13px] py-[7px] text-[11.5px] font-bold" style={{ background: AC }}>
                {copy.heatCta}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- drivers */}
      <section id="svar" className={`${SECTION} scroll-mt-6 pt-[76px]`}>
        <span className="text-[11px] uppercase tracking-[.1em]" style={{ color: MUT }}>{copy.navWhy}</span>
        <h2 className="mt-2 max-w-[600px] text-pretty font-display text-[28px] font-medium leading-[1.15] md:text-4xl">{copy.driverTitle}</h2>
        <div className="mt-7 grid grid-cols-1 gap-[18px] md:grid-cols-3">
          {copy.drivers.map((d, i) => (
            <div key={d.title} className="rounded-[20px] border p-[26px]"
              style={{ borderColor: LINE, background: DRIVER_TINTS[i] }}>
              <div className="font-display text-[34px] font-medium leading-none">{d.stat}</div>
              <div className="mt-[14px] text-[17px] font-semibold">{d.title}</div>
              <div className="mt-[6px] text-[13.5px] leading-[1.6]" style={{ color: MUT }}>{d.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- use cases */}
      <section id="bruksomrader" className={`${SECTION} scroll-mt-6 pt-[76px]`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="text-[11px] uppercase tracking-[.1em]" style={{ color: MUT }}>{copy.navUse}</span>
            <h2 className="mt-2 max-w-[520px] text-pretty font-display text-[28px] font-medium leading-[1.15] md:text-4xl">{copy.useTitle}</h2>
          </div>
          <p className="m-0 max-w-[380px] text-[14.5px] leading-[1.65]" style={{ color: MUT }}>{copy.useBody}</p>
        </div>
        <div className="mt-[30px] grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
          {copy.useCases.map((u, i) => (
            <div key={u.title} className="flex flex-col rounded-[20px] border p-[26px]"
              style={{ borderColor: LINE, background: CASE_TINTS[i] }}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] uppercase tracking-[.1em]" style={{ color: MUT }}>{u.tag}</span>
                <span className="whitespace-nowrap rounded-full border px-[11px] py-[5px] text-[11.5px]"
                  style={{ borderColor: LINE, background: SF }}>{u.cadence}</span>
              </div>
              <div className="mt-3 font-display text-[22px] font-medium leading-[1.25]">{u.title}</div>
              <div className="mt-2 flex-1 text-[13.5px] leading-[1.6]" style={{ color: MUT }}>{u.desc}</div>
              <div className="mt-4 flex flex-wrap gap-[6px]">
                {u.chips.map((c) => (
                  <span key={c} className="rounded-full border px-[11px] py-[6px] text-[11.5px]"
                    style={{ borderColor: LINE, background: SF, color: MUT }}>{c}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- legal */}
      <section id="lovpalagt" className={`${SECTION} scroll-mt-6 pt-[76px]`}>
        <div className="grid grid-cols-1 items-start gap-10 rounded-[26px] p-6 md:p-10 xl:grid-cols-[.9fr_1.1fr]"
          style={{ background: INK, color: SF }}>
          <div>
            <span className="text-[11px] uppercase tracking-[.1em] opacity-70">{copy.legalKicker}</span>
            <div className="mt-[10px] text-pretty font-display text-[26px] font-medium leading-[1.15] md:text-[34px]">{copy.legalTitle}</div>
            <div className="mt-[14px] text-[14.5px] leading-[1.7] opacity-85">{copy.legalBody}</div>
            <a href="#konto" onClick={() => openPanel('signup')}
              className="touch-44 mt-[22px] inline-flex cursor-pointer items-center rounded-xl border-none px-6 py-[14px] text-[14.5px] font-bold no-underline"
              style={{ background: AC, color: INK }}>
              {copy.legalCta}
            </a>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {copy.duties.map((d) => (
              <div key={d.title} className="rounded-2xl border p-[18px]"
                style={{ background: 'rgba(255,253,246,.07)', borderColor: 'rgba(255,253,246,.14)' }}>
                <div className="text-[14.5px] font-semibold">{d.title}</div>
                <div className="mt-[3px] text-xs opacity-70">{d.law}</div>
                <span className="mt-3 inline-block rounded-full px-[10px] py-[5px] text-[11.5px] font-bold"
                  style={{ background: d.tone, color: INK }}>{d.due}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- steps */}
      <section className={`${SECTION} pt-[76px]`}>
        <span className="text-[11px] uppercase tracking-[.1em]" style={{ color: MUT }}>{copy.stepKicker}</span>
        <h2 className="mt-2 font-display text-[28px] font-medium leading-[1.15] md:text-4xl">{copy.stepTitle}</h2>
        <div className="mt-[26px] grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-4">
          {copy.steps.map((s, i) => (
            <div key={s.title} className="rounded-[18px] border p-6" style={{ borderColor: LINE, background: SF }}>
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] text-sm font-bold"
                style={{ background: AC }}>{i + 1}</div>
              <div className="mt-[14px] text-base font-semibold">{s.title}</div>
              <div className="mt-[6px] text-[13.5px] leading-[1.6]" style={{ color: MUT }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- pricing */}
      <section id="priser" className={`${SECTION} scroll-mt-6 pt-[76px]`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="text-[11px] uppercase tracking-[.1em]" style={{ color: MUT }}>{copy.navPrice}</span>
            <h2 className="mt-2 font-display text-[28px] font-medium leading-[1.15] md:text-4xl">{copy.priceTitle}</h2>
          </div>
          <div className="flex gap-[3px] rounded-full p-1" style={{ background: 'rgba(25,21,16,.05)' }}>
            {copy.billing.map((b) => {
              const on = (b.key === 'aar') === yearly
              return (
                <button key={b.key} type="button" onClick={() => setYearly(b.key === 'aar')} aria-pressed={on}
                  className="touch-44 cursor-pointer rounded-full border-none px-[18px] py-[9px] text-[13px] font-semibold"
                  style={{ background: on ? SF : 'transparent', boxShadow: on ? '0 1px 3px rgba(25,21,16,.14)' : 'none', color: INK }}>
                  {b.label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="mt-7 grid grid-cols-1 items-stretch gap-[18px] md:grid-cols-3">
          {copy.plans.map((p, i) => {
            const popular = i === 1
            return (
              <div key={p.name} className="relative flex flex-col rounded-[22px] p-7"
                style={{
                  border: `${popular ? '2px' : '1px'} solid ${popular ? INK : LINE}`,
                  background: i === 2 ? '#FBEBBE' : SF,
                }}>
                {popular ? (
                  <span className="absolute -top-3 left-7 rounded-full px-3 py-[5px] text-[11px] font-bold"
                    style={{ background: INK, color: SF }}>{copy.popular}</span>
                ) : null}
                <div className="text-sm font-bold">{p.name}</div>
                <div className="mt-[10px] flex items-baseline gap-[6px]">
                  <span className="font-display text-[40px] font-medium leading-none">
                    {p.price ?? (yearly ? p.priceY : p.priceM)}
                  </span>
                  <span className="text-[13px]" style={{ color: MUT }}>{p.unit}</span>
                </div>
                <div className="mt-[6px] text-[13px] leading-[1.5]" style={{ color: MUT }}>{p.desc}</div>
                <div className="mt-5 flex flex-1 flex-col gap-[9px]">
                  {p.features.map((f) => (
                    <div key={f} className="flex items-start gap-[9px] text-[13.5px] leading-[1.45]">
                      <span className="mt-px flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ background: AC2 }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>
                {/*
                  DECISIONS Q10: prices are the marketing claim and stay
                  exactly as designed; every CTA is a conversation, because
                  there is no billing engine to take a payment. The free plan
                  is the one that really can be self-served.
                */}
                <a
                  href="#konto"
                  onClick={() => openPanel(i === 0 ? 'signup' : 'demo', i === 0 ? undefined : p.name)}
                  className="touch-44 mt-[22px] inline-flex cursor-pointer items-center justify-center rounded-xl p-[13px] text-sm font-bold no-underline"
                  style={{
                    border: popular ? 'none' : `1px solid ${i === 2 ? INK : LINE}`,
                    background: popular ? AC : 'transparent',
                    color: INK,
                  }}
                >
                  {p.cta}
                </a>
              </div>
            )
          })}
        </div>
        <div className="mt-[14px] text-[12.5px]" style={{ color: MUT }}>{copy.priceFine}</div>
      </section>

      {/* --------------------------------------------------------------- faq */}
      <section className={`${SECTION} pt-[76px]`}>
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[.8fr_1.2fr]">
          <div>
            <span className="text-[11px] uppercase tracking-[.1em]" style={{ color: MUT }}>{copy.faqKicker}</span>
            <h2 className="mt-2 font-display text-[26px] font-medium leading-[1.15] md:text-[32px]">{copy.faqTitle}</h2>
          </div>
          <div className="flex flex-col">
            {copy.faq.map((f, i) => {
              const open = faqOpen === i
              return (
                <div key={f.q} className="border-b py-[18px]" style={{ borderColor: LINE }}>
                  <button type="button" onClick={() => setFaqOpen(open ? -1 : i)} aria-expanded={open}
                    className="touch-44 flex w-full cursor-pointer items-center justify-between gap-4 border-none bg-transparent p-0 text-left text-base font-semibold"
                    style={{ color: INK }}>
                    {f.q}
                    <span className="text-[18px]" style={{ color: MUT }}>{open ? '–' : '+'}</span>
                  </button>
                  {open ? (
                    <div className="mt-[10px] max-w-[620px] text-sm leading-[1.65]" style={{ color: MUT }}>{f.a}</div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- end cta */}
      <section className={`${SECTION} pt-[76px]`}>
        <div className="flex flex-wrap items-center justify-between gap-[30px] rounded-[26px] p-6 md:p-11"
          style={{ background: '#FBEBBE' }}>
          <div>
            <div className="font-display text-[26px] font-medium leading-[1.15] md:text-[34px]">{copy.endTitle}</div>
            <div className="mt-2 text-[15px]" style={{ color: MUT }}>{copy.endBody}</div>
          </div>
          <div className="flex flex-wrap gap-[10px]">
            <a href="#konto" onClick={() => openPanel('signup')}
              className="touch-44 inline-flex cursor-pointer items-center rounded-xl border-none px-7 py-4 text-center text-[15px] font-bold no-underline"
              style={{ background: INK, color: SF }}>
              {copy.ctaMain}
            </a>
            <a href="#konto" onClick={() => openPanel('demo')}
              className="touch-44 inline-flex cursor-pointer items-center rounded-xl border px-[26px] py-4 text-center text-[15px] font-semibold no-underline"
              style={{ borderColor: INK, color: INK }}>
              {copy.ctaDemo}
            </a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ footer */}
      <footer className={`${SECTION} pb-11 pt-[60px]`}>
        <div className="flex flex-wrap items-center justify-between gap-5 border-t pt-[26px] text-[12.5px]"
          style={{ borderColor: LINE, color: MUT }}>
          <span>{copy.footLegal} · {copy.footNote}</span>
          {/* The links keep the design's 12.5px type; `touch-44` grows only the
              hit area, and the row gap keeps two wrapped rows' areas apart. */}
          <span className="flex flex-wrap gap-x-[22px] gap-y-[26px]">
            <a href="/personvern" className="touch-44" style={{ color: MUT }}>{copy.footPrivacy}</a>
            <a href="/databehandleravtale" className="touch-44" style={{ color: MUT }}>{copy.footDpa}</a>
            <a href="/logg-inn" className="touch-44" style={{ color: MUT }}>{copy.navProduct}</a>
          </span>
        </div>
      </footer>
    </div>
  )
}

/** `?lang=` is a URL, so the picker navigates rather than holding state. */
function LangSelect({ label, locale }: { label: string; locale: string }) {
  return (
    <>
      {/* The design's globe sits inside the control, left of the value
          (HeiTuva Splash.dc.html:41). Decorative: the select already has an
          accessible name. */}
      <svg
        width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke={MUT} strokeWidth={1.8} aria-hidden="true"
        className="pointer-events-none absolute left-[11px]"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
      </svg>
      <select
        aria-label={label}
        defaultValue={locale}
        onChange={(e) => {
          const url = new URL(window.location.href)
          url.searchParams.set('lang', e.target.value)
          window.location.assign(url.toString())
        }}
        className="touch-44-field cursor-pointer appearance-none rounded-[10px] border py-[10px] pl-[33px] pr-[30px] text-[13.5px] font-semibold outline-none"
        style={{ borderColor: LINE, background: SF, color: INK }}
      >
        <option value="no">Norsk</option>
        <option value="en">English</option>
      </select>
      <span className="pointer-events-none absolute right-3 text-[10px]" style={{ color: MUT }}>
        ▾
      </span>
    </>
  )
}
