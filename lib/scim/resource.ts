import { z } from 'zod'

/**
 * SCIM 2.0 (RFC 7643 / 7644) — the User resource, and only as much of it as
 * Entra ID's provisioning service actually sends.
 *
 * THIS IS A CLAIM SET AS MUCH AS A SCHEMA. Everything mapped here is something
 * the customer's directory asserts about a person and this product then acts on:
 * an address we will mail, a name a colleague will see, and an `active` flag
 * that decides whether someone keeps being surveyed about a workplace they may
 * have left. What is NOT mapped is as deliberate as what is (Q139):
 * `roles`, `groups` and `department` arrive and are ignored.
 */
export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
export const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error'
export const SCIM_PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp'

const Email = z.object({
  value: z.string().min(1).max(320),
  type: z.string().max(40).optional(),
  primary: z.boolean().optional(),
})

export const ScimUser = z.object({
  schemas: z.array(z.string()).optional(),
  id: z.string().max(200).optional(),
  externalId: z.string().min(1).max(200).optional(),
  userName: z.string().min(1).max(320),
  displayName: z.string().max(200).optional(),
  name: z
    .object({
      formatted: z.string().max(200).optional(),
      givenName: z.string().max(100).optional(),
      familyName: z.string().max(100).optional(),
    })
    .optional(),
  emails: z.array(Email).max(20).optional(),
  active: z.boolean().optional(),
})
export type ScimUser = z.infer<typeof ScimUser>

/** RFC 7644 § 3.5.2. Entra sends `replace` on `active` to deprovision, and
 *  occasionally an op with no `path` whose value is an object of attributes. */
export const ScimPatch = z.object({
  schemas: z.array(z.string()).optional(),
  Operations: z
    .array(
      z.object({
        op: z.string().min(1).max(20),
        path: z.string().max(200).optional(),
        value: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(100),
})

/**
 * WHICH SCIM ATTRIBUTE IS OUR `email` — Q144, and it is not cosmetic.
 *
 * Entra's default mapping sends `userName` = userPrincipalName and
 * `emails[type eq "work"].value` = mail. **Those differ at most real customers**
 * — a UPN is a sign-in name and often not a mailbox at all. Taking `userName`
 * would address every invitation to something that does not receive, and the
 * failure would look like «the survey reached nobody» rather than like a mapping
 * error, because `sent_at` means ACCEPTED BY THE PROVIDER and not delivered
 * (D133) and `bounced_at` has no writer.
 *
 * So: the primary work address if there is one, any address if there is not, and
 * `userName` only as the last resort.
 */
export function mailboxFor(u: ScimUser): string {
  const emails = u.emails ?? []
  const primary = emails.find((e) => e.primary && e.value)
  const work = emails.find((e) => (e.type ?? '').toLowerCase() === 'work' && e.value)
  const any = emails.find((e) => e.value)
  return (primary?.value ?? work?.value ?? any?.value ?? u.userName).trim().toLowerCase()
}

/** One `name`, because that is the column. Formatted first — it is the
 *  directory's own rendering and respects orders this code should not guess at
 *  by concatenating given + family. */
export function displayNameFor(u: ScimUser): string | null {
  const joined = [u.name?.givenName, u.name?.familyName].filter(Boolean).join(' ').trim()
  const picked = (u.name?.formatted ?? u.displayName ?? joined ?? '').trim()
  return picked === '' ? null : picked.slice(0, 200)
}

export type MemberRow = {
  id: string
  email: string
  name: string | null
  status: string
  external_id: string | null
  created_at: string
  synced_at: string | null
}

export function toScimUser(m: MemberRow, base: string): Record<string, unknown> {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: m.id,
    externalId: m.external_id ?? undefined,
    userName: m.email,
    displayName: m.name ?? undefined,
    name: m.name ? { formatted: m.name } : undefined,
    emails: [{ value: m.email, type: 'work', primary: true }],
    // `invited` is a member who has not signed in yet and is NOT deprovisioned.
    // Reporting them inactive would make the directory think it had already
    // deactivated them and stop sending the eventual `active: false`.
    active: m.status !== 'inactive',
    meta: {
      resourceType: 'User',
      created: m.created_at,
      lastModified: m.synced_at ?? m.created_at,
      location: `${base}/Users/${m.id}`,
    },
  }
}

export function scimError(status: number, detail: string, scimType?: string) {
  return Response.json(
    { schemas: [SCIM_ERROR_SCHEMA], status: String(status), detail, ...(scimType ? { scimType } : {}) },
    { status, headers: { 'content-type': 'application/scim+json' } },
  )
}

export function scimJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'content-type': 'application/scim+json' },
  })
}

/**
 * The one filter Entra actually sends: `userName eq "someone@example.com"`.
 *
 * A general SCIM filter grammar is a parser, and writing one for an expression
 * set nobody sends would be inventing a feature. Anything else returns an empty
 * list rather than an error, because a service provider that 400s on an
 * unsupported filter makes the connector quarantine itself — the loud failure in
 * the wrong place.
 */
export function parseUserNameFilter(filter: string | null): string | null {
  if (!filter) return null
  const m = /^\s*(userName|externalId)\s+eq\s+"([^"]{1,320})"\s*$/i.exec(filter)
  if (!m) return null
  return m[2]!.trim().toLowerCase()
}

export function filterAttribute(filter: string | null): 'userName' | 'externalId' | null {
  if (!filter) return null
  const m = /^\s*(userName|externalId)\s+eq\s+"/i.exec(filter)
  if (!m) return null
  return m[1]!.toLowerCase() === 'externalid' ? 'externalId' : 'userName'
}
