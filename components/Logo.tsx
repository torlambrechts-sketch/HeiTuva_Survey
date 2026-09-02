/** Logo mark copied verbatim from /design-reference (header, ~line 140).
 *  Do not redraw it. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="HeiTuva"
      role="img"
      className="block flex-none"
    >
      <path
        d="M6 3h20a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H14.6l-6.1 5.2A1 1 0 0 1 7 27.4V23H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"
        fill="var(--ac)"
      />
      <rect x="8.5" y="14.5" width="3.6" height="4.6" rx="1.3" fill="var(--ink)" />
      <rect x="14.2" y="11" width="3.6" height="8.1" rx="1.3" fill="var(--ink)" />
      <rect x="19.9" y="7.4" width="3.6" height="11.7" rx="1.3" fill="var(--ink)" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="font-logo text-[20px] font-bold tracking-[-0.03em]">HeiTuva</span>
  )
}
