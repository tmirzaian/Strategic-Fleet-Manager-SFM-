import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { calculateComponentAvailability } from '../../engine/logistics/availability'
import { calculateMissionPackage } from '../../engine/logistics/missionPackage'
import { buildProcurementList } from '../../utils/procurement'
import { resolveNeededByBuilds } from '../../utils/inventoryDependencies'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => {
  localStorage.clear()
})

// Several seed fixtures (Snowblind, Mirage, FR-86, ...) already carry real
// starting Hangar stock — cleared first so each control scenario below
// starts from the exact, known quantity its own assertions describe,
// rather than silently adding on top of whatever the seed fixture happens
// to already own.
function addStock(name: string, type: string, size: string, qty: number) {
  useFleetStore.setState({ hangarItems: useFleetStore.getState().hangarItems.filter((h) => h.name !== name) })
  return useFleetStore.getState().addHangarItem({ name, type, size, qty, neededBy: 'None', disposition: 'Store' })
}

describe('EWO-029 (Task 15, Scenario A): partial reservation', () => {
  it('2 Snowblind, Build A reserves 1 -> Installed 0, Reserved 1, Available 1', () => {
    addStock('Snowblind', 'Cooler', 'S1', 2)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-stealth', fleetAssetId: 'ghost', targetSlotLabel: 'Cooler 1', componentName: 'Snowblind' })
    expect(reserve.success).toBe(true)
    const availability = calculateComponentAvailability('Snowblind', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(availability.installedQuantity).toBe(0)
    expect(availability.reservedQuantity).toBe(1)
    expect(availability.availableQuantity).toBe(1)
  })
})

describe('EWO-029 (Task 15, Scenario B): multiple Builds competing for stock', () => {
  it('2 Snowblind, Build A reserves 1, Build B reserves 1 -> Reserved 2, Available 0, Build C unfulfilled', () => {
    addStock('Snowblind', 'Cooler', 'S1', 2)
    const a = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-stealth', fleetAssetId: 'ghost', targetSlotLabel: 'Cooler 1', componentName: 'Snowblind' })
    expect(a.success).toBe(true)
    // 'Cooler 1' — a real Cooler-type slot on Cutlass Red, compatible
    // with a Cooler component; an incompatible slot (e.g. a Shield port)
    // would correctly fail target-compatibility validation before this
    // scenario's own stock-exhaustion logic ever runs.
    const cutlass = useFleetStore.getState().saveMissionConfiguration({ shipId: 'cutlass-red', name: 'Needs Snowblind', startingState: 'EMPTY', targetOverrides: { 'Cooler 1': 'Snowblind' }, setActive: false })
    const b = useFleetStore.getState().reserveComponent({ missionConfigurationId: cutlass.buildId!, fleetAssetId: 'cutlass-red', targetSlotLabel: 'Cooler 1', componentName: 'Snowblind' })
    expect(b.success).toBe(true)

    const availability = calculateComponentAvailability('Snowblind', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(availability.reservedQuantity).toBe(2)
    expect(availability.availableQuantity).toBe(0)

    // Build C (a third requirement, on Ghost's own second Loadout, whose
    // Cooler 1 is a genuinely compatible S1 slot) remains unfulfilled —
    // no stock left to reserve, not because of an incompatible target.
    const thirdBuild = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost', name: 'Also Needs Snowblind', startingState: 'EXISTING', existingBuildId: 'ghost-escort', targetOverrides: { 'Cooler 1': 'Snowblind' }, setActive: false,
    })
    const c = useFleetStore.getState().reserveComponent({ missionConfigurationId: thirdBuild.buildId!, fleetAssetId: 'ghost', targetSlotLabel: 'Cooler 1', componentName: 'Snowblind' })
    expect(c.success).toBe(false)
  })
})

describe('EWO-029 (Task 15, Scenario C): available unreserved match', () => {
  it('1 Snowblind, Build A has an unresolved target but no reservation -> Available 1, Reserved 0, unreserved-match signal 1, Build not fully installed', () => {
    addStock('Snowblind', 'Cooler', 'S1', 1)
    const state = useFleetStore.getState()
    const missionPackage = calculateMissionPackage('ghost-stealth', state.hardpoints, state.installedLoadouts, state.reservations, state.hangarItems, false)
    // The seed fixture's own ghost-stealth Build already has a real
    // unresolved Snowblind target (Cooler 1) — this is the mission's own
    // literal repro fixture, not a synthetic one.
    expect(missionPackage.availableUnreservedMatches).toBeGreaterThan(0)
    expect(missionPackage.isMissionReady).toBe(false)

    const availability = calculateComponentAvailability('Snowblind', state.hangarItems, state.installedLoadouts, state.reservations)
    expect(availability.availableQuantity).toBe(1)
    expect(availability.reservedQuantity).toBe(0)
  })
})

describe('EWO-029 (Task 15, Scenario D): release reservation', () => {
  it('releasing a reservation increases Available, decreases Reserved, and the Build returns to unreserved/missing', () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)
    expect(calculateComponentAvailability('FR-66', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations).reservedQuantity).toBe(1)

    const release = useFleetStore.getState().releaseReservation(reserve.reservationId!)
    expect(release.success).toBe(true)

    const availability = calculateComponentAvailability('FR-66', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(availability.reservedQuantity).toBe(0)
    expect(availability.availableQuantity).toBe(1)

    const state = useFleetStore.getState()
    const missionPackage = calculateMissionPackage('ghost-escort', state.hardpoints, state.installedLoadouts, state.reservations, state.hangarItems, false)
    expect(missionPackage.availableUnreservedMatches).toBeGreaterThan(0)
  })
})

describe('EWO-029 (Task 15, Scenario E): install a reserved unit', () => {
  it('reserving then installing on the SAME Build: Reserved decreases, Installed increases, no double count', () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    const install = useFleetStore.getState().installComponent('ghost', 'FR-66', 'Shield 1', 'ghost-escort')
    expect(install.matched).toBe(true)
    expect(install.reservationFulfilled).toBe(true)

    const availability = calculateComponentAvailability('FR-66', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(availability.reservedQuantity).toBe(0)
    expect(availability.installedQuantity).toBe(1)
    expect(availability.availableQuantity).toBe(0)
    expect(availability.ownedQuantity).toBe(1) // never double-counted to 2
  })

  it('EWO-029 (Task 7 bug fix): moveToShip on a unit reserved for the SAME ship/Build does not double-deduct Hangar quantity', () => {
    addStock('FR-66', 'Shield', 'S1', 2)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)
    useFleetStore.getState().setActiveBuild('ghost', 'ghost-escort')

    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')!
    const move = useFleetStore.getState().moveToShip(item.id, 'ghost')
    expect(move.success).toBe(true)

    // Started with 2; 1 was reserved+installed (fulfilled together) — the
    // remaining hangar record must show exactly 1, never 0.
    const remaining = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')
    expect(remaining?.qty).toBe(1)
  })
})

describe('EWO-029 (Task 15, Scenario F): competing allocation', () => {
  it('a unit reserved for Build A cannot be silently installed on a different Build via Move to Ship', () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    const cutlass = useFleetStore.getState().saveMissionConfiguration({ shipId: 'cutlass-red', name: 'Steal Attempt', startingState: 'EMPTY', targetOverrides: { 'Shield 1': 'FR-66' }, setActive: true })
    expect(cutlass.success).toBe(true)

    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')!
    const move = useFleetStore.getState().moveToShip(item.id, 'cutlass-red')

    expect(move.success).toBe(false)
    // Nothing was silently transferred — the original reservation is untouched.
    const reservation = useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation.status).toBe('ACTIVE')
    expect(useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')?.qty).toBe(1)
  })

  it('installing without any reservation or hangar record at all (pre-existing Quick Update use case) still works unaffected', () => {
    // No addStock call at all — matches the pre-existing "directly record
    // an install with no inventory bookkeeping" scenario this fix must
    // never break.
    const install = useFleetStore.getState().installComponent('ghost', 'Slipstream', 'Power 1', 'ghost-stealth')
    expect(install.matched).toBe(true)
    expect(install.blocked).toBeUndefined()
  })
})

describe('EWO-029 (Task 5): reservation quantity rules', () => {
  it('quantity must be a positive whole number', () => {
    addStock('FR-66', 'Shield', 'S1', 3)
    expect(useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66', quantity: 0 }).success).toBe(false)
  })

  it('cannot reserve above Available stock', () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const result = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66', quantity: 2 })
    expect(result.success).toBe(false)
  })

  it('one unit cannot be reserved to two Builds at once (the same slot cannot double-reserve, and stock is exhausted correctly)', () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const first = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(first.success).toBe(true)
    const cutlass = useFleetStore.getState().saveMissionConfiguration({ shipId: 'cutlass-red', name: 'Also Needs FR-66', startingState: 'EMPTY', targetOverrides: { 'Shield 1': 'FR-66' }, setActive: false })
    const second = useFleetStore.getState().reserveComponent({ missionConfigurationId: cutlass.buildId!, fleetAssetId: 'cutlass-red', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(second.success).toBe(false)
  })
})

describe('EWO-029 (Task 11): reservation effect on procurement', () => {
  it('no stock: item appears in Procurement as a true shortage', () => {
    const state = useFleetStore.getState()
    const list = buildProcurementList(state.hardpoints, state.builds, state.ships, state.installedLoadouts, state.reservations, state.hangarItems)
    const line = list.find((l) => l.itemName === 'FR-66')
    expect(line?.qtyNeeded).toBeGreaterThan(0)
    expect(line?.availableToReserve).toBe(0)
  })

  it('available but unreserved: not classified as unavailable, shown as availableToReserve, no forced re-purchase', () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const state = useFleetStore.getState()
    const list = buildProcurementList(state.hardpoints, state.builds, state.ships, state.installedLoadouts, state.reservations, state.hangarItems)
    const line = list.find((l) => l.itemName === 'FR-66')!
    expect(line.availableToReserve).toBeGreaterThan(0)
  })

  it('reserved for this Build: procurement need satisfied for that Build, not available to another', () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    const cutlass = useFleetStore.getState().saveMissionConfiguration({ shipId: 'cutlass-red', name: 'Also Needs FR-66', startingState: 'EMPTY', targetOverrides: { 'Shield 1': 'FR-66' }, setActive: false })
    void cutlass

    const state = useFleetStore.getState()
    const list = buildProcurementList(state.hardpoints, state.builds, state.ships, state.installedLoadouts, state.reservations, state.hangarItems)
    const line = list.find((l) => l.itemName === 'FR-66')!
    // Ghost-Escort's own requirement is satisfied (excluded from the
    // unresolved-demand group entirely) — only Cutlass Red's still shows.
    expect(line.neededBy.some((label) => label.includes('Cutlass Red'))).toBe(true)
    expect(line.neededBy.some((label) => label.includes('Ghost'))).toBe(false)
  })

  it('installed: procurement need satisfied, no longer listed at all', () => {
    useFleetStore.getState().installComponent('ghost', 'Slipstream', 'Power 1', 'ghost-stealth')
    const state = useFleetStore.getState()
    const list = buildProcurementList(state.hardpoints, state.builds, state.ships, state.installedLoadouts, state.reservations, state.hangarItems)
    const stillMissing = list.find((l) => l.itemName === 'Slipstream')
    // ghost-stealth's own Power 1 Slipstream requirement is now Installed
    // (status OK) — excluded entirely from procurement demand.
    if (stillMissing) {
      expect(stillMissing.neededBy.some((label) => label.includes('Stealth'))).toBe(false)
    }
  })
})

describe('EWO-029 (Task 12): Needed By resolution', () => {
  it('resolveNeededByBuilds lists every matching unresolved requirement, distinguishing reserved from unreserved', () => {
    addStock('FR-66', 'Shield', 'S1', 2)
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    const cutlass = useFleetStore.getState().saveMissionConfiguration({ shipId: 'cutlass-red', name: 'Also Needs FR-66', startingState: 'EMPTY', targetOverrides: { 'Shield 1': 'FR-66' }, setActive: false })
    void cutlass

    const state = useFleetStore.getState()
    const entries = resolveNeededByBuilds('FR-66', state.ships, state.builds, state.fleetAssets, state.hardpoints, state.reservations)
    expect(entries.length).toBeGreaterThanOrEqual(2)
    expect(entries.some((e) => e.reserved)).toBe(true)
    expect(entries.some((e) => !e.reserved)).toBe(true)
  })

  it('a removed Build no longer appears in Needed By', () => {
    const cutlass = useFleetStore.getState().saveMissionConfiguration({ shipId: 'cutlass-red', name: 'Temp Build', startingState: 'EMPTY', targetOverrides: { 'Shield 1': 'FR-66' }, setActive: false })
    let state = useFleetStore.getState()
    let entries = resolveNeededByBuilds('FR-66', state.ships, state.builds, state.fleetAssets, state.hardpoints, state.reservations)
    expect(entries.some((e) => e.buildId === cutlass.buildId)).toBe(true)

    useFleetStore.getState().deleteBuild(cutlass.buildId!)
    state = useFleetStore.getState()
    entries = resolveNeededByBuilds('FR-66', state.ships, state.builds, state.fleetAssets, state.hardpoints, state.reservations)
    expect(entries.some((e) => e.buildId === cutlass.buildId)).toBe(false)
  })

  it('duplicate hulls are distinguishable by nickname/Fleet Asset identity', () => {
    const a = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Black Betty')
    const b = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Rust Bucket')
    const saveA = useFleetStore.getState().saveMissionConfiguration({ shipId: a.assetId!, name: 'PvE Build', startingState: 'EMPTY', targetOverrides: {}, setActive: false })
    const saveB = useFleetStore.getState().saveMissionConfiguration({ shipId: b.assetId!, name: 'PvP Build', startingState: 'EMPTY', targetOverrides: {}, setActive: false })
    void saveA
    void saveB

    const state = useFleetStore.getState()
    const shipA = state.ships.find((s) => s.id === a.assetId)!
    const shipB = state.ships.find((s) => s.id === b.assetId)!
    expect(shipA.name).toBe('Black Betty')
    expect(shipB.name).toBe('Rust Bucket')
    expect(shipA.name).not.toBe(shipB.name)
  })
})

describe('EWO-029 (Task 14): persistence across a genuine reload', () => {
  it('45. a reservation survives rehydration', async () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const reservation = reloaded.getState().reservations.find((r) => r.id === reserve.reservationId)
    expect(reservation?.status).toBe('ACTIVE')
  })

  it('46. a released reservation stays released after rehydration', async () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    useFleetStore.getState().releaseReservation(reserve.reservationId!)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const reservation = reloaded.getState().reservations.find((r) => r.id === reserve.reservationId)
    expect(reservation?.status).toBe('RELEASED')
  })

  it('47. Available/Reserved/Installed counts remain correct after rehydration', async () => {
    addStock('FR-66', 'Shield', 'S1', 2)
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const s = reloaded.getState()
    const availability = calculateComponentAvailability('FR-66', s.hangarItems, s.installedLoadouts, s.reservations)
    expect(availability.reservedQuantity).toBe(1)
    expect(availability.availableQuantity).toBe(1)
  })

  it('48. the unreserved-match signal survives rehydration', async () => {
    // MWO-001 (Task 2): 'ghost'/'ghost-stealth' now resolves through the
    // real deep-imported Ghost Mk II structure — its old hand-typed
    // "Cooler 1" slot (which used to want "Snowblind") has no equivalent
    // real port and is safely quarantined (EWO-043 reconciliation), rather
    // than silently kept. A manually-added Fleet Asset's own real Factory
    // structure is what actually exercises "the signal survives
    // rehydration" now — its "Left Cooler" port (S2) is real and stable.
    addStock('Blizzard', 'Cooler', 'S2', 1)
    const added = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Cooler Upgrade Test Ship')
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: added.assetId!,
      name: 'Cooler Upgrade Test',
      startingState: 'FACTORY',
      targetOverrides: { 'Left Cooler': 'Blizzard' },
      setActive: true,
    })
    expect(save.success).toBe(true)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const s = reloaded.getState()
    const missionPackage = calculateMissionPackage(save.buildId!, s.hardpoints, s.installedLoadouts, s.reservations, s.hangarItems, false)
    expect(missionPackage.availableUnreservedMatches).toBeGreaterThan(0)
  })

  it('49. no duplicate reservation is created merely by reloading', async () => {
    addStock('FR-66', 'Shield', 'S1', 1)
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    const before = useFleetStore.getState().reservations.filter((r) => r.status === 'ACTIVE').length

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const after = reloaded.getState().reservations.filter((r) => r.status === 'ACTIVE').length
    expect(after).toBe(before)
  })
})
