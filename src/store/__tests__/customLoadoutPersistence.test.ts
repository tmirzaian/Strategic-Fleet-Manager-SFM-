import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => {
  localStorage.clear()
})

/**
 * EWO-027 (Sea Trials Blocker) — root cause confirmed directly against
 * real localStorage output: `partialize` never included `builds` or
 * `hardpoints` in any form, for any ship. Every refresh silently
 * reconstructed only each ship's canonical Factory Loadout (via
 * `materializeFleetAsset`/`src/data/seed.ts`), so a Commander's saved
 * custom Loadout (`Build.kind !== 'FACTORY'`) vanished, `Ship.activeBuildId`
 * reverted to the Factory build, and the Loadout Manager's "Existing
 * Loadouts" table went empty. These tests simulate a genuine reload the
 * same way src/store/__tests__/persistenceIncident.test.ts already does:
 * `vi.resetModules()` + re-import, so the store must rehydrate from
 * localStorage rather than reusing in-memory state.
 */
describe('EWO-027: custom Loadouts survive a genuine reload', () => {
  it('1. a single custom Loadout on a manually-added ship survives a genuine reload, with its own real assignments intact (not reverted to Factory)', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const added = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Persist Ship')
    const shipId = added.assetId!
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'Build A',
      startingState: 'FACTORY',
      targetOverrides: { 'Right Wing Weapon (Gimbal Mount) — Class 2': 'Custom Cannon' },
      setActive: true,
    })
    expect(save.success).toBe(true)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    const build = reloaded.getState().builds.find((b) => b.id === save.buildId)
    expect(build).toBeDefined()
    expect(build!.name).toBe('Build A')
    expect(build!.kind).toBe('MISSION')
    const rows = reloaded.getState().hardpoints.filter((h) => h.buildId === save.buildId)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some((h) => h.targetItem === 'Custom Cannon')).toBe(true)
  })

  it('2. two custom Loadouts (Build A, Build B) both survive the same reload — neither is dropped', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const added = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Two Builds Ship')
    const shipId = added.assetId!
    useFleetStore.getState().saveMissionConfiguration({ shipId, name: 'Build A', startingState: 'FACTORY', targetOverrides: {}, setActive: false })
    useFleetStore.getState().saveMissionConfiguration({ shipId, name: 'Build B', startingState: 'FACTORY', targetOverrides: {}, setActive: true })

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    const names = reloaded.getState().builds.filter((b) => b.shipId === shipId).map((b) => b.name)
    expect(names).toContain('Build A')
    expect(names).toContain('Build B')
  })

  it("3. the ship's Active Loadout selection survives the reload — never reverts to the Factory Loadout", async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const added = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Active Persist Ship')
    const shipId = added.assetId!
    const save = useFleetStore.getState().saveMissionConfiguration({ shipId, name: 'Active Build', startingState: 'FACTORY', targetOverrides: {}, setActive: true })

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    const ship = reloaded.getState().ships.find((s) => s.id === shipId)
    expect(ship?.activeBuildId).toBe(save.buildId)
    const activeBuild = reloaded.getState().builds.find((b) => b.id === ship?.activeBuildId)
    expect(activeBuild?.kind).not.toBe('FACTORY')
  })

  it('4. switching Active Loadout, then reloading, keeps the newly-selected Build active (not the previous one)', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const added = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Switch Active Ship')
    const shipId = added.assetId!
    const saveA = useFleetStore.getState().saveMissionConfiguration({ shipId, name: 'Build A', startingState: 'FACTORY', targetOverrides: {}, setActive: true })
    const saveB = useFleetStore.getState().saveMissionConfiguration({ shipId, name: 'Build B', startingState: 'FACTORY', targetOverrides: {}, setActive: false })
    useFleetStore.getState().setActiveBuild(shipId, saveB.buildId!)
    expect(useFleetStore.getState().ships.find((s) => s.id === shipId)?.activeBuildId).toBe(saveB.buildId)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    expect(reloaded.getState().ships.find((s) => s.id === shipId)?.activeBuildId).toBe(saveB.buildId)
    expect(reloaded.getState().ships.find((s) => s.id === shipId)?.activeBuildId).not.toBe(saveA.buildId)
  })

  it('5. a custom Loadout saved at runtime on a SEED ship (not just a manually-added one) also survives a genuine reload', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Seed Ship Runtime Build',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: true,
    })
    expect(save.success).toBe(true)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    expect(reloaded.getState().builds.some((b) => b.id === save.buildId && b.name === 'Seed Ship Runtime Build')).toBe(true)
    expect(reloaded.getState().ships.find((s) => s.id === 'ghost')?.activeBuildId).toBe(save.buildId)
  })

  it('6. a custom Loadout for a ship that was subsequently removed is never resurrected on reload', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const added = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Removed Ship')
    const shipId = added.assetId!
    useFleetStore.getState().saveMissionConfiguration({ shipId, name: 'Doomed Build', startingState: 'FACTORY', targetOverrides: {}, setActive: true })
    useFleetStore.getState().removeFleetAsset(shipId)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    expect(reloaded.getState().builds.some((b) => b.name === 'Doomed Build')).toBe(false)
    expect(reloaded.getState().hardpoints.some((h) => h.shipId === shipId)).toBe(false)
  })

  it('7. Save Changes (editing an existing custom Loadout) persists the edited assignment across a genuine reload', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const added = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Edit Persist Ship')
    const shipId = added.assetId!
    const save = useFleetStore.getState().saveMissionConfiguration({ shipId, name: 'Editable Build', startingState: 'FACTORY', targetOverrides: {}, setActive: true })
    useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'Editable Build',
      startingState: 'EXISTING',
      existingBuildId: save.buildId,
      targetOverrides: { 'Right Wing Weapon (Gimbal Mount) — Class 2': 'Edited Cannon' },
      setActive: true,
    })

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    const rows = reloaded.getState().hardpoints.filter((h) => h.buildId === save.buildId)
    expect(rows.some((h) => h.targetItem === 'Edited Cannon')).toBe(true)
  })

  it('8. a malformed persisted custom Build record (reached via an old-version save, which is what actually routes through migrate validation) is dropped defensively — never crashes, never wipes the rest of saved state', async () => {
    const { useFleetStore: probe } = await import('../useFleetStore')
    const def = probe.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    vi.resetModules()

    localStorage.setItem(
      'sfm-fleet-store',
      JSON.stringify({
        state: {
          fleetAssets: [
            {
              id: 'gladius-asset-malformed-build-test',
              shipDefinitionId: def.id,
              ownershipType: 'OWNED',
              acquisitionSource: 'MANUAL',
              activeBuildId: 'gladius-asset-malformed-build-test-build-factory',
              installedLoadoutId: 'gladius-asset-malformed-build-test-installed',
              priority: 1,
              status: 'active',
              addedAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          hangarItems: [],
          reservations: [],
          installedLoadouts: [],
          customBuilds: [
            { id: 'broken', shipId: 'nope' }, // missing required fields
            { id: 'good-build', shipId: 'gladius-asset-malformed-build-test', name: 'Good Build', role: 'Role', readiness: 100, isActive: true, missing: [], kind: 'MISSION' },
          ],
          customBuildHardpoints: [],
        },
        version: 5,
      })
    )

    // A crash here would fail the test on its own — no try/catch needed;
    // the assertions below are the actual "never wipes the rest of saved
    // state" proof.
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    expect(reloaded.getState().builds.some((b) => b.id === 'good-build')).toBe(true)
    expect(reloaded.getState().builds.some((b) => b.id === 'broken')).toBe(false)
  })

  it('9. an old (pre-EWO-027) save with no customBuilds/customBuildHardpoints/activeBuildByShipId fields at all still loads correctly — no custom Loadouts, not an error', async () => {
    const { useFleetStore: probe } = await import('../useFleetStore')
    const def = probe.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    vi.resetModules()

    localStorage.setItem(
      'sfm-fleet-store',
      JSON.stringify({
        state: {
          fleetAssets: [
            {
              id: 'gladius-asset-old-save',
              shipDefinitionId: def.id,
              ownershipType: 'OWNED',
              acquisitionSource: 'MANUAL',
              activeBuildId: 'gladius-asset-old-save-build-factory',
              installedLoadoutId: 'gladius-asset-old-save-installed',
              priority: 1,
              status: 'active',
              addedAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          hangarItems: [],
          reservations: [],
          installedLoadouts: [],
        },
        version: 5,
      })
    )

    const { useFleetStore } = await import('../useFleetStore')

    expect(useFleetStore.getState().ships.some((s) => s.id === 'gladius-asset-old-save')).toBe(true)
    expect(useFleetStore.getState().builds.filter((b) => b.shipId === 'gladius-asset-old-save' && b.kind !== 'FACTORY')).toHaveLength(0)
  })
})
