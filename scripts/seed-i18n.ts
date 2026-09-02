/**
 * Upserts /messages/<lang>.json into ui_messages.
 * Usage: npx tsx scripts/seed-i18n.ts [--local]
 *   --local targets the local `supabase start` stack instead of .env.local.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const useLocal = process.argv.includes('--local')
if (!useLocal) config({ path: '.env.local' })

const url = useLocal ? 'http://127.0.0.1:54321' : process.env.NEXT_PUBLIC_SUPABASE_URL
const key = useLocal
  ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  : process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing Supabase URL or service-role key. Set .env.local, or pass --local.')
  process.exit(1)
}

type Flat = { namespace: string; key: string; lang: string; value: string }

/** messages/*.json is one level of namespace then flat keys. */
function flatten(lang: string, json: Record<string, unknown>): Flat[] {
  const rows: Flat[] = []
  for (const [namespace, entries] of Object.entries(json)) {
    if (typeof entries !== 'object' || entries === null) continue
    for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
      if (typeof value === 'string') rows.push({ namespace, key, lang, value })
    }
  }
  return rows
}

async function main() {
  const supabase = createClient(url!, key!, { auth: { persistSession: false } })
  const files = readdirSync('messages').filter((f) => f.endsWith('.json'))
  let total = 0

  for (const file of files) {
    const lang = file.replace(/\.json$/, '')
    const rows = flatten(lang, JSON.parse(readFileSync(join('messages', file), 'utf8')))
    if (!rows.length) continue

    // Chunked so a large message set does not exceed the request size limit.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500)
      const { error } = await supabase
        .from('ui_messages')
        .upsert(chunk, { onConflict: 'namespace,key,lang' })
      if (error) {
        console.error(`  ${lang}: ${error.message}`)
        process.exit(1)
      }
    }
    console.log(`  ${lang}: ${rows.length} messages`)
    total += rows.length
  }
  console.log(`seeded ${total} messages from ${files.length} file(s)`)
}

main()
