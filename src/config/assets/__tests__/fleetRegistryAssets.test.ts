import { describe, it, expect } from 'vitest'
import { resolveFleetRegistryImage, manufacturerSlugForCode, FLEET_REGISTRY_PLACEHOLDER } from '../fleetRegistryAssets'
import { shipImageOverrides } from '../../../data/shipImageOverrides'

describe('Mission M-022: resolveFleetRegistryImage — required fallback order', () => {
  it('9. tier 2: falls back to the existing manual ship-image override when no Fleet Registry asset exists', () => {
    // 'ghost' is a real key in shipImageOverrides.ts — the Fleet Registry manifest ships empty this mission, so this must resolve to tier 2.
    const result = resolveFleetRegistryImage({ manufacturerCode: 'AEGS', shipSlug: 'ghost' })
    expect(result.source).toBe('ship-override')
    expect(result.url).toBe(shipImageOverrides.ghost)
  })

  it('9. tier 3: falls back to the existing official/imported ship image when no override exists but existingShipImage is supplied', () => {
    const result = resolveFleetRegistryImage({
      manufacturerCode: 'AEGS',
      shipSlug: 'some-unoverridden-ship',
      existingShipImage: { image: { primaryUrl: 'https://example.com/real-photo.jpg' } },
    })
    expect(result.source).toBe('ship-image')
    expect(result.url).toBe('https://example.com/real-photo.jpg')
  })

  it('9. tier 3 prefers legacy imageUrl when no structured image.primaryUrl is present, matching resolveDisplayImageUrl exactly', () => {
    const result = resolveFleetRegistryImage({
      manufacturerCode: 'DRAK',
      shipSlug: 'some-unoverridden-ship',
      existingShipImage: { imageUrl: 'https://example.com/legacy.jpg' },
    })
    expect(result.source).toBe('ship-image')
    expect(result.url).toBe('https://example.com/legacy.jpg')
  })

  it('9. tier 4 (EWO-006A): resolves to the approved Fleet Registry placeholder — the real BA-003A-01 asset, never the deprecated presentation-board artwork', () => {
    const result = resolveFleetRegistryImage({ manufacturerCode: 'UNKNOWN_CODE', shipSlug: 'totally-unknown-ship' })
    expect(result.source).toBe('generic-fallback')
    expect(result.url).toBe(FLEET_REGISTRY_PLACEHOLDER)
    expect(result.url).toBe('/assets/fleet-registry/placeholders/ship-placeholder-master-1024.png')
  })

  it('9. tier 4: falls back the same way even when existingShipImage is supplied but itself has no real image', () => {
    const result = resolveFleetRegistryImage({
      manufacturerCode: 'UNKNOWN_CODE',
      shipSlug: 'totally-unknown-ship',
      existingShipImage: {},
    })
    expect(result.source).toBe('generic-fallback')
    expect(result.url).toBe(FLEET_REGISTRY_PLACEHOLDER)
  })

  it('never generates or invents a Fleet Registry (tier 1) URL — the manifest ships empty this mission', () => {
    const result = resolveFleetRegistryImage({ manufacturerCode: 'AEGS', shipSlug: 'ghost' })
    expect(result.source).not.toBe('fleet-registry')
  })

  it('manufacturerSlugForCode maps known codes to their required fleet-registry directory, and unknowns to misc-manufacturers', () => {
    expect(manufacturerSlugForCode('AEGS')).toBe('aegis')
    expect(manufacturerSlugForCode('drak')).toBe('drake') // case-insensitive
    expect(manufacturerSlugForCode('ARGO')).toBe('argo')
    expect(manufacturerSlugForCode('MRAI')).toBe('misc-manufacturers') // real code, no dedicated directory required by this mission
    expect(manufacturerSlugForCode('NOT_A_REAL_CODE')).toBe('misc-manufacturers')
  })
})

describe('Mission M-022: existing ship-image override behavior remains intact', () => {
  it('10. shipImageOverrides.ts is untouched and still exports every seed ship key it did before', () => {
    const expectedKeys = ['ghost', 'corsair', 'mole', 'railen', '135c', 'cutlass-black', 'cutlass-red', 'm80', 'starlite', 'utv', 'vulture', 'prospector']
    for (const key of expectedKeys) {
      expect(shipImageOverrides[key]).toBeDefined()
      expect(typeof shipImageOverrides[key]).toBe('string')
    }
  })
})
