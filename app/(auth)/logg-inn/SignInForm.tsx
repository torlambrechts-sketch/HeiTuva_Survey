'use client'

import { useActionState } from 'react'
import { sendMagicLink, signInWithPassword, type AuthState } from './actions'

type Labels = {
  email: string
  password: string
  signIn: string
  sendLink: string
  linkSent: string
  invalid: string
}

const field =
  'mt-1.5 box-border w-full rounded-[10px] border border-line bg-bg px-[13px] py-[11px] text-[14px] text-ink outline-none'
const label = 'block text-[11px] uppercase tracking-[.09em] text-mut'

export function SignInForm({ labels }: { labels: Labels }) {
  const [pwState, pwAction, pwPending] = useActionState<AuthState, FormData>(
    signInWithPassword,
    {},
  )
  const [linkState, linkAction, linkPending] = useActionState<AuthState, FormData>(
    sendMagicLink,
    {},
  )

  const error = pwState.error ?? linkState.error

  return (
    <form className="mt-4 flex flex-col gap-3.5">
      <label className="block">
        <span className={label}>{labels.email}</span>
        <input name="email" type="email" autoComplete="email" required className={field} />
      </label>

      <label className="block">
        <span className={label}>{labels.password}</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className={field}
        />
      </label>

      {error ? (
        <p role="alert" className="text-[12.5px] font-semibold text-ink">
          {labels.invalid}
        </p>
      ) : null}

      {linkState.sent ? (
        <p role="status" className="text-[12.5px] text-mut">
          {labels.linkSent}
        </p>
      ) : null}

      <button
        formAction={pwAction}
        disabled={pwPending}
        className="cursor-pointer rounded-[10px] border-none bg-ac px-[22px] py-3 text-[13.5px] font-bold text-ink disabled:opacity-60"
      >
        {labels.signIn}
      </button>

      <button
        formAction={linkAction}
        disabled={linkPending}
        className="cursor-pointer rounded-[10px] border border-line bg-transparent px-[22px] py-3 text-[13px] font-semibold text-ink disabled:opacity-60"
      >
        {labels.sendLink}
      </button>
    </form>
  )
}
