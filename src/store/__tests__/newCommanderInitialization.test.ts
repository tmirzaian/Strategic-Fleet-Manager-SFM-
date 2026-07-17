import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * CAT-001A (Beta release blocker) — Commander Acceptance Testing found a
 * genuinely fresh browser origin (empty Local Storage, empty Session
 * Storage, no IndexedDB involvement at all) still displayed the 12-ship
 * Alpha-era demo fleet and its associated hangar/loadout/log content.
 * Root cause: src/store/useFleetStore.ts unconditionally baked
 * src/data/seed.ts into both its own default state and its `merge`
 * function's baseline, with no gate distinguishing "brand new Commander"
 * from "developer running the app locally."
 *
 * The fix: the demo fleet is now included only when the store's own
 * `merge` sees `hadPersistedState` (a returning Commander — even one who
 * never touched a seed ship — must never have it disappear) or the
 * explicit, gitignored-only `VITE_SFM_DEV_SEED_FLEET=true` opt-in. These
 * tests explicitly disable that flag (unlike the rest of the suite, which
 * enables it globally in vitest.setup.ts) to exercise the real
 * Commander-facing behavior.
 */
beforeEach(() => {
  localStorage.clear()
  vi.stubEnv('VITE_SFM_DEV_SEED_FLEET', 'false')
  vi.resetModules()
})
afterEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('CAT-001A: a genuinely new Commander (no persisted state, demo fleet disabled)', () => {
  it('1. Fleet Dashboard/Mission Control begin with zero ships and zero Fleet Assets', async () => {
    expect(localStorage.getItem('sfm-fleet-store')).toBeNull()
    const { useFleetStore } = await import('../useFleetStore')
    const state = useFleetStore.getState()
    expect(state.hasPersistedState).toBe(false)
    expect(state.ships).toEqual([])
    expect(state.fleetAssets).toEqual([])
    expect(state.builds).toEqual([])
    expect(state.hardpoints).toEqual([])
  })

  it('2. Hangar Inventory contains no user-owned inventory, and no reservations exist', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const state = useFleetStore.getState()
    expect(state.hangarItems).toEqual([])
    expect(state.reservations).toEqual([])
  })

  it('3. no custom loadouts, priorities, or installed-loadout records exist', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const state = useFleetStore.getState()
    expect(state.builds.filter((b) => b.kind !== 'FACTORY')).toEqual([])
    expect(state.installedLoadouts).toEqual([])
  })

  it("4. no development fleet, test fleet, or Commander fleet is automatically loaded — none of the seed ship ids are present", async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const seedIds = ['ghost', 'corsair', 'mole', 'railen', '135c', 'cutlass-black', 'cutlass-red', 'm80', 'starlite', 'utv', 'vulture', 'prospector']
    const presentIds = new Set(useFleetStore.getState().ships.map((s) => s.id))
    for (const id of seedIds) expect(presentIds.has(id)).toBe(false)
  })

  it("5. the demo Captain's Log does not appear — it narrates ships that don't exist for this Commander", async () => {
    const { useFleetStore } = await import('../useFleetStore')
    expect(useFleetStore.getState().log).toEqual([])
  })

  it('6. canonical ship and component catalogs remain fully available for Add Ship', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const state = useFleetStore.getState()
    expect(state.shipDefinitions.length).toBeGreaterThan(0)
    expect(state.selectableShipDefinitions.length).toBeGreaterThan(0)
  })

  it('7. Add Ship works, and the added ship (only) persists across a genuine reload', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const result = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'First Ship')
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().ships.length).toBe(1)

    vi.stubEnv('VITE_SFM_DEV_SEED_FLEET', 'false')
    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    expect(reloaded.getState().hasPersistedState).toBe(true)
    expect(reloaded.getState().ships.length).toBe(1)
    expect(reloaded.getState().ships[0].id).toBe(result.assetId)
    // Still no demo fleet alongside the Commander's real one.
    expect(reloaded.getState().ships.some((s) => s.id === 'ghost')).toBe(false)
  })

  it('8. close-and-relaunch (a second independent genuine reload) still shows only the Commander\'s own ship', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'First Ship')

    vi.stubEnv('VITE_SFM_DEV_SEED_FLEET', 'false')
    vi.resetModules()
    const { useFleetStore: relaunchOne } = await import('../useFleetStore')
    expect(relaunchOne.getState().ships.length).toBe(1)

    vi.stubEnv('VITE_SFM_DEV_SEED_FLEET', 'false')
    vi.resetModules()
    const { useFleetStore: relaunchTwo } = await import('../useFleetStore')
    expect(relaunchTwo.getState().ships.length).toBe(1)
    expect(relaunchTwo.getState().ships.some((s) => s.id === 'ghost')).toBe(false)
  })
})

describe('CAT-001A: an existing Commander\'s persisted profile is never reset by this fix', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubEnv('VITE_SFM_DEV_SEED_FLEET', 'false')
    vi.resetModules()
  })

  it('1. a save written under the pre-fix schema (version < 8) is recognized as a legacy install and keeps the full seed fleet, even if it never touched a seed ship directly', async () => {
    // Simulate an existing installed Beta profile from before this fix:
    // stored at version 7 (pre-CAT-001A), with some real persisted
    // logistics blob (a Commander who added one Hangar item), even though
    // they never touched a seed ship specifically. `migrate` must detect
    // this via the stored version, not merely "some record exists" —
    // otherwise a brand-new post-fix Commander's own second load (which
    // also "has some record") would incorrectly regain the demo fleet too
    // (see tests 7/8 above).
    localStorage.setItem(
      'sfm-fleet-store',
      JSON.stringify({
        state: {
          fleetAssets: [],
          hangarItems: [{ id: 'item-1', name: 'Existing Cooler', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }],
          reservations: [],
          installedLoadouts: [],
        },
        version: 7,
      })
    )

    const { useFleetStore } = await import('../useFleetStore')
    const state = useFleetStore.getState()
    expect(state.hasPersistedState).toBe(true)
    expect(state.seedFleetLegacyInstall).toBe(true)
    expect(state.ships.some((s) => s.id === 'ghost')).toBe(true)
    expect(state.hangarItems.some((h) => h.name === 'Existing Cooler')).toBe(true)
  })

  it('2. a returning Commander who previously renamed a seed ship keeps that change — nothing is erased or overwritten', async () => {
    localStorage.setItem(
      'sfm-fleet-store',
      JSON.stringify({
        state: {
          fleetAssets: [],
          hangarItems: [],
          reservations: [],
          installedLoadouts: [],
          seedAssetOverrides: {
            'ghost-asset-seed': { nickname: 'My Custom Ghost', updatedAt: '2026-01-01T00:00:00.000Z' },
          },
        },
        version: 7,
      })
    )

    const { useFleetStore } = await import('../useFleetStore')
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')
    expect(ship).toBeDefined()
    expect(ship!.name).toBe('My Custom Ghost')
  })

  it('3. the legacy-install marker survives every subsequent reload once set, even though migrate only ever runs once', async () => {
    localStorage.setItem(
      'sfm-fleet-store',
      JSON.stringify({ state: { fleetAssets: [], hangarItems: [], reservations: [], installedLoadouts: [] }, version: 7 })
    )
    const { useFleetStore } = await import('../useFleetStore')
    expect(useFleetStore.getState().seedFleetLegacyInstall).toBe(true)
    // Do something to trigger a fresh partialize write at the current version.
    useFleetStore.getState().addHangarItem({ name: 'Another Item', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    // Stored version is now 8 (current) — migrate does NOT run this time,
    // yet the seed fleet must still be present via the carried-forward marker.
    expect(reloaded.getState().seedFleetLegacyInstall).toBe(true)
    expect(reloaded.getState().ships.some((s) => s.id === 'ghost')).toBe(true)
  })

  it('4. a brand-new post-fix Commander who adds only a Hangar item (never a ship) still does not regain the demo fleet on reload', async () => {
    expect(localStorage.getItem('sfm-fleet-store')).toBeNull()
    const { useFleetStore } = await import('../useFleetStore')
    useFleetStore.getState().addHangarItem({ name: 'My Own Cooler', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    expect(useFleetStore.getState().ships).toEqual([])

    vi.stubEnv('VITE_SFM_DEV_SEED_FLEET', 'false')
    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    expect(reloaded.getState().seedFleetLegacyInstall).toBe(false)
    expect(reloaded.getState().ships).toEqual([])
    expect(reloaded.getState().hangarItems.some((h) => h.name === 'My Own Cooler')).toBe(true)
  })
})
