import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Buttons in the Orgpuls bundle are not one control with one radius. Four distinct
 * sizes appear, each with its own height, padding, radius and type scale, and they are
 * used consistently enough to be a scale rather than noise. Transcribed:
 *
 *   lg  h44 · pad 0 20 · r12 · 14.5px/700   primary page CTA ("Se hele resultatet")
 *   md  h42 · pad 0 18 · r11 · 14px/600-700 panel actions ("＋ Ny måling")
 *   sm  h36 · pad 0 16 · r10 · 12.5px/700   row actions ("Oppdater")
 *   xs  h34 · pad 0 15 · r9  · 12.5px/700   in-card actions ("Les utkastet")
 *
 * Tone:
 *   primary   #F5C64A on a #191510 hairline — the single strongest action on a screen
 *   secondary transparent on a #E8DFC9 hairline
 *   quiet     #FFFDF6 on a #191510 hairline — used inside tinted cards where a yellow
 *             fill would compete with the card itself
 *
 * The focus ring is not set here: globals.css applies the bundle's own
 * `3px solid #191510, offset 2px, radius 6px` to every :focus-visible control.
 */
type Size = 'lg' | 'md' | 'sm' | 'xs'
type Tone = 'primary' | 'secondary' | 'quiet'

const SIZE: Record<Size, string> = {
  lg: 'h-[44px] px-[20px] rounded-cta text-[14.5px]',
  md: 'h-[42px] px-[18px] rounded-btn text-[14px]',
  sm: 'h-[36px] px-[16px] rounded-ctl text-[12.5px]',
  xs: 'h-[34px] px-[15px] rounded-bar text-[12.5px]',
}

const TONE: Record<Tone, string> = {
  primary: 'border border-ink bg-ac text-ink font-bold',
  secondary: 'border border-line bg-transparent text-ink font-semibold',
  quiet: 'border border-ink bg-sf text-ink font-bold',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size
  tone?: Tone
  children: ReactNode
}

export function Button({
  size = 'md',
  tone = 'primary',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex flex-none items-center justify-center whitespace-nowrap leading-none cursor-pointer ${SIZE[size]} ${TONE[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
