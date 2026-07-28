import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  // Each test needs a genuinely fresh store module, not whatever a
  // previous test in this file left behind in memory — localStorage.clear()
  // alone doesn't undo an already-hydrated in-memory zustand instance.
  vi.resetModules()
})
afterEach(() => {
  localStorage.clear()
})

/**
 * Mission M-012 incident (SW-015C update): deleting a ship (or all ships)
 * appeared to work for the current session, but a genuine reload silently
 * restored the seed/demo fleet — because the seed fleet's ships/builds/
 * hardpoints were always reconstructed fresh from src/data/seed.ts, and
 * `partialize` excluded seed-migrated Fleet Assets from localStorage
 * entirely, so a seed ship's removal was never actually persisted.
 *
 * SW-015C replaced destructive removal with the reversible Fleet Registry
 * lifecycle — `retireFleetAsset` never deletes a Ship/Build/Hardpoint row,
 * it only marks `lifecycleStatus: 'retired'`. These tests now verify the
 * same underlying concern (does the lifecycle state actually survive a
 * genuine reload, for both seed and manual assets) against the new,
 * correct model: a retired vessel remains fully present in `ships`,
 * excluded only from the active subset. `vi.resetModules()` + re-import
 * simulates a genuine reload, same as src/store/__tests__/fleetAssetPersistence.test.ts.
 */
describe('Mission M-012 / SW-015C: Fleet Registry lifecycle persistence', () => {
  it('1. retiring one seed ship persists across a genuine reload — the vessel remains present, marked retired', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const before = useFleetStore.getState().ships.length
    const result = useFleetStore.getState().retireFleetAsset('ghost')
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.lifecycleStatus).toBe('retired')
    // Retirement never removes the vessel record — the total count is unchanged.
    expect(useFleetStore.getState().ships.length).toBe(before)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    const ghost = reloaded.getState().ships.find((s) => s.id === 'ghost')
    expect(ghost).toBeDefined()
    expect(ghost?.lifecycleStatus).toBe('retired')
    expect(reloaded.getState().ships.length).toBe(before)
  })

  it('2. retiring every ship persists across a genuine reload — the ACTIVE fleet is empty, every vessel record remains', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const { selectActiveShips } = await import('../../utils/fleetLifecycle')
    const allShipIds = useFleetStore.getState().ships.map((s) => s.id)
    expect(allShipIds.length).toBeGreaterThan(0)
    for (const id of allShipIds) {
      const result = useFleetStore.getState().retireFleetAsset(id)
      expect(result.success).toBe(true)
    }
    expect(useFleetStore.getState().ships.length).toBe(allShipIds.length)
    expect(selectActiveShips(useFleetStore.getState().ships).length).toBe(0)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const { selectActiveShips: selectActiveShipsReloaded } = await import('../../utils/fleetLifecycle')

    expect(reloaded.getState().ships.length).toBe(allShipIds.length)
    expect(selectActiveShipsReloaded(reloaded.getState().ships).length).toBe(0)
    expect(reloaded.getState().fleetAssets.filter((a) => a.lifecycleStatus === 'active').length).toBe(0)
  })

  it('3. a persisted fully-retired fleet is not mistaken for missing storage — hasPersistedState is true even with zero active ships', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    for (const id of useFleetStore.getState().ships.map((s) => s.id)) {
      useFleetStore.getState().retireFleetAsset(id)
    }

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const { selectActiveShips } = await import('../../utils/fleetLifecycle')

    expect(selectActiveShips(reloaded.getState().ships).length).toBe(0)
    expect(reloaded.getState().hasPersistedState).toBe(true)
  })

  it('4. first-ever install behavior in a developer environment is deterministic — no localStorage entry means the full seed fleet loads and hasPersistedState is false', async () => {
    // CAT-001A: this test runs under vitest.setup.ts's global
    // VITE_SFM_DEV_SEED_FLEET=true stub — i.e., it documents the
    // opted-in developer/demo experience specifically, not what a real
    // Beta Commander sees on a genuinely fresh install. See
    // src/store/__tests__/newCommanderInitialization.test.ts for the
    // real-Commander behavior (flag disabled), which is empty instead.
    expect(localStorage.getItem('sfm-fleet-store')).toBeNull()

    vi.resetModules()
    const { useFleetStore: fresh } = await import('../useFleetStore')

    expect(fresh.getState().hasPersistedState).toBe(false)
    expect(fresh.getState().ships.length).toBeGreaterThan(0)
  })

  it('6. retiring a manually-added Fleet Asset persists across a genuine reload — the same record, not a duplicate', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Retire Me')
    expect(added.success).toBe(true)
    const assetId = added.assetId!

    const retired = useFleetStore.getState().retireFleetAsset(assetId)
    expect(retired.success).toBe(true)
    expect(useFleetStore.getState().ships.find((s) => s.id === assetId)?.lifecycleStatus).toBe('retired')

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    const ship = reloaded.getState().ships.find((s) => s.id === assetId)
    expect(ship).toBeDefined()
    expect(ship?.lifecycleStatus).toBe('retired')
  })

  it('12. migrating an old (pre-M-012) save does not overwrite existing user state, and defaults seedAssetOverrides to {}', async () => {
    const { useFleetStore: probe } = await import('../useFleetStore')
    const def = probe.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    vi.resetModules()

    // A schemaVersion-4 save, written before seedAssetOverrides existed
    // AND before SW-015C's lifecycleStatus field — still uses the old
    // `status: 'active'` shape, which `migrateLegacyLifecycleStatus`
    // (useFleetStore.ts) must translate before this record validates.
    localStorage.setItem(
      'sfm-fleet-store',
      JSON.stringify({
        state: {
          fleetAssets: [
            {
              id: 'gladius-asset-manual-1',
              shipDefinitionId: def.id,
              ownershipType: 'OWNED',
              acquisitionSource: 'MANUAL',
              activeBuildId: 'gladius-asset-manual-1-build-factory',
              installedLoadoutId: 'gladius-asset-manual-1-installed',
              priority: 1,
              status: 'active',
              addedAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          hangarItems: [{ id: 'item-old-1', name: 'Old Save Cooler', type: 'Cooler', size: 'S1', qty: 3, neededBy: 'None', disposition: 'Store' }],
          reservations: [],
          installedLoadouts: [],
        },
        version: 4,
      })
    )

    const { useFleetStore } = await import('../useFleetStore')

    expect(useFleetStore.getState().seedAssetOverrides).toEqual({})
    const migrated = useFleetStore.getState().ships.find((s) => s.id === 'gladius-asset-manual-1')
    expect(migrated).toBeDefined()
    expect(migrated?.lifecycleStatus).toBe('active')
    expect(useFleetStore.getState().hangarItems.some((h) => h.name === 'Old Save Cooler')).toBe(true)
    // The untouched seed fleet must still be fully present — an old save
    // predates seedAssetOverrides entirely, so nothing was ever removed.
    expect(useFleetStore.getState().ships.some((s) => s.id === 'ghost')).toBe(true)
  })
})
