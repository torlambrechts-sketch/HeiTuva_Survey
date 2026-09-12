/**
 * CAPABILITY PROBE — every external dependency, CALLED.
 *
 * WHY THIS EXISTS, and it is two failures rather than one, because they are
 * different and only one of them a script can catch.
 *
 *   1. The Supabase MCP was reported unavailable from a SESSION NOTICE. No call
 *      was made. The connector had been authorised the whole time, and the
 *      first `list_projects` returned six projects.
 *
 *   2. Docker was reported unavailable from `docker info`, which returned
 *      «Cannot connect to the Docker daemon». That output was ACCURATE. The
 *      daemon was not running — and `dockerd &` brought it up in four seconds
 *      with the local Supabase stack still attached to it.
 *
 * The second is the instructive one. A fact about a PROCESS'S RUN STATE was
 * read as a fact about the ENVIRONMENT: «not running» read as «not available».
 * The call was made, the call was honest, and the conclusion was still wrong —
 * so a probe does not fix it. Only the rule fixes it, and the rule is in
 * CLAUDE.md beside D110's: a capability reported as unavailable carries the
 * call that established it, exactly as a number carries the command that
 * re-derives it.
 *
 * WHAT THIS SCRIPT IS NOT. It is not a list of everything that can be missing.
 * A list of capabilities to test is an enumeration, and the next thing assumed
 * will not be on it — row 9 of CLAUDE.md's table, aimed at this file. The
 * entries below are the dependencies this project has hit, and their value is
 * that each one CALLS rather than reads. When something new is assumed, the
 * remedy is the rule, and then a row here.
 *
 * It gates nothing: it exits 0 whatever it finds, because "no Docker" is a true
 * state of a laptop and not a defect. It reports what the call returned.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'
import dns from 'node:dns'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

type Result = { name: string; ok: boolean; call: string; raw: string }
const results: Result[] = []

/** Run a command and capture whatever it says — stdout, stderr, or the throw.
 *  Never returns a verdict of its own: the caller decides what the text means. */
function run(cmd: string, args: string[], timeout = 60_000): { ok: boolean; out: string } {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: true, out: out.trim() }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, out: (err.stdout ?? '') + (err.stderr ?? '') || err.message || 'no output' }
  }
}

function record(name: string, call: string, ok: boolean, raw: string) {
  results.push({ name, ok, call, raw: raw.split('\n').slice(0, 4).join('\n').slice(0, 400) })
}

// 1. Docker. The server half, not the client half — `docker --version` answers
//    about a binary and this project's mirror needs a daemon.
{
  const r = run('docker', ['info', '--format', '{{.ServerVersion}}'], 45_000)
  record('docker-daemon', 'docker info --format {{.ServerVersion}}', r.ok, r.out)
  if (!r.ok) {
    // The distinction the Docker failure turned on: a binary that exists with a
    // daemon that is not running is startable, and that is not the same state
    // as a machine without Docker. Report which one it is.
    const bin = run('which', ['dockerd'])
    record('dockerd-binary', 'which dockerd', bin.ok, bin.ok ? `${bin.out} (present — daemon may be startable)` : bin.out)
  }
}

// 2. Supabase CLI binary.
{
  const r = run('supabase', ['--version'], 30_000)
  record('supabase-cli', 'supabase --version', r.ok, r.out)
}

// 3. Supabase platform auth. Three places a token can be, and then the CALL that
//    says whether any of them worked — `supabase projects list` is the thing
//    `db push --linked` needs, so it is the honest probe rather than an env check.
{
  const envTok = process.env.SUPABASE_ACCESS_TOKEN
  const filePath = join(homedir(), '.supabase', 'access-token')
  const where = [
    envTok ? `env SUPABASE_ACCESS_TOKEN (len ${envTok.length})` : 'env SUPABASE_ACCESS_TOKEN absent',
    existsSync(filePath) ? `${filePath} present` : `${filePath} absent`,
  ].join(' · ')
  const r = run('supabase', ['projects', 'list'], 60_000)
  record('supabase-platform-auth', 'supabase projects list', r.ok, `${where}\n${r.out}`)
}

// 4. The Supabase Management API host — NOT the MCP.
//    Stated precisely because the difference is the whole point: the MCP server
//    holds its own credential in the agent's transport, and no child process can
//    borrow it or call it. What this row measures is whether the API HOST is
//    reachable from here; a 401 means reachable-and-unauthenticated, which is a
//    different fact from unreachable. Whether the MCP is authorised is settled
//    by calling one of its tools, and by nothing in this file.
{
  const r = run('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '25',
                         'https://api.supabase.com/v1/projects'], 40_000)
  record('supabase-mgmt-api-host', 'curl -o /dev/null -w %{http_code} https://api.supabase.com/v1/projects',
         r.ok, `HTTP ${r.out} (401 = host reachable, this process unauthenticated; the MCP's own auth is not measurable here)`)
}

/** A TCP connect with a deadline. `psql` would do, but it reports a driver
 *  error where the question is whether a socket opens at all. */
function tcp(host: string, port: number, ms = 20_000): Promise<string> {
  return new Promise((resolve) => {
    const s = new net.Socket()
    const done = (msg: string) => { s.destroy(); resolve(msg) }
    s.setTimeout(ms)
    s.once('connect', () => done('connected'))
    s.once('timeout', () => done(`timeout after ${ms}ms`))
    s.once('error', (e) => done((e as Error).message))
    s.connect(port, host)
  })
}

async function main() {
  // 5. Egress to the production database, both endpoints it has.
  //    The direct host is AAAA-only, so the address FAMILY is part of the
  //    answer: «no route» and «no IPv6 on this machine» are different repairs.
  const direct = process.env.SUPABASE_DB_URL ? new URL(process.env.SUPABASE_DB_URL).hostname : null
  if (direct) {
    let fam = 'unresolved'
    try {
      const addrs = await dns.promises.lookup(direct, { all: true })
      fam = addrs.map((a) => `IPv${a.family}`).join(',')
    } catch (e) { fam = (e as Error).message }
    record('prod-db-direct', `tcp connect ${direct}:5432`, false, `families: ${fam}\n${await tcp(direct, 5432)}`)
  }
  for (const h of ['aws-0-eu-central-1.pooler.supabase.com', 'aws-1-eu-central-1.pooler.supabase.com']) {
    const out = await tcp(h, 5432)
    record(`prod-db-pooler:${h.split('-')[1]}`, `tcp connect ${h}:5432`, out === 'connected', out)
  }

  // 6. The local stack — the mirror's target. A real query, because a container
  //    reporting healthy and a database accepting a connection are two claims.
  {
    const url = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    const r = run('psql', [url, '-At', '-c',
      "select current_database()||' | migrations='||(select count(*) from supabase_migrations.schema_migrations)"],
      30_000)
    record('local-db', 'psql "$LOCAL_DB_URL" -c "select …"', r.ok, r.out)
  }

  const pad = Math.max(...results.map((r) => r.name.length))
  console.log('\nCAPABILITY PROBE — each row is a call, not a notice\n')
  for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.name.padEnd(pad)}  $ ${r.call}`)
    for (const line of r.raw.split('\n')) console.log(`${' '.repeat(pad + 8)}${line}`)
  }
  console.log(
    '\nA row that reads FAIL is what the call returned NOW. It is not a property of\n' +
    'the machine: dockerd not running and Docker not installed print the same way,\n' +
    'and one of them is four seconds from OK. Read the raw text, not the verdict.\n')
}

void main()
