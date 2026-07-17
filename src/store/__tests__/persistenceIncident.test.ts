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
 * Mission M-012 incident: deleting a ship (or all ships) appeared to work
 * for the current session, but a genuine reload silently restored the
 * seed/demo fleet — because the seed fleet's ships/builds/hardpoints were
 * always reconstructed fresh from src/data/seed.ts, and `partialize`
 * excluded seed-migrated Fleet Assets from localStorage entirely, so a
 * seed ship's removal was never actually persisted. These tests simulate
 * a genuine reload the same way src/store/__tests__/fleetAssetPersistence.test.ts
 * already does: `vi.resetModules()` + re-import, so the store is rebuilt
 * from scratch and must rehydrate from localStorage rather than reusing
 * in-memory state.
 */
describe('Mission M-012: persistence incident — seed ship deletion must survive a reload', () => {
  it('1. deleting one seed ship persists across a genuine reload', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const before = useFleetStore.getState().ships.length
    const result = useFleetStore.getState().removeFleetAsset('ghost')
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().ships.some((s) => s.id === 'ghost')).toBe(false)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    expect(reloaded.getState().ships.some((s) => s.id === 'ghost')).toBe(false)
    expect(reloaded.getState().ships.length).toBe(before - 1)
  })

  it('2. deleting every ship persists across a genuine reload — the fleet remains empty', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const allShipIds = useFleetStore.getState().ships.map((s) => s.id)
    expect(allShipIds.length).toBeGreaterThan(0)
    for (const id of allShipIds) {
      const result = useFleetStore.getState().removeFleetAsset(id)
      expect(result.success).toBe(true)
    }
    expect(useFleetStore.getState().ships.length).toBe(0)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    expect(reloaded.getState().ships.length).toBe(0)
    expect(reloaded.getState().fleetAssets.filter((a) => a.status === 'active').length).toBe(0)
  })

  it('3. a persisted empty fleet is not mistaken for missing storage — hasPersistedState is true even with zero ships', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    for (const id of useFleetStore.getState().ships.map((s) => s.id)) {
      useFleetStore.getState().removeFleetAsset(id)
    }

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    expect(reloaded.getState().ships.length).toBe(0)
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

  it('6. removing a manually-added Fleet Asset persists across a genuine reload', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Delete Me')
    expect(added.success).toBe(true)
    const assetId = added.assetId!

    const removed = useFleetStore.getState().removeFleetAsset(assetId)
    expect(removed.success).toBe(true)
    expect(useFleetStore.getState().ships.some((s) => s.id === assetId)).toBe(false)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    expect(reloaded.getState().ships.some((s) => s.id === assetId)).toBe(false)
  })

  it('12. migrating an old (pre-M-012) save does not overwrite existing user state, and defaults seedAssetOverrides to {}', async () => {
    const { useFleetStore: probe } = await import('../useFleetStore')
    const def = probe.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    vi.resetModules()

    // A schemaVersion-4 save, written before seedAssetOverrides existed —
    // carries one real manually-added Fleet Asset that must survive.
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
    expect(useFleetStore.getState().ships.some((s) => s.id === 'gladius-asset-manual-1')).toBe(true)
    expect(useFleetStore.getState().hangarItems.some((h) => h.name === 'Old Save Cooler')).toBe(true)
    // The untouched seed fleet must still be fully present — an old save
    // predates seedAssetOverrides entirely, so nothing was ever removed.
    expect(useFleetStore.getState().ships.some((s) => s.id === 'ghost')).toBe(true)
  })
})
