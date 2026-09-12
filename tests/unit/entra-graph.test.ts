import { describe, expect, it } from 'vitest'
import { GRAPH_SELECT, mailboxFor, parsePage, retryAfterMs } from '@/lib/directory/graph'

/**
 * The Graph half, tested without a network and without credentials — which is
 * the point of it being a pure module. AZURE_CLIENT_ID and AZURE_CLIENT_SECRET
 * are not here yet; every decision this file makes is provable anyway.
 */
describe('what we ask Graph for', () => {
  it('asks for department and accountEnabled EXPLICITLY, because Graph does not return them', () => {
    /* Measured at I2-0 against Microsoft's reference: only a subset of user
       properties comes back by default, and neither of these is in it. A worker
       that omitted `$select` would receive users with no department and report,
       truthfully and uselessly, that nobody has one. */
    expect([...GRAPH_SELECT]).toContain('department')
    expect([...GRAPH_SELECT]).toContain('accountEnabled')
  })

  it('and asks for nothing it does not read — the promise the page makes', () => {
    /* «Ingenting utover dette leses fra katalogen» is checkable only if the
       query matches the field list. `jobTitle` is returned by default and is
       still not requested; the three refused fields are not requested either. */
    for (const refused of ['jobTitle', 'manager', 'employeeHireDate', 'employeeLeaveDateTime']) {
      expect([...GRAPH_SELECT]).not.toContain(refused)
    }
  })
})

describe('the mailbox, when Graph gives two and one is a lie', () => {
  it('prefers mail, falls back to the UPN', () => {
    expect(mailboxFor({ mail: 'A@X.no', userPrincipalName: 'b@x.no' })).toBe('a@x.no')
    expect(mailboxFor({ mail: null, userPrincipalName: 'B@X.no' })).toBe('b@x.no')
  })

  it('and a UPN that is not an address is not an address', () => {
    // Graph allows a UPN with no `@` for some federated identities. Microsoft's
    // own wording is that a UPN maps to the mail name «by convention».
    expect(mailboxFor({ mail: null, userPrincipalName: 'DOMAIN\\user' })).toBeNull()
    expect(mailboxFor({})).toBeNull()
  })
})

describe('parsing a page', () => {
  const page = (value: unknown[], next?: string) => ({ value, '@odata.nextLink': next })

  it('skips a user with no id or no address rather than inventing one', () => {
    const p = parsePage(page([
      { id: 'a', mail: 'a@x.no' },
      { id: '', mail: 'b@x.no' },
      { id: 'c', mail: null, userPrincipalName: 'nope' },
    ]))
    expect(p.users.map((u) => u.externalId)).toEqual(['a'])
  })

  it('ABSENT accountEnabled IS NOT FALSE', () => {
    /* The sharpest decision in this module. If `$select` failed, or Graph
       omitted the field, «we do not know» is the truth and «still employed» is
       the safe reading — deactivating somebody on a field we failed to request
       is the worst available reading of an absence, and it would stop their
       surveys silently. */
    expect(parsePage(page([{ id: 'a', mail: 'a@x.no' }])).users[0]!.accountEnabled).toBe(true)
    expect(
      parsePage(page([{ id: 'a', mail: 'a@x.no', accountEnabled: false }])).users[0]!.accountEnabled,
    ).toBe(false)
  })

  it('an empty department is null, not an empty group name', () => {
    expect(parsePage(page([{ id: 'a', mail: 'a@x.no', department: '   ' }])).users[0]!.department)
      .toBeNull()
  })

  it('carries the nextLink so paging is Graph’s to decide, not ours', () => {
    expect(parsePage(page([], 'https://graph/next')).nextLink).toBe('https://graph/next')
    expect(parsePage(page([])).nextLink).toBeNull()
  })

  it('a malformed body is an empty page, not a crash', () => {
    for (const body of [null, undefined, {}, { value: 'not an array' }]) {
      expect(parsePage(body).users).toEqual([])
    }
  })
})

describe('retrying', () => {
  it('honours Retry-After on 429, capped', () => {
    expect(retryAfterMs(429, '5', 0)).toBe(5000)
    expect(retryAfterMs(429, '9999', 0)).toBe(60_000)
  })

  it('backs off on 5xx without a header', () => {
    expect(retryAfterMs(503, null, 0)).toBe(1000)
    expect(retryAfterMs(503, null, 3)).toBe(8000)
  })

  it('DOES NOT RETRY 401 OR 403 — those are not transient', () => {
    /* 401 means the refresh token is dead and 403 means consent was revoked.
       Retrying either just delays telling the customer, and the whole of
       property 1 is that a broken connector is loud. */
    expect(retryAfterMs(401, null, 0)).toBeNull()
    expect(retryAfterMs(403, null, 0)).toBeNull()
    expect(retryAfterMs(400, null, 0)).toBeNull()
  })

  it('and gives up rather than retrying for ever', () => {
    expect(retryAfterMs(429, '1', 4)).toBeNull()
  })
})
