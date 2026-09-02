import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

/**
 * The design prototype pulls React, ReactDOM and Babel from unpkg at runtime.
 * Chromium in this environment cannot reach it (the container's egress goes
 * through a proxy Chromium does not use), so the page never hydrates and every
 * template renders as a literal {{ placeholder }}.
 *
 * Node's fetch does go through the proxy, so we fetch once, cache to disk, and
 * fulfil the browser's requests from that cache. After the first run the
 * reference capture needs no network at all — which is what you want from a
 * baseline generator anyway.
 */
const CACHE = 'artifacts/.cdn-cache'

const ASSETS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
]

const keyFor = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 16) + '.js'

async function ensureCached(url: string): Promise<string> {
  const path = join(CACHE, keyFor(url))
  try {
    return await readFile(path, 'utf8')
  } catch {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Could not fetch ${url}: HTTP ${res.status}`)
    const body = await res.text()
    await mkdir(CACHE, { recursive: true })
    await writeFile(path, body)
    return body
  }
}

/** Routes the prototype's CDN requests to the local cache. Anything else that
 *  tries to leave the page is aborted, so a capture cannot silently depend on
 *  the network. */
export async function serveCdnFromCache(page: Page) {
  const bodies = new Map<string, string>()
  for (const url of ASSETS) bodies.set(url, await ensureCached(url))

  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.startsWith('file://')) return route.continue()

    const hit = ASSETS.find((a) => url.startsWith(a.split('?')[0]!))
    if (hit) {
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: bodies.get(hit)!,
      })
    }
    // Google Fonts and anything else: let the page render with fallbacks
    // rather than hang waiting on a blocked request.
    return route.abort()
  })
}
