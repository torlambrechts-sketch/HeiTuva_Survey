import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

/**
 * The design prototype pulls React, ReactDOM and Babel from unpkg at runtime,
 * and its typefaces from Google Fonts. Chromium in this environment cannot
 * reach either (the container's egress goes through a proxy Chromium does not
 * use), so the page never hydrates and every template renders as a literal
 * {{ placeholder }}.
 *
 * Node's fetch does go through the proxy, so we fetch once, cache to disk, and
 * fulfil the browser's requests from that cache. After the first run the
 * reference capture needs no network at all — which is what you want from a
 * baseline generator anyway.
 *
 * THE FONTS ARE NOT OPTIONAL. This helper used to abort the Google Fonts
 * requests and "let the page render with fallbacks". That quietly made every
 * reference PNG a Times/Arial rendering of the design: the layout was right and
 * the typography was not, so comparing an implementation's line breaks against
 * a baseline said nothing — the baseline's own text was 15% narrower than
 * Playfair at the same size. A fidelity baseline rendered in the wrong typeface
 * is worse than no baseline, because it looks like evidence.
 */
const CACHE = 'artifacts/.cdn-cache'

const ASSETS = [
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
]

/** Hosts whose responses are cached and replayed. Anything else is aborted, so
 *  a capture cannot silently depend on the network. */
const FONT_HOSTS = ['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/']

/**
 * Google Fonts serves a different stylesheet per User-Agent — an old UA gets
 * TTF, a modern one gets woff2. Node's fetch sends no browser UA at all, which
 * returns a stylesheet whose `src` Chromium then cannot use, so the UA is
 * pinned to the Chromium the captures run in.
 */
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const keyFor = (url: string, ext: string) =>
  createHash('sha1').update(url).digest('hex').slice(0, 16) + ext

async function ensureCached(url: string): Promise<string> {
  const path = join(CACHE, keyFor(url, '.js'))
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

/** The same, for the font stylesheet and the woff2 files it points at, which
 *  are bytes rather than text. */
async function ensureCachedBinary(url: string): Promise<Buffer> {
  const path = join(CACHE, keyFor(url, '.bin'))
  try {
    return await readFile(path)
  } catch {
    const res = await fetch(url, { headers: { 'user-agent': UA } })
    if (!res.ok) throw new Error(`Could not fetch ${url}: HTTP ${res.status}`)
    const body = Buffer.from(await res.arrayBuffer())
    await mkdir(CACHE, { recursive: true })
    await writeFile(path, body)
    return body
  }
}

function contentTypeFor(url: string) {
  if (url.startsWith('https://fonts.googleapis.com/')) return 'text/css; charset=utf-8'
  if (url.endsWith('.woff2')) return 'font/woff2'
  if (url.endsWith('.woff')) return 'font/woff'
  if (url.endsWith('.ttf')) return 'font/ttf'
  return 'application/octet-stream'
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
    if (FONT_HOSTS.some((h) => url.startsWith(h))) {
      try {
        return route.fulfill({
          status: 200,
          contentType: contentTypeFor(url),
          headers: { 'access-control-allow-origin': '*' },
          body: await ensureCachedBinary(url),
        })
      } catch (e) {
        // Loud, not silent: a baseline without the design's typefaces is the
        // exact failure this whole helper exists to prevent.
        throw new Error(
          `reference capture could not obtain a font (${url}): ${e instanceof Error ? e.message : e}`,
        )
      }
    }

    // Anything else: abort rather than hang on a blocked request.
    return route.abort()
  })
}
