'use client'

import { useTranslations } from 'next-intl'
import type { RespondentBlock as Block } from '@/lib/respondent/flow'
import { respondentMediaHref } from '@/lib/surveys/media'

/**
 * V7-3c — a content block, in the respondent's own flow (v7:5399-5433).
 *
 * The card's chrome and its heading are the question card's: v7 renders the
 * block INSIDE the same `min-height:330px` panel and uses the same
 * `respondOne.text` line for the title, so a block is a step that reads rather
 * than a different kind of screen. Only the body differs, and which parts of it
 * appear is decided by the type.
 *
 * ── WHAT IS NOT HERE, AND WHY ──────────────────────────────────────────────
 *
 * **No `<iframe>`, no `<video>`.** v7 draws the video block as a CARD with a
 * play triangle and «Spill av videoen» (v7:5406-5412) — a control, not a
 * player — so a card is the fidelity-correct build. It opens the link in a new
 * tab, which makes the third-party request the RESPONDENT'S OWN navigation
 * rather than one her browser makes on this page's behalf. `rel="noopener
 * noreferrer"` keeps `/s/<token>` out of the `Referer` header; `safeVideoUrl`
 * (checked in `lib/respondent/flow.ts`) admits `https:` with a host and
 * nothing else. See `lib/surveys/media.ts` for the whole reasoning.
 *
 * **No storage URL.** The picture is `/s/<token>/media/<block_id>` — same
 * origin, which `img-src 'self'` admits and a Supabase signed URL would not.
 *
 * **v7 GATES TWO DIFFERENT DIVIDERS ON THE SAME PREDICATE** — `rBlockIsRule`
 * appears twice in `respondOne` (v7:7806 and v7:7807, identical) and twice in
 * the markup (v7:5420 and v7:5425), so the mock draws BOTH: a centred bar with
 * «Da går vi videre til neste del», and a rule with «Neste del» in its middle.
 * That is a duplicated key rather than a design decision — nothing could ever
 * select between them. The first ships, because it is the one that says
 * something; logged as a deviation rather than left as a guess.
 */
export function RespondentBlock({ block, token }: { block: Block; token: string }) {
  const t = useTranslations('respondent')

  // v7:7809-7810 — only `fact` is tinted, and only because the drawing says so.
  // `quote`'s `--ac2` left with the type Tor dropped.
  const tinted = block.type === 'fact'

  return (
    <section className="mt-4 flex min-h-[330px] flex-col rounded-2xl border border-line bg-sf px-6 pb-6 pt-[26px]">
      {/* THE STEP LINE IS NOT HERE. v7:5399-5433 draws no step text inside the
          block card: «Les · steg N av M» is `stepLabel` (v7:10442), which lives
          in the progress row beside the bar and switches form by step kind.
          Putting it here as well was an invention, and it printed the same
          sentence twice on one screen. */}
      {block.title ? (
        <h2 className="text-xl font-semibold leading-[1.35]">{block.title}</h2>
      ) : null}

      <div className="mt-4">
        {block.type === 'img' ? (
          block.hasMedia ? (
            <div className="h-[210px] overflow-hidden rounded-[14px] border border-line bg-bg">
              {/* eslint-disable-next-line @next/next/no-img-element -- next/image
                  would proxy through /_next/image, which needs the host in
                  `images.remotePatterns` and buys nothing here: the bytes
                  already come from our own origin behind the token check. */}
              <img
                src={respondentMediaHref(token, block.id)}
                alt={block.caption ?? block.title ?? ''}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            /* No picture chosen. The design's empty treatment rather than a
               tinted rectangle that looks like an image nobody can see —
               CLAUDE.md's never-fabricate rule applied to a placeholder. */
            <p className="rounded-[14px] border border-line bg-bg px-4 py-6 text-center text-[13px] text-mut">
              {t('blockImageMissing')}
            </p>
          )
        ) : null}

        {block.type === 'video' ? (
          block.url ? (
            <a
              href={block.url}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-44 flex items-center gap-[13px] rounded-[14px] border border-line bg-bg px-5 py-[18px] text-ink"
            >
              <span
                aria-hidden
                className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-ac"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 7l9 5-9 5z" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t('blockVideoPlay')}</span>
                <span className="mt-0.5 block text-[12.5px] text-mut">{t('blockVideoNewTab')}</span>
              </span>
            </a>
          ) : (
            <p className="rounded-[14px] border border-line bg-bg px-4 py-5 text-[13px] text-mut">
              {t('blockVideoMissing')}
            </p>
          )
        ) : null}

        {/* v7:5415 — `section`, `info` and `fact`. `rBlockPad` and `rBlockTint`
            are the drawing's, and only the fact box uses either. */}
        {block.body ? (
          <div
            className={`mt-3 rounded-[14px] text-[15.5px] leading-[1.65] ${
              tinted ? 'bg-sbg px-5 py-[18px]' : ''
            }`}
          >
            {block.body}
          </div>
        ) : null}

        {block.caption ? (
          <p className="mt-[9px] text-[12.5px] text-mut">{block.caption}</p>
        ) : null}

        {block.type === 'rule' ? (
          <div className="flex flex-col items-center gap-3.5 py-[26px]">
            <span aria-hidden className="block h-1 w-[54px] rounded-full bg-ac" />
            <span className="text-center text-[15px] leading-[1.5] text-mut">
              {t('blockRuleNext')}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
