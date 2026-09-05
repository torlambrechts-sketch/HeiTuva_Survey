'use client'

import { useActionState } from 'react'
import { verifyTotp, type MfaResult } from './actions'

type Labels = { code: string; verify: string; invalid: string; failed: string }

export function MfaForm({ factorId, labels }: { factorId: string; labels: Labels }) {
  const [state, action, pending] = useActionState<MfaResult | null, FormData>(verifyTotp, null)

  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="factorId" value={factorId} />
      <label className="block">
        <span className="block text-[11px] uppercase tracking-[.09em] text-mut">{labels.code}</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          className="mt-1.5 box-border w-full rounded-[10px] border border-line bg-bg px-[13px] py-[11px] text-center text-[20px] tracking-[.3em] text-ink outline-none"
        />
      </label>

      {state ? (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-ink">
          {state.error === 'invalid_code' ? labels.invalid : labels.failed}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full cursor-pointer rounded-[10px] border-none bg-ac px-[22px] py-3 text-[13.5px] font-bold text-ink disabled:opacity-60"
      >
        {labels.verify}
      </button>
    </form>
  )
}
