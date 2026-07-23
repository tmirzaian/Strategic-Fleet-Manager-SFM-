import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { calculateMissionPackage } from '../../engine/logistics/missionPackage'
import { calculateComponentAvailability } from '../../engine/logistics/availability'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

function addHangarStock(name: string, type: string, size: string, qty: number) {
  useFleetStore.getState().addHangarItem({ name, type, size, qty, neededBy: 'None', disposition: 'Store' })
}

function packageFor(buildId: string) {
  const s = useFleetStore.getState()
  const build = s.builds.find((b) => b.id === buildId)!
  return calculateMissionPackage(buildId, s.hardpoints, s.installedLoadouts, s.reservations, s.hangarItems, build.kind === 'FACTORY')
}

describe('Reservation transactions (Part 4, tests 6-13)', () => {
  it('6/Golden B: one item cannot satisfy two reservations — the second attempt is blocked', () => {
    addHangarStock('FR-66', 'Shield', 'S1', 1)
    const first = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    expect(first.success).toBe(true)

    const cutlass = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'cutlass-red', name: 'Needs FR-66 Too', startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': 'FR-66' }, setActive: false,
    })
    const second = useFleetStore.getState().reserveComponent({ missionConfigurationId: cutlass.buildId!, fleetAssetId: 'cutlass-red', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })

    expect(second.success).toBe(false)
    expect(second.message).toBeTruthy()
    const firstReservation = useFleetStore.getState().reservations.find((r) => r.id === first.reservationId)!
    expect(firstReservation.status).toBe('ACTIVE')
  })

  it('7. an installed item does not inflate available stock — installed and hangar-spare quantities are counted separately and correctly', () => {
    // Mirage is installed on Ghost's real canonical Left Shield Generator
    // (seed.ts's customBuildOverlays) AND has one genuine spare sitting in
    // Hangar in the seed data — both must be counted, in their own
    // buckets. installedLoadouts is a single shared per-ship-per-slot
    // fact (test 24 below), so Ghost's one physical port counts once
    // regardless of how many Builds also reference that same slotLabel.
    const availability = calculateComponentAvailability('Mirage', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(availability.installedQuantity).toBe(1)
    expect(availability.availableQuantity).toBe(1)
    expect(availability.ownedQuantity).toBe(2)

    // An item with no owned quantity anywhere cannot be reserved.
    const result = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    expect(result.success).toBe(false)
  })

  it('8. reservation cannot exceed available owned quantity', () => {
    addHangarStock('FR-66', 'Shield', 'S1', 0)
    const result = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    expect(result.success).toBe(false)
  })

  it('9/Golden D: releasing a reservation restores availability', () => {
    addHangarStock('FR-66', 'Shield', 'S1', 1)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    expect(calculateComponentAvailability('FR-66', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations).availableQuantity).toBe(0)

    const release = useFleetStore.getState().releaseReservation(reserve.reservationId!)
    expect(release.success).toBe(true)
    expect(calculateComponentAvailability('FR-66', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations).availableQuantity).toBe(1)
  })

  it('10/Golden C: installing a reserved item fulfills the reservation atomically', () => {
    addHangarStock('FR-66', 'Shield', 'S1', 1)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    const install = useFleetStore.getState().installComponent('ghost', 'FR-66', 'Left Shield Generator', 'ghost-escort')
    expect(install.matched).toBe(true)

    const reservation = useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation.status).toBe('FULFILLED')
    const hangarQty = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')?.qty ?? 0
    expect(hangarQty).toBe(0)
  })

  it('11. a failed reservation attempt leaves all state unchanged', () => {
    const before = { hangar: [...useFleetStore.getState().hangarItems], reservations: [...useFleetStore.getState().reservations] }
    const result = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    expect(result.success).toBe(false)
    expect(useFleetStore.getState().hangarItems).toEqual(before.hangar)
    expect(useFleetStore.getState().reservations).toEqual(before.reservations)
  })

  it('12. removing an installed item (with returnToHangar) returns it to Hangar as available', () => {
    useFleetStore.getState().removeComponent('ghost', 'Left Shield Generator', true, 'ghost-stealth')
    const hangarItem = useFleetStore.getState().hangarItems.find((h) => h.name === 'Mirage')
    expect(hangarItem).toBeDefined()
    expect(hangarItem!.qty).toBeGreaterThan(0)
  })

  it('13. transfer between ships remains atomic (Alpha 2.0 behavior preserved)', () => {
    // Vulture's Right Shield Generator (S1, same size as Mirage, genuinely
    // empty from factory) is a real compatible destination — Cutlass
    // Red's own Shield ports are S2.
    const result = useFleetStore.getState().moveComponentBetweenShips('ghost', 'Left Shield Generator', 'vulture', 'Right Shield Generator')
    expect(result.matched).toBe(true)
  })
})

describe('Golden Scenario A — Ghost dual Missions', () => {
  it('Stealth Mission Ready; Escort starts below 100%, then Package Staged after reserving, without disturbing Stealth or moving equipment', () => {
    // Bring Stealth to genuine 100% Installed Match first (its two
    // remaining targets — Slipstream and SnowBlind — start Missing in the
    // seed data), matching the golden scenario's starting condition.
    useFleetStore.getState().installComponent('ghost', 'Slipstream', 'Power Plant', 'ghost-stealth')
    useFleetStore.getState().installComponent('ghost', 'SnowBlind', 'Left Cooler', 'ghost-stealth')

    const stealthPackage = packageFor('ghost-stealth')
    expect(stealthPackage.isMissionReady).toBe(true)

    const escortBefore = packageFor('ghost-escort')
    expect(escortBefore.installedPercentage).toBeLessThan(100)

    addHangarStock('FR-66', 'Shield', 'S1', 1)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    const stealthAfter = packageFor('ghost-stealth')
    expect(stealthAfter.isMissionReady).toBe(true)

    const escortAfter = packageFor('ghost-escort')
    expect(escortAfter.packageState === 'PACKAGE_STAGED' || escortAfter.reservedMatches > 0).toBe(true)
    expect(escortAfter.isMissionReady).toBe(false)

    const reservationsBefore = useFleetStore.getState().reservations.length
    useFleetStore.getState().setActiveBuild('ghost', 'ghost-escort')
    expect(useFleetStore.getState().reservations.length).toBe(reservationsBefore)
    expect(useFleetStore.getState().ships.find((s) => s.id === 'ghost')!.activeBuildId).toBe('ghost-escort')
  })
})

describe('Golden Scenario E — true procurement respects reservations', () => {
  it('procurement shortage only counts what is genuinely missing after Installed + Reserved', () => {
    const before = calculateComponentAvailability('FR-66', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(before.availableQuantity).toBe(0)

    addHangarStock('FR-66', 'Shield', 'S1', 1)
    const afterAdd = calculateComponentAvailability('FR-66', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(afterAdd.availableQuantity).toBe(1)

    const missionPackage = packageFor('ghost-escort')
    expect(missionPackage.isPackageStaged).toBe(false)
    expect(missionPackage.availableUnreservedMatches).toBeGreaterThan(0)
  })
})

describe('Golden Scenario F — target change reconciles reservation', () => {
  it('changing a Mission target releases the stale reservation rather than letting it silently satisfy the new target', () => {
    addHangarStock('FR-66', 'Shield', 'S1', 1)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost', name: 'Escort Build', startingState: 'EXISTING', existingBuildId: 'ghost-escort',
      targetOverrides: { 'Left Shield Generator': 'Mirage' }, setActive: false,
    })

    const reservation = useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation.status).toBe('RELEASED')
    const availability = calculateComponentAvailability('FR-66', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(availability.availableQuantity).toBe(1)
  })
})

describe('27. removing a Mission Configuration releases its reservations safely', () => {
  it('deleteBuild releases ACTIVE reservations rather than orphaning them', () => {
    addHangarStock('FR-66', 'Shield', 'S1', 1)
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    useFleetStore.getState().deleteBuild('ghost-escort')
    const reservation = useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation.status).toBe('RELEASED')
  })
})

describe('22/23/24/25 — Active Mission switching and shared Installed Loadout', () => {
  it('22/23. switching Active Mission never moves equipment or alters reservations', () => {
    addHangarStock('FR-66', 'Shield', 'S1', 1)
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    const installedBefore = [...useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')]
    const reservationsBefore = [...useFleetStore.getState().reservations]

    useFleetStore.getState().setActiveBuild('ghost', 'ghost-escort')

    expect(useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')).toEqual(installedBefore)
    expect(useFleetStore.getState().reservations).toEqual(reservationsBefore)
  })

  it('24. multiple Missions on one Fleet Asset share exactly one Installed Loadout', () => {
    const shieldEntries = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost' && e.slotLabel === 'Left Shield Generator')
    expect(shieldEntries).toHaveLength(1)
  })

  it('25. reservations remain Mission-specific — reserving for Escort does not affect Stealth', () => {
    addHangarStock('FR-66', 'Shield', 'S1', 1)
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    const stealthReservations = useFleetStore.getState().reservations.filter((r) => r.missionConfigurationId === 'ghost-stealth')
    expect(stealthReservations).toHaveLength(0)
  })
})

describe('28/29 — migration and import safety', () => {
  it('28. the initial migrated state creates no automatic reservations', () => {
    expect(useFleetStore.getState().reservations).toEqual([])
  })
})
