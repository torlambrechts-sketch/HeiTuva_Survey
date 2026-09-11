'use client'

import { useState } from 'react'

/**
 * C3 — the per-question comment (V3:3618-3665), and the sentence that makes it
 * honest.
 *
 * ── WHY THIS IS NOT THE TEXTAREA DIRECTLY ABOVE IT ─────────────────────────
 *
 * The question card already carries a free-text box — `answers.comment`,
 * «Vil du utdype? (valgfritt)». That one is an ANSWER: it lives in the vault,
 * `get_quotes` refuses it below the k threshold and strips group labels, and a
 * manager never reads one person's words unaggregated.
 *
 * This one is a MESSAGE. It lives in `survey_comments`, outside the vault, with
 * its own RLS and no aggregate path to it (Q112). **The k-gate on CONTENT does
 * not apply to it at all** — a thread is one person by construction, so there is
 * no aggregate to hide in.
 *
 * Two boxes, on one card, with different protections. **The bundle draws both
 * and distinguishes neither**, and a respondent cannot be expected to infer
 * which promise covers which box. So each says what it is: the vault field gets
 * one line, and this one gets Q112's sentence.
 *
 * ── THE SENTENCE IS NOT THE ANONYMITY BANNER, AND MUST NOT BECOME IT ───────
 *
 * «Anonymt» and «ingen kan lese det du skrev alene» are two promises. Today's
 * banner makes the first while implying the second. This feature keeps the first
 * and removes the second, so a banner reading «anonymt» over this box would be
 * technically true and materially misleading — the worst kind of true.
 */
export function QuestionComment({
  saved,
  anonymous,
  chooseNote,
  onSave,
  strings: s,
}: {
  saved: { text: string; anon: boolean } | null
  /** How this comment will be stored. Derived from the survey's feedback mode
   *  and — where that mode is `optional` — from the SUBMISSION's one choice
   *  (Q113). There is no per-comment toggle here, deliberately: the database
   *  takes no per-comment anonymity input, so a toggle would be a control over
   *  nothing. */
  anonymous: boolean
  /** Rendered where the one choice lives elsewhere on the page, so the reader
   *  can see what governs this box. Null when there is no choice to make. */
  chooseNote: string | null
  onSave: (text: string) => void
  strings: {
    promise: string
    openLabel: string
    hint: string
    replyAnonymous: string
    replyNamed: string
    placeholder: string
    save: string
    cancel: string
    edit: string
    savedAnon: string
    savedNamed: string
  }
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(saved?.text ?? '')

  if (!open) {
    if (saved) {
      // V3:3647-3652 — the saved pill, `--ac2`, with «Endre».
      return (
        <div
          className="mt-4 flex items-center justify-between gap-2.5 rounded-[11px] px-3.5 py-3"
          style={{ background: 'var(--ac2)' }}
        >
          <span className="min-w-0 text-[12.5px] leading-[1.45]">
            {saved.anon ? s.savedAnon : s.savedNamed}
          </span>
          <button
            type="button"
            onClick={() => {
              setText(saved.text)
              setOpen(true)
            }}
            className="touch-44 flex-none cursor-pointer whitespace-nowrap border-none bg-transparent p-0 text-xs font-bold text-ink underline"
          >
            {s.edit}
          </button>
        </div>
      )
    }
    // V3:3620-3624 — the dashed invitation.
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="touch-44 mt-4 flex w-full cursor-pointer items-center gap-[9px] rounded-[11px] border border-dashed border-line bg-transparent px-3.5 py-[11px] text-left text-[13px] text-mut"
      >
        <span
          aria-hidden
          className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-xs text-ink"
          style={{ background: 'var(--sbg)' }}
        >
          ＋
        </span>
        {s.openLabel}
      </button>
    )
  }

  return (
    <div className="mt-4 rounded-[13px] border border-line bg-bg p-4">
      <p className="text-[13px] leading-[1.5] text-mut">
        {s.hint} {anonymous ? s.replyAnonymous : s.replyNamed}
      </p>
      {/* Q112. Its own paragraph, in the ink colour rather than `--mut`: it is
          the promise, not a hint about the promise. */}
      <p className="mt-2 text-[12.5px] font-semibold leading-[1.45] text-ink">{s.promise}</p>
      {chooseNote ? <p className="mt-1.5 text-[12px] leading-[1.4] text-mut">{chooseNote}</p> : null}
      <textarea
        rows={3}
        value={text}
        placeholder={s.placeholder}
        aria-label={s.openLabel}
        onChange={(e) => setText(e.target.value)}
        className="mt-2.5 w-full resize-y rounded-[10px] border border-line bg-sf px-3.5 py-3 text-[14px] leading-relaxed text-ink outline-none"
      />
      <div className="mt-2.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setText(saved?.text ?? '')
            setOpen(false)
          }}
          className="touch-44 cursor-pointer rounded-[10px] border border-line bg-transparent px-3.5 py-[9px] text-[12.5px] font-semibold text-ink"
        >
          {s.cancel}
        </button>
        <button
          type="button"
          disabled={!text.trim()}
          onClick={() => {
            onSave(text.trim())
            setOpen(false)
          }}
          className="touch-44 cursor-pointer rounded-[10px] border-none bg-ac px-3.5 py-[9px] text-[12.5px] font-semibold text-ink disabled:opacity-50"
        >
          {s.save}
        </button>
      </div>
    </div>
  )
}
