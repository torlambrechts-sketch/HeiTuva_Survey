import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CHANNELS,
  CHANNEL_FLAG_KEYS,
  CHANNEL_KEY,
  FLAGGED_CHANNELS,
  type Channel,
} from '@/lib/send/registry'

/**
 * The registry is only a registry if it is the thing that decides.
 *
 * `FLAGGED_CHANNELS` sat in this file with ZERO references anywhere in the
 * repository while the Send screen hard-coded `c !== 'sms' || smsEnabled`.
 * Nothing failed, because a registry nobody reads still type-checks. These
 * tests assert the properties that make it load-bearing, so the next channel
 * cannot quietly become another branch in a component.
 *
 * The exhaustiveness the compiler already gives (`Channel` derives from the
 * database enum, `CHANNEL_KEY` is a total `Record<Channel, …>`) is asserted at
 * runtime too: the compile-time break is what stops a bad build, and this is
 * what says out loud what the break means.
 */
const messages = (lang: 'no' | 'en') =>
  JSON.parse(readFileSync(`messages/${lang}.json`, 'utf8')) as Record<
    string,
    Record<string, string>
  >

describe('the channel registry is complete', () => {
  it('names every channel the database enum has', () => {
    // CHANNELS is `satisfies readonly Channel[]`, so a stale value fails to
    // compile; this is the other direction — a value the schema gained.
    const known = new Set<string>(CHANNELS)
    for (const c of Object.keys(CHANNEL_KEY)) expect(known.has(c)).toBe(true)
    expect(Object.keys(CHANNEL_KEY).length).toBe(CHANNELS.length)
  })

  it('gives every channel a label and a description key', () => {
    for (const c of CHANNELS) {
      expect(CHANNEL_KEY[c].label).toBeTruthy()
      expect(CHANNEL_KEY[c].desc).toBeTruthy()
    }
  })

  it('resolves those keys in both shipped languages', () => {
    for (const lang of ['no', 'en'] as const) {
      const send = messages(lang).send ?? {}
      for (const c of CHANNELS) {
        expect(send[CHANNEL_KEY[c].label], `${lang}.send.${CHANNEL_KEY[c].label}`).toBeTruthy()
        expect(send[CHANNEL_KEY[c].desc], `${lang}.send.${CHANNEL_KEY[c].desc}`).toBeTruthy()
      }
      // The copy a gated card shows instead of its description.
      expect(send.chComingSoon).toBeTruthy()
    }
  })
})

describe('the flag registry is the gate', () => {
  it('gates only channels that exist', () => {
    for (const c of Object.keys(FLAGGED_CHANNELS)) {
      expect(CHANNELS as readonly string[]).toContain(c)
    }
  })

  it('names a flag that the seed actually creates', () => {
    // A gated channel whose flag was never seeded is not "off" — it is a key
    // with no row, which `isFlagEnabled` resolves to the caller's fallback.
    // For a channel that is `false`, so the card would be permanently
    // unavailable with nothing anywhere reporting why.
    const seed = readFileSync('supabase/seed.sql', 'utf8')
    for (const key of CHANNEL_FLAG_KEYS) {
      expect(seed, `seed.sql has no feature_flags row for ${key}`).toContain(`'${key}'`)
    }
  })

  it('derives the keys the screen must resolve, deduplicated', () => {
    const expected = [
      ...new Set(CHANNELS.map((c) => FLAGGED_CHANNELS[c]).filter(Boolean)),
    ]
    expect([...CHANNEL_FLAG_KEYS]).toEqual(expected)
    expect(new Set(CHANNEL_FLAG_KEYS).size).toBe(CHANNEL_FLAG_KEYS.length)
  })

  it('leaves the design’s four channels ungated except SMS', () => {
    // Not a restatement of the constant: it is the product rule from D80 —
    // email, link and QR ship to everyone, SMS waits for its flag.
    const gated = CHANNELS.filter((c: Channel) => FLAGGED_CHANNELS[c])
    expect(gated).toEqual(['sms'])
  })
})
