'use client'

import Link from 'next/link'
import { useState } from 'react'

export type UseCaseView = {
  key: string
  tag: string
  title: string
  cadence: string
  tint: string
  intro: string
  questions: number | null
  setup: { label: string; value: string }[]
  why: string[]
  types: string
  examples: string[]
  report: string[]
  anonNote: string
  tipTitle: string
  tipBody: string
}

const BG = '#FCF6E9'
const SF = '#FFFDF6'
const INK = '#191510'
const MUT = '#5F5849'
const LINE = '#E8DFC9'

/**
 * Public and respondent-facing surfaces are **mobile-first pixel-perfect at
 * 380–420px** per CLAUDE.md, not RESPONSIVE.md — so this page is a single
 * column that widens, rather than a desktop grid that collapses.
 *
 * Colours are literal rather than token classes for the same reason the splash
 * uses them: this tree renders outside the app shell, which is where the CSS
 * variables are defined.
 */
export function UseCases({
  cases,
  openKey,
  locale,
  labels,
}: {
  cases: UseCaseView[]
  openKey: string | null
  locale: string
  labels: Record<string, string>
}) {
  const [open, setOpen] = useState<string | null>(openKey)
  const shown = open ? cases.find((c) => c.key === open) : undefined
  const count = (n: number) =>
    n === 1 ? labels.questionsOne! : labels.questionsTemplate!.replace('{n}', String(n))

  return (
    <main style={{ background: BG, color: INK, minHeight: '100vh' }}>
      <div className="mx-auto w-full max-w-[1100px] px-5 pb-20 pt-10 md:px-8">
        <Link
          href="/"
          className="touch-44 inline-flex items-center rounded-[9px] px-1 py-2 text-[13px] font-semibold no-underline"
          style={{ color: MUT }}
        >
          HeiTuva
        </Link>

        {!shown ? (
          <>
            <h1 className="mt-4 font-display text-[34px] font-medium leading-[1.12] text-pretty md:text-[44px]">
              {labels.title}
            </h1>
            <p className="mt-3 max-w-[640px] text-[15px] leading-[1.6]" style={{ color: MUT }}>
              {labels.lead}
            </p>

            <div className="mt-8 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
              {cases.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setOpen(c.key)}
                  className="touch-44 flex min-w-0 cursor-pointer flex-col rounded-[16px] p-[18px] text-left"
                  style={{ background: c.tint, border: `1px solid ${LINE}`, color: INK }}
                >
                  <span className="flex items-center justify-between gap-2.5">
                    <span
                      className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[.09em]"
                      style={{ color: MUT }}
                    >
                      {c.tag}
                    </span>
                    {/* DERIVED, never stated. A use case with no pack shows no
                        number rather than the bundle's invented one. */}
                    <span className="whitespace-nowrap text-[11px]" style={{ color: MUT }}>
                      {c.questions !== null ? count(c.questions) : c.cadence}
                    </span>
                  </span>
                  <span className="mt-[9px] text-[16px] font-semibold leading-[1.25] text-pretty">
                    {c.title}
                  </span>
                  <span className="mt-1.5 flex-1 text-[13px] leading-[1.55]" style={{ color: MUT }}>
                    {c.intro}
                  </span>
                  <span className="mt-3 text-[12.5px] font-semibold">{labels.open}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="touch-44 mt-4 cursor-pointer rounded-[9px] bg-transparent px-3.5 py-2 text-[12px] font-semibold"
              style={{ border: `1px solid ${LINE}`, color: INK }}
            >
              {labels.back}
            </button>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <span
                className="whitespace-nowrap rounded-[999px] px-3 py-[5px] text-[11px] font-bold"
                style={{ background: shown.tint }}
              >
                {shown.tag}
              </span>
              <span className="text-[12px]" style={{ color: MUT }}>
                {shown.cadence}
                {shown.questions !== null ? ` · ${count(shown.questions)}` : ''}
              </span>
            </div>
            <h1 className="mt-3 font-display text-[32px] font-medium leading-[1.15] text-pretty md:text-[40px]">
              {shown.title}
            </h1>
            <p className="mt-3 max-w-[680px] text-[15px] leading-[1.65]" style={{ color: MUT }}>
              {shown.intro}
            </p>

            {shown.questions === null ? (
              // The plan said all nine were seeded as packs. One is not, and the
              // page says so rather than inheriting the bundle's «38 spørsmål».
              <p
                className="mt-4 max-w-[680px] rounded-[12px] px-4 py-3 text-[13px] leading-[1.55]"
                style={{ background: SF, border: `1px solid ${LINE}` }}
              >
                {labels.noPack}
              </p>
            ) : null}

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <Card title={labels.setup!}>
                <dl className="m-0 flex flex-col gap-2.5">
                  {shown.setup.map((s) => (
                    <div key={s.label} className="flex flex-wrap items-baseline justify-between gap-3">
                      <dt className="text-[13px] font-semibold">{s.label}</dt>
                      <dd className="m-0 text-[13px]" style={{ color: MUT }}>
                        {s.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>

              <Card title={labels.why!}>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {shown.why.map((w) => (
                    <li key={w} className="text-[13.5px] leading-[1.55]" style={{ color: MUT }}>
                      {w}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title={labels.types!}>
                <p className="m-0 text-[13.5px] leading-[1.55]" style={{ color: MUT }}>
                  {shown.types}
                </p>
              </Card>

              <Card title={labels.examples!}>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {shown.examples.map((e) => (
                    <li key={e} className="text-[13.5px] leading-[1.55]" style={{ color: MUT }}>
                      «{e}»
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title={labels.report!}>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {shown.report.map((r) => (
                    <li key={r} className="text-[13.5px] leading-[1.55]" style={{ color: MUT }}>
                      {r}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title={labels.anonymity!}>
                <p className="m-0 text-[13.5px] leading-[1.55]" style={{ color: MUT }}>
                  {shown.anonNote}
                </p>
              </Card>
            </div>

            <div
              className="mt-5 rounded-[16px] p-5"
              style={{ background: '#FBEBBE', border: `1px solid ${LINE}` }}
            >
              <div className="text-[13.5px] font-bold">{shown.tipTitle}</div>
              <p className="mt-1.5 m-0 max-w-[680px] text-[13.5px] leading-[1.55]">{shown.tipBody}</p>
            </div>
          </>
        )}

        <div className="mt-10">
          {/* The only outbound link on this page, and it goes to the login,
              which exists. The bundle's «Se detaljer» pointed at
              `HeiTuva Lovpalagt.dc.html`, a prototype file with no product
              behind it — Q56 CONFIRMED: strike it. D120. */}
          <Link
            href="/logg-inn"
            hrefLang={locale}
            className="touch-44 inline-flex items-center rounded-[11px] px-[22px] py-[13px] text-[14px] font-bold no-underline"
            style={{ background: '#F5C64A', color: INK }}
          >
            {labels.startCta}
          </Link>
        </div>
      </div>
    </main>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[16px] p-5" style={{ background: SF, border: `1px solid ${LINE}` }}>
      <h2 className="text-[11px] font-bold uppercase tracking-[.09em]" style={{ color: MUT }}>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}
