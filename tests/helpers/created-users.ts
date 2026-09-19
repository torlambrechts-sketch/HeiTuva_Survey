/**
 * N10.7 — THE AUTH USER IS GLOBAL, AND DROPPING AN ORGANISATION CANNOT REACH IT.
 *
 * N10.2 gave every invariant fixture a teardown and it worked: two full suite
 * runs left `organizations` at 2 and the demo org's survey count at 12, where
 * one run used to leave 18 organisations behind.
 *
 * The same two runs took `auth.users` from 4 to 68 — **64 orphans, about 32 per
 * run.** Deleting an organisation cascades `org_members`; it does not and
 * cannot delete the `auth.users` row, because that row belongs to no
 * organisation. It is the class D241 named, one level further out: a fixture
 * writing a row that outlives the thing it was made for.
 *
 * THE REGISTRY IS PER FILE, NOT PER RUN. Vitest gives each test file its own
 * module graph, so this array only ever holds the users THAT file created, and
 * the `afterAll` in `tests/helpers/cleanup.ts` drains it when that file ends.
 *
 * ONLY ACTUAL CREATIONS ARE REMEMBERED. `findOrCreateUser` returns the demo
 * personas without creating them, and a persona must survive the suite — the
 * seed owns those rows, not a test. Nothing found is ever recorded, so nothing
 * found is ever deleted.
 */
const created: string[] = []

export function rememberCreatedUser(userId: string): void {
  if (userId) created.push(userId)
}

/**
 * Deletes what this file made. It READS its own error and throws — N10.2's rule
 * applied to itself, because a teardown whose rejection nobody reads is a leak
 * that reports success.
 */
export async function dropCreatedUsers(
  deleteUser: (id: string) => Promise<{ error: { message: string } | null }>,
): Promise<number> {
  const mine = created.splice(0, created.length)
  const failures: string[] = []
  for (const id of mine) {
    const { error } = await deleteUser(id)
    // Already gone is the goal state, not a failure.
    if (error && !/not found/i.test(error.message)) failures.push(`${id}: ${error.message}`)
  }
  if (failures.length > 0) throw new Error(`dropCreatedUsers: ${failures.join('; ')}`)
  return mine.length
}
