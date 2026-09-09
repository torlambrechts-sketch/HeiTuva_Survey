import type { Config } from 'tailwindcss'

/**
 * Theme tokens are the ones fixed in CLAUDE.md. They are declared once as CSS
 * variables in app/globals.css and referenced here, so a value can never drift
 * between the two. Do not add colours that are not in the design bundle.
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        sf: 'var(--sf)',
        sf2: 'var(--sf2)',
        ink: 'var(--ink)',
        mut: 'var(--mut)',
        line: 'var(--line)',
        ac: 'var(--ac)',
        acf: 'var(--acf)',
        ac2: 'var(--ac2)',
        ac3: 'var(--ac3)',
        sbg: 'var(--sbg)',
        sbg2: 'var(--sbg2)',
        // V2-10, Q83: the four quiz option tiles (V2:4084-4089).
        qz1: 'var(--qz1)',
        qz2: 'var(--qz2)',
        qz3: 'var(--qz3)',
        qz4: 'var(--qz4)',
      },
      borderRadius: { DEFAULT: '16px', card: '16px' },
      boxShadow: { card: '0 2px 10px rgba(25,21,16,.05)' },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        logo: ['var(--font-logo)', 'var(--font-body)', 'sans-serif'],
      },
      fontSize: { base: '14px' },
      keyframes: {
        enter: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { enter: 'enter .25s ease' },
    },
  },
  plugins: [],
} satisfies Config
