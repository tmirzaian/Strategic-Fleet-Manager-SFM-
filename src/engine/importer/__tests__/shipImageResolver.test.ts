import { describe, it, expect } from 'vitest'
import { mergeWithExisting } from '../shipImageResolver'
import type { ShipImageMetadata } from '../../types'

describe('mergeWithExisting', () => {
  it('a valid RSI resolution wins when no manual override exists', () => {
    const result = mergeWithExisting(undefined, { primaryUrl: 'https://rsi.example/ship.jpg', source: 'RSI', status: 'resolved' })
    expect(result.primaryUrl).toBe('https://rsi.example/ship.jpg')
    expect(result.status).toBe('resolved')
  })

  it('a manual override always wins, even over a fresh RSI resolution attempt', () => {
    const existing: ShipImageMetadata = { primaryUrl: 'https://manual.example/ship.jpg', source: 'MANUAL_OVERRIDE', status: 'manual' }
    // Simulate a failed/fallback new lookup — manual should not be erased.
    const result = mergeWithExisting(existing, { primaryUrl: undefined, source: 'FALLBACK', status: 'failed' })
    expect(result).toBe(existing)
    expect(result.primaryUrl).toBe('https://manual.example/ship.jpg')
  })

  it('a failed resolver preserves an existing approved (resolved) image rather than erasing it', () => {
    const existing: ShipImageMetadata = { primaryUrl: 'https://rsi.example/old.jpg', source: 'RSI', status: 'resolved' }
    const result = mergeWithExisting(existing, { primaryUrl: undefined, source: 'FALLBACK', status: 'failed' })
    expect(result.primaryUrl).toBe('https://rsi.example/old.jpg')
    expect(result.status).toBe('resolved')
  })

  it('falls back to the local placeholder status only when nothing valid exists at all', () => {
    const result = mergeWithExisting(undefined, { primaryUrl: undefined, source: 'FALLBACK', status: 'failed' })
    expect(result.primaryUrl).toBeUndefined()
    expect(result.source).toBe('FALLBACK')
    expect(result.status).toBe('fallback')
  })

  it('a fresh valid resolution upgrades a prior fallback state', () => {
    const existing: ShipImageMetadata = { source: 'FALLBACK', status: 'fallback' }
    const result = mergeWithExisting(existing, { primaryUrl: 'https://rsi.example/new.jpg', source: 'RSI', status: 'resolved' })
    expect(result.primaryUrl).toBe('https://rsi.example/new.jpg')
    expect(result.status).toBe('resolved')
  })
})
