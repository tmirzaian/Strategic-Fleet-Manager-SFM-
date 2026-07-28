import { describe, it, expect } from 'vitest'
import { findActiveSlotReservation } from '../reservationLookup'
import { derivePortLogistics } from '../../../utils/portTree'
import { buildProcurementList } from '../../../utils/procurement'
import { calculateMissionPackage } from '../missionPackage'
import type { Hardpoint, MissionReservation, Build, Ship, HangarItem } from '../../../types'

/**
 * EWO-STAB-003E (ADR-010) — the twelve required regression scenarios for
 * reservation-lookup and procurement demand-key consolidation.
 *
 * As with EWO-STAB-003D's own test file, the current catalog snapshot has
 * no naturally occurring two-different-entityClass-same-display-name
 * collision (confirmed there), so the "differing entityClass, same name"
 * scenarios construct that case directly with fabricated entityClass
 * strings against a shared display name — never a fabricated catalog
 * override, just two identity values passed directly to real functions.
 */

const ENTITY_A = 'SHLD_VEIL_VARIANT_A_SCItem'
const ENTITY_B = 'SHLD_VEIL_VARIANT_B_SCItem'

function reservation(overrides: Partial<MissionReservation> = {}): MissionReservation {
  return {
    id: 'res-1',
    missionConfigurationId: 'build-1',
    fleetAssetId: 'ghost',
    targetSlotLabel: 'Shield 1',
    componentName: 'Veil',
    quantity: 1,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function hp(overrides: Partial<Hardpoint> = {}): Hardpoint {
  return {
    id: `h-${Math.random()}`,
    shipId: 'ghost',
    buildId: 'build-1',
    slotLabel: 'Shield 1',
    type: 'Shield',
    size: 'S1',
    factoryItem: 'Veil',
    installedItem: '—',
    targetItem: 'Veil',
    status: 'Missing',
    ...overrides,
  }
}

const testBuild: Build = { id: 'build-1', shipId: 'ghost', name: 'Test Build', role: 'Role', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM' }
const testShip: Ship = { id: 'ghost', name: 'Test Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'Role', activeBuildId: 'build-1', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active' }

describe('EWO-STAB-003E: findActiveSlotReservation — the one shared reservation-matching decision', () => {
  it('1. all three former callers (portTree, procurement, missionPackage) agree on the same identity decision', () => {
    // A reservation for ENTITY_B must never satisfy a requirement for ENTITY_A, even
    // though both display as "Veil" — verified through all three real call paths at once.
    const reservations = [reservation({ componentEntityClass: ENTITY_B })]
    const row = hp({ targetEntityClass: ENTITY_A })

    const logistics = derivePortLogistics(row, reservations, [], [])
    expect(logistics).not.toBe('Reserved')

    const list = buildProcurementList([row], [testBuild], [testShip], [], reservations, [])
    expect(list.some((l) => l.itemName === 'Veil')).toBe(true) // still real demand — reservation didn't satisfy it

    const pkg = calculateMissionPackage('build-1', [row], [], reservations, [])
    expect(pkg.reservedMatches).toBe(0)
    expect(pkg.missingAssignments).toContain('Veil')
  })

  it('2. same display name, different entityClass — the reservation is not selected', () => {
    const reservations = [reservation({ componentEntityClass: ENTITY_B })]
    const found = findActiveSlotReservation(reservations, {
      missionConfigurationId: 'build-1',
      targetSlotLabel: 'Shield 1',
      componentName: 'Veil',
      componentEntityClass: ENTITY_A,
    })
    expect(found).toBeUndefined()
  })

  it('3. same entityClass, differently formatted display names — the reservation is selected', () => {
    const reservations = [reservation({ componentName: 'VEIL (Shield)', componentEntityClass: ENTITY_A })]
    const found = findActiveSlotReservation(reservations, {
      missionConfigurationId: 'build-1',
      targetSlotLabel: 'Shield 1',
      componentName: 'veil',
      componentEntityClass: ENTITY_A,
    })
    expect(found).toBeDefined()
    expect(found!.id).toBe('res-1')
  })

  it('4. a legacy name-only reservation (no entityClass anywhere) preserves exact pre-mission behavior', () => {
    const reservations = [reservation({ componentName: 'FR-66' })]
    expect(
      findActiveSlotReservation(reservations, { missionConfigurationId: 'build-1', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    ).toBeDefined()
    // Case-sensitive, exactly as every original inline `.find` was — never
    // identitiesMatch's own case-insensitive display-name fallback.
    expect(
      findActiveSlotReservation(reservations, { missionConfigurationId: 'build-1', targetSlotLabel: 'Shield 1', componentName: 'fr-66' })
    ).toBeUndefined()
  })

  it('5. ship/build/slot/mission scoping is preserved exactly', () => {
    const reservations = [reservation({ missionConfigurationId: 'build-1', targetSlotLabel: 'Shield 1', componentEntityClass: ENTITY_A })]
    expect(
      findActiveSlotReservation(reservations, { missionConfigurationId: 'build-2', targetSlotLabel: 'Shield 1', componentName: 'Veil', componentEntityClass: ENTITY_A })
    ).toBeUndefined()
    expect(
      findActiveSlotReservation(reservations, { missionConfigurationId: 'build-1', targetSlotLabel: 'Shield 2', componentName: 'Veil', componentEntityClass: ENTITY_A })
    ).toBeUndefined()
    expect(
      findActiveSlotReservation(reservations, { missionConfigurationId: 'build-1', targetSlotLabel: 'Shield 1', componentName: 'Veil', componentEntityClass: ENTITY_A })
    ).toBeDefined()
  })

  it('6. selection is not order-dependent when canonical identity identifies exactly one valid result', () => {
    const query = { missionConfigurationId: 'build-1', targetSlotLabel: 'Shield 1', componentName: 'Veil', componentEntityClass: ENTITY_A }
    const matching = reservation({ id: 'res-match', componentEntityClass: ENTITY_A })
    const nonMatching = reservation({ id: 'res-other', missionConfigurationId: 'build-9', componentEntityClass: ENTITY_B })
    expect(findActiveSlotReservation([matching, nonMatching], query)?.id).toBe('res-match')
    expect(findActiveSlotReservation([nonMatching, matching], query)?.id).toBe('res-match')
  })
})

describe('EWO-STAB-003E: procurement demand-key identity', () => {
  it('7. two same-name, different-entityClass demands remain separate procurement lines', () => {
    const rowA = hp({ id: 'a', slotLabel: 'Shield 1', targetEntityClass: ENTITY_A })
    const rowB = hp({ id: 'b', slotLabel: 'Shield 2', targetEntityClass: ENTITY_B })
    const list = buildProcurementList([rowA, rowB], [testBuild], [testShip])
    const veilLines = list.filter((l) => l.itemName === 'Veil')
    expect(veilLines).toHaveLength(2)
    expect(veilLines.every((l) => l.qtyNeeded === 1)).toBe(true)
  })

  it('8. two demands with the same entityClass combine despite differing display-name formatting', () => {
    const rowA = hp({ id: 'a', slotLabel: 'Shield 1', targetItem: 'veil', targetEntityClass: ENTITY_A })
    const rowB = hp({ id: 'b', slotLabel: 'Shield 2', targetItem: 'VEIL (Shield)', targetEntityClass: ENTITY_A })
    const list = buildProcurementList([rowA, rowB], [testBuild], [testShip])
    const merged = list.filter((l) => l.itemName.toLowerCase().includes('veil'))
    expect(merged).toHaveLength(1)
    expect(merged[0].qtyNeeded).toBe(2)
  })

  it('9. legacy name-only demand grouping is unchanged — rows with no entityClass still merge purely by name', () => {
    const rowA = hp({ id: 'a', slotLabel: 'Shield 1', targetItem: 'FR-66' })
    const rowB = hp({ id: 'b', slotLabel: 'Shield 2', targetItem: 'FR-66' })
    const list = buildProcurementList([rowA, rowB], [testBuild], [testShip])
    const merged = list.filter((l) => l.itemName === 'FR-66')
    expect(merged).toHaveLength(1)
    expect(merged[0].qtyNeeded).toBe(2)
  })

  it('10. availability/missing-quantity totals stay correct once split by canonical identity', () => {
    const rowA = hp({ id: 'a', slotLabel: 'Shield 1', targetEntityClass: ENTITY_A })
    const rowB = hp({ id: 'b', slotLabel: 'Shield 2', targetEntityClass: ENTITY_B })
    const hangarItems: HangarItem[] = [{ id: 'stock-a', name: 'Veil', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store', entityClass: ENTITY_A }]
    const list = buildProcurementList([rowA, rowB], [testBuild], [testShip], [], [], hangarItems)
    const lineA = list.find((l) => l.qtyNeeded === 0 || l.availableToReserve > 0)
    const lineB = list.find((l) => l.qtyNeeded === 1 && l.availableToReserve === 0)
    // One line's demand is fully covered by the ENTITY_A hangar stock (availableToReserve 1, qtyNeeded 0);
    // the other (ENTITY_B) has no stock of its own and remains a real qtyNeeded 1.
    expect(lineA).toBeDefined()
    expect(lineA!.qtyNeeded).toBe(0)
    expect(lineA!.availableToReserve).toBe(1)
    expect(lineB).toBeDefined()
  })

  it('11. no reservation or inventory unit is double-counted across split groups', () => {
    const rowA1 = hp({ id: 'a1', slotLabel: 'Shield 1', targetEntityClass: ENTITY_A })
    const rowA2 = hp({ id: 'a2', slotLabel: 'Shield 2', targetEntityClass: ENTITY_A })
    const rowB = hp({ id: 'b', slotLabel: 'Cooler 1', targetItem: 'Veil', targetEntityClass: ENTITY_B })
    const hangarItems: HangarItem[] = [{ id: 'stock-a', name: 'Veil', type: 'Shield', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store', entityClass: ENTITY_A }]
    const list = buildProcurementList([rowA1, rowA2, rowB], [testBuild], [testShip], [], [], hangarItems)
    const totalRowsAccounted = list.reduce((sum, l) => sum + l.qtyNeeded + l.availableToReserve, 0)
    // 3 real demand rows total, ENTITY_A stock (5) never leaks into ENTITY_B's line.
    expect(totalRowsAccounted).toBe(3)
    const bLine = list.find((l) => l.qtyNeeded === 1 && l.availableToReserve === 0)
    expect(bLine).toBeDefined()
  })

  it('12. read-only procurement/reservation/logistics calls perform no mutation of their inputs', () => {
    const reservations = [reservation({ componentEntityClass: ENTITY_A })]
    const row = hp({ targetEntityClass: ENTITY_A })
    const hangarItems: HangarItem[] = [{ id: 'stock-a', name: 'Veil', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store', entityClass: ENTITY_A }]
    const reservationsBefore = JSON.parse(JSON.stringify(reservations))
    const hardpointsBefore = JSON.parse(JSON.stringify([row]))
    const hangarBefore = JSON.parse(JSON.stringify(hangarItems))

    findActiveSlotReservation(reservations, { missionConfigurationId: 'build-1', targetSlotLabel: 'Shield 1', componentName: 'Veil', componentEntityClass: ENTITY_A })
    derivePortLogistics(row, reservations, hangarItems, [])
    buildProcurementList([row], [testBuild], [testShip], [], reservations, hangarItems)
    calculateMissionPackage('build-1', [row], [], reservations, hangarItems)

    expect(reservations).toEqual(reservationsBefore)
    expect([row]).toEqual(hardpointsBefore)
    expect(hangarItems).toEqual(hangarBefore)
  })
})
