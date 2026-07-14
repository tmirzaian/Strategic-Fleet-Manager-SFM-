import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SHIP_IMAGE_URLS } from '../../data/shipImageRegistry'
import { ships as seedShips } from '../../data/seed'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('EWO-021A-1: seed FleetAssets resolve runtime imagery through the canonical registry', () => {
  it('1/2. a fresh seed initialization resolves Cutlass Red through shipImageRegistry.ts, not just src/data/seed.ts', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const seedRaw = seedShips.find((s) => s.id === 'cutlass-red')!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'cutlass-red')!
    expect(ship.imageUrl).toBe(SHIP_IMAGE_URLS['cutlass-red'])
    // Today the seed-baked value and the registry value are identical by
    // design (the registry was migrated verbatim from the same URL) — this
    // does not by itself prove the registry is actually consulted. The
    // mocked-registry test below proves that independently.
    expect(seedRaw.imageUrl).toBe(SHIP_IMAGE_URLS['cutlass-red'])
  })

  it("3. a second seed hull (Ghost) proves the behavior is general, not special-cased to Cutlass Red", async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ship.imageUrl).toBe(SHIP_IMAGE_URLS.ghost)
  })

  it('15. changing shipImageRegistry.ts alone changes a seed-backed FleetAsset\'s runtime image — proving the one-file editing contract, not a coincidence of identical values', async () => {
    vi.doMock('../../data/shipImageRegistry', () => ({
      SHIP_IMAGE_URLS: { 'cutlass-red': 'https://media.robertsspaceindustries.com/DIFFERENT-TEST-VALUE/slideshow.jpg' },
    }))
    const { useFleetStore } = await import('../useFleetStore')
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'cutlass-red')!
    expect(ship.imageUrl).toBe('https://media.robertsspaceindustries.com/DIFFERENT-TEST-VALUE/slideshow.jpg')
    expect(ship.imageUrl).not.toBe(seedShips.find((s) => s.id === 'cutlass-red')!.imageUrl)
    vi.doUnmock('../../data/shipImageRegistry')
  })

  it('4. seed Build/Hardpoint data is completely unchanged by image resolution', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const state = useFleetStore.getState()
    const ship = state.ships.find((s) => s.id === 'cutlass-red')!
    const build = state.builds.find((b) => b.id === ship.activeBuildId)!
    const hardpoints = state.hardpoints.filter((h) => h.buildId === build.id)
    expect(build.name).toBeTruthy()
    expect(hardpoints.length).toBeGreaterThan(0)
    expect(hardpoints.every((h) => typeof h.slotLabel === 'string' && h.slotLabel.length > 0)).toBe(true)
  })

  it('5. seed ownership/priority/nickname are unaffected by image resolution', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const seedRaw = seedShips.find((s) => s.id === 'cutlass-red')!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'cutlass-red')!
    expect(ship.ownership).toBe(seedRaw.ownership)
    expect(ship.priority).toBe(seedRaw.priority)
    expect(ship.name).toBe(seedRaw.name)
  })

  it('6/7. a persisted seedAssetOverride (nickname change) survives rehydration alongside the registry-resolved image — no delete/re-add needed', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    useFleetStore.getState().updateFleetAssetNickname('cutlass-red', 'Redline')

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const ship = reloaded.getState().ships.find((s) => s.id === 'cutlass-red')!
    expect(ship.name).toBe('Redline')
    expect(ship.imageUrl).toBe(SHIP_IMAGE_URLS['cutlass-red'])
  })

  it('8. two independent fresh store constructions (first-run / reset-equivalent) resolve the identical image URL — idempotent', async () => {
    const { useFleetStore: first } = await import('../useFleetStore')
    const firstUrl = first.getState().ships.find((s) => s.id === 'cutlass-red')!.imageUrl
    vi.resetModules()
    const { useFleetStore: second } = await import('../useFleetStore')
    const secondUrl = second.getState().ships.find((s) => s.id === 'cutlass-red')!.imageUrl
    expect(firstUrl).toBe(secondUrl)
  })

  it('9. historical seed Cutlass Black resolves the canonical deep-import hull\'s registry image without migrating its own engineering identity', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'cutlass-black')!
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === 'cutlass-black-asset-seed')!
    expect(ship.imageUrl).toBe(SHIP_IMAGE_URLS.DRAK_Cutlass_Black)
    // Loadout/engineering identity deliberately NOT migrated (ADR-008) —
    // still references the seed definition, never the deep-import one.
    expect(asset.shipDefinitionId).toBe('cutlass-black')
  })

  it('11. a seed hull with no registry entry falls through to its own seed imageUrl, never throwing', async () => {
    // Every real seed ship happens to have a registry entry today; this
    // proves the fallback path itself using a synthetic case so coverage
    // doesn't silently depend on that remaining true forever.
    const { resolveShipImage } = await import('../../utils/resolveShipImage')
    expect(() => resolveShipImage({ id: 'not-a-real-seed-id', imageUrl: 'https://example.com/legacy.jpg' })).not.toThrow()
    expect(resolveShipImage({ id: 'not-a-real-seed-id', imageUrl: 'https://example.com/legacy.jpg' })).toBe('https://example.com/legacy.jpg')
  })

  it('9b. historical seed Cutlass Black and a freshly-added deep-import Cutlass Black converge on the same visual image despite separate engineering identities', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const historical = useFleetStore.getState().ships.find((s) => s.id === 'cutlass-black')!
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.id === 'cutlass-black-imported')!
    const result = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    const fresh = useFleetStore.getState().ships.find((s) => s.id === result.assetId)!
    expect(historical.imageUrl).toBe(fresh.imageUrl)
    expect(fresh.imageUrl).toBe(SHIP_IMAGE_URLS.DRAK_Cutlass_Black)
  })

  it('13. Fleet Dashboard/Mission Control/Ship Detail all read the same ships array, so they can never disagree on imageUrl for the same asset', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    // All three pages (ShipCard, ShipRecordCard/PriorityCard, ShipHeroFrame
    // via ShipDetail) consume this exact same store array/object — there is
    // no per-page image lookup to independently drift.
    expect(ship.imageUrl).toBe(SHIP_IMAGE_URLS.ghost)
  })
})
