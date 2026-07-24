import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

/**
 * SW-013C.1 (Objective 4) — Data-Integrity Assertions. The live vertical
 * proof (Ghost Mk II, "Persistence Certification") confirmed
 * `saveMissionConfiguration` never mutated Hangar Inventory or the
 * Installed Loadout for a target-only edit, but that was one live run, not
 * a locked regression. These tests pin the specific isolation invariants
 * the persistence contract requires (SW-013C.1 report §2) so a future
 * change to the installation engine or save pipeline cannot silently
 * reintroduce cross-contamination between target, installed, and factory
 * state — the exact three concepts `saveMissionConfiguration` and
 * `applyInstalledChange` already keep deliberately separate (see
 * useFleetStore.ts's own `Hardpoint.factoryItem`/`installedItem`/
 * `targetItem` triad).
 */
describe('SW-013C.1 (Objective 4): creating/editing a target Loadout never touches inventory or installed state', () => {
  it('creating a custom Loadout does not create or change any Hangar Inventory record', () => {
    const before = useFleetStore.getState().hangarItems
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Integrity Test Build',
      startingState: 'FACTORY',
      targetOverrides: { 'Power Plant': 'Some New Target Component' },
      setActive: false,
    })
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().hangarItems).toEqual(before)
  })

  it('editing an existing custom Loadout\'s target does not install a component (the physical Installed Loadout is untouched)', () => {
    const created = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Integrity Edit Build',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    expect(created.success).toBe(true)
    const installedBefore = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')

    const edited = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Integrity Edit Build',
      startingState: 'EXISTING',
      existingBuildId: created.buildId,
      targetOverrides: { 'Power Plant': 'A Different Target' },
      setActive: false,
    })
    expect(edited.success).toBe(true)
    const installedAfter = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')
    expect(installedAfter).toEqual(installedBefore)

    // The row's own `installedItem` (what's physically there) must also be
    // unaffected — only `targetItem` on this one build's own row changes.
    const editedRow = useFleetStore.getState().hardpoints.find((h) => h.buildId === created.buildId && h.slotLabel === 'Power Plant')
    const otherBuildRow = useFleetStore
      .getState()
      .hardpoints.find((h) => h.shipId === 'ghost' && h.slotLabel === 'Power Plant' && h.buildId !== created.buildId)
    expect(editedRow?.targetItem).toBe('A Different Target')
    if (otherBuildRow) {
      expect(otherBuildRow.installedItem).toBe(editedRow?.installedItem)
    }
  })

  it('saving a target Loadout does not remove or alter any installed component on another Loadout for the same ship', () => {
    const activeBefore = useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.activeBuildId
    const installedBefore = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')

    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Non-Destructive Save Test',
      startingState: 'EMPTY',
      targetOverrides: {},
      setActive: false,
    })
    expect(result.success).toBe(true)

    expect(useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.activeBuildId).toBe(activeBefore)
    expect(useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')).toEqual(installedBefore)
  })

  it('the Factory Loadout remains immutable through custom-Loadout creation and editing', () => {
    const factoryBuild = useFleetStore.getState().builds.find((b) => b.shipId === 'ghost' && b.kind === 'FACTORY')
    const factoryRowsBefore = useFleetStore
      .getState()
      .hardpoints.filter((h) => h.buildId === factoryBuild?.id)
      .map((h) => ({ slotLabel: h.slotLabel, targetItem: h.targetItem, factoryItem: h.factoryItem }))

    const created = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Factory Immutability Test',
      startingState: 'FACTORY',
      targetOverrides: { 'Power Plant': 'Overridden Target' },
      setActive: false,
    })
    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Factory Immutability Test',
      startingState: 'EXISTING',
      existingBuildId: created.buildId,
      targetOverrides: { 'Shield Generator': 'Another Override' },
      setActive: false,
    })

    const factoryRowsAfter = useFleetStore
      .getState()
      .hardpoints.filter((h) => h.buildId === factoryBuild?.id)
      .map((h) => ({ slotLabel: h.slotLabel, targetItem: h.targetItem, factoryItem: h.factoryItem }))
    expect(factoryRowsAfter).toEqual(factoryRowsBefore)
  })
})

describe('SW-013C.1 (Objective 4): ship isolation and stable identity', () => {
  it('switching ships cannot leak a saved custom Loadout onto a different ship — each Loadout stays scoped to its own shipId', () => {
    const otherShip = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Isolation Test Ship')
    expect(otherShip.success).toBe(true)
    const otherShipId = otherShip.assetId!

    const ghostBuild = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Ghost-Only Build',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    expect(ghostBuild.success).toBe(true)

    const otherShipBuilds = useFleetStore.getState().builds.filter((b) => b.shipId === otherShipId)
    expect(otherShipBuilds.some((b) => b.id === ghostBuild.buildId)).toBe(false)
    expect(otherShipBuilds.some((b) => b.name === 'Ghost-Only Build')).toBe(false)

    const otherShipHardpoints = useFleetStore.getState().hardpoints.filter((h) => h.shipId === otherShipId)
    expect(otherShipHardpoints.every((h) => h.buildId !== ghostBuild.buildId)).toBe(true)
  })

  it('a stable Build id survives a rename via editBuild', () => {
    const created = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Original Name',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    const id = created.buildId!
    useFleetStore.getState().editBuild(id, { name: 'Renamed' })
    const renamed = useFleetStore.getState().builds.find((b) => b.id === id)
    expect(renamed).toBeDefined()
    expect(renamed!.name).toBe('Renamed')
    // The hardpoint rows tied to this build must still reference the SAME
    // id — a rename must never re-key the build's own persisted content.
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === id)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('a failed save (unresolvable override slot) does not create a new Build or present the draft as committed', () => {
    const buildCountBefore = useFleetStore.getState().builds.length
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Should Never Exist',
      startingState: 'FACTORY',
      targetOverrides: { 'Not A Real Port Anywhere': 'Whatever' },
      setActive: false,
    })
    expect(result.success).toBe(false)
    expect(useFleetStore.getState().builds.length).toBe(buildCountBefore)
    expect(useFleetStore.getState().builds.some((b) => b.name === 'Should Never Exist')).toBe(false)
  })
})
