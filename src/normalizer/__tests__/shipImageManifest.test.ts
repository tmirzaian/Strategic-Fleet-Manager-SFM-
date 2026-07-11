import { describe, it, expect } from 'vitest'
import { buildShipImageManifest } from '../shipImageManifest'
import { shipImageOverrides } from '../../data/shipImageOverrides'

describe('buildShipImageManifest', () => {
  it('imported Gladius uses fallback (no override, no prior manifest entry)', () => {
    const { manifest } = buildShipImageManifest(['gladius-imported'], {})
    const entry = manifest.find((e) => e.shipId === 'gladius-imported')!
    expect(entry.status).toBe('fallback')
    expect(entry.primaryUrl).toBeNull()
    expect(entry.source).toBe('FALLBACK')
  })

  it('imported Avenger Titan uses fallback (no override, no prior manifest entry)', () => {
    const { manifest } = buildShipImageManifest(['avenger-titan-imported'], {})
    const entry = manifest.find((e) => e.shipId === 'avenger-titan-imported')!
    expect(entry.status).toBe('fallback')
    expect(entry.primaryUrl).toBeNull()
  })

  it('existing fleet image URLs remain unchanged — manual override wins for every seed ship', () => {
    const seedShipIds = Object.keys(shipImageOverrides)
    const { manifest, summary } = buildShipImageManifest(seedShipIds, shipImageOverrides)
    expect(summary.manual).toBe(seedShipIds.length)
    expect(summary.fallback).toBe(0)
    for (const id of seedShipIds) {
      const entry = manifest.find((e) => e.shipId === id)!
      expect(entry.primaryUrl).toBe(shipImageOverrides[id])
      expect(entry.source).toBe('MANUAL_OVERRIDE')
      expect(entry.status).toBe('manual')
    }
  })

  it('manual override wins over fallback when both a ship id and an override exist', () => {
    const overrides = { ghost: 'https://example.com/ghost.jpg' }
    const { manifest } = buildShipImageManifest(['ghost'], overrides)
    expect(manifest[0].source).toBe('MANUAL_OVERRIDE')
    expect(manifest[0].primaryUrl).toBe('https://example.com/ghost.jpg')
  })

  it('preserves a prior resolved/manual manifest entry across re-runs even without an override', () => {
    const existingManifest = [{ shipId: 'some-ship', primaryUrl: 'https://resolved.example/ship.jpg', source: 'RSI' as const, status: 'resolved' as const }]
    const { manifest, summary } = buildShipImageManifest(['some-ship'], {}, existingManifest)
    expect(manifest[0].primaryUrl).toBe('https://resolved.example/ship.jpg')
    expect(manifest[0].status).toBe('resolved')
    expect(summary.preservedExisting).toBe(1)
    expect(summary.fallback).toBe(0)
  })

  it('does not preserve a prior fallback entry — re-evaluates it instead (still falls back, but not "preserved")', () => {
    const existingManifest = [{ shipId: 'some-ship', primaryUrl: null, source: 'FALLBACK' as const, status: 'fallback' as const }]
    const { manifest, summary } = buildShipImageManifest(['some-ship'], {}, existingManifest)
    expect(manifest[0].status).toBe('fallback')
    expect(summary.preservedExisting).toBe(0)
    expect(summary.fallback).toBe(1)
  })

  it('running against the full current fleet matches the expected composition (12 manual, 2 fallback)', () => {
    const seedShipIds = Object.keys(shipImageOverrides)
    const allIds = [...seedShipIds, 'gladius-imported', 'avenger-titan-imported']
    const { summary } = buildShipImageManifest(allIds, shipImageOverrides)
    expect(summary.manual).toBe(12)
    expect(summary.fallback).toBe(2)
    expect(summary.resolved).toBe(0)
    expect(summary.failed).toBe(0)
    expect(summary.ambiguous).toBe(0)
  })
})
