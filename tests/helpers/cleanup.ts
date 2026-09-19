/**
 * N10.7 — registered as a vitest `setupFiles` entry, so it applies to EVERY test
 * file including ones not written yet.
 *
 * Per-file teardown rather than a per-file edit: the alternative was an
 * `afterAll` in each of the fourteen files that create users, which is an
 * enumeration of the files that exist today — the shape this project keeps
 * paying for. A setup file is the property.
 */
import { afterAll } from 'vitest'
import { admin } from '../helpers'
import { dropCreatedUsers } from './created-users'

afterAll(async () => {
  await dropCreatedUsers((id) => admin().auth.admin.deleteUser(id))
}, 120_000)
