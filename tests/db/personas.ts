/**
 * Deterministic demo personas. Dev/CI only — these credentials exist solely in
 * the local stack and in throwaway CI containers, never in a real project.
 *
 * One org (Nordisk Studio) with the three roles CLAUDE.md defines, plus a
 * second org used to prove cross-org isolation from the browser as well as
 * from SQL.
 */
export const DEMO_PASSWORD = 'heituva-dev-password-1!'

export const PERSONAS = {
  administrator: { email: 'admin@nordiskstudio.test', name: 'Tuva Berg', role: 'administrator' },
  redaktor: { email: 'redaktor@nordiskstudio.test', name: 'Jonas Vik', role: 'redaktor' },
  leser: { email: 'leser@nordiskstudio.test', name: 'Mari Holm', role: 'leser' },
  outsider: { email: 'admin@annenbedrift.test', name: 'Even Aas', role: 'administrator' },
} as const

export type PersonaName = keyof typeof PERSONAS

export const ORG_PRIMARY = 'Nordisk Studio'
export const ORG_OTHER = 'Annen Bedrift AS'
export const GROUP_PRIMARY = 'Ledelse'
