import { describe, it, expect, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  localStorage.clear()
})

describe('Fleet Asset persistence (Sprint 1.3I)', () => {
  it('15. an added Fleet Asset persists through a genuine store reload when persistence is enabled', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!

    const result = useFleetStore.getState().addFleetAsset(def.id, 'PURCHASED', 'Reload Test Titan')
    expect(result.success).toBe(true)
    const assetId = result.assetId!

    // Confirm it actually reached localStorage before "reloading".
    const raw = localStorage.getItem('sfm-fleet-store')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw!)
    expect(persisted.state.fleetAssets.some((a: { id: string }) => a.id === assetId)).toBe(true)

    // Simulate a real page reload: drop the module registry and re-import,
    // so the store is rebuilt from scratch and must rehydrate from
    // localStorage rather than reusing any in-memory state.
    const { vi } = await import('vitest')
    vi.resetModules()
    const { useFleetStore: reloadedStore } = await import('../useFleetStore')

    const rehydratedShip = reloadedStore.getState().ships.find((s) => s.id === assetId)
    expect(rehydratedShip).toBeDefined()
    expect(rehydratedShip?.name).toBe('Reload Test Titan')
    expect(rehydratedShip?.ownership).toBe('Purchased')

    const rehydratedHardpoints = reloadedStore.getState().hardpoints.filter((h) => h.shipId === assetId)
    expect(rehydratedHardpoints.length).toBeGreaterThan(0)
  })

  it('the seed fleet is never itself written to localStorage (only manually-added assets round-trip)', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    useFleetStore.getState().addFleetAsset(def.id, 'OWNED')

    const raw = localStorage.getItem('sfm-fleet-store')
    const persisted = JSON.parse(raw!)
    const seedAssetsInStorage = persisted.state.fleetAssets.filter((a: { acquisitionSource: string }) => a.acquisitionSource === 'SEED_MIGRATION')
    expect(seedAssetsInStorage.length).toBe(0)
  })
})
