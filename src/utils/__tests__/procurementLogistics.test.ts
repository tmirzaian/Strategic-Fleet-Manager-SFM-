import { describe, it, expect } from 'vitest'
import { buildProcurementList } from '../procurement'
import type { Hardpoint, Build, Ship, InstalledLoadoutEntry, MissionReservation, HangarItem } from '../../types'

function hp(overrides: Partial<Hardpoint> = {}): Hardpoint {
  return {
    id: `h-${Math.random()}`, shipId: 's', buildId: 'b', slotLabel: 'Slot', type: 'Shield', size: 'S1',
    factoryItem: 'AllStop', installedItem: 'AllStop', targetItem: 'FR-66', status: 'Missing', ...overrides,
  }
}

describe('buildProcurementList — Golden Scenario E (Part 15)', () => {
  it('three Missions requiring six FR-66: 2 installed, 2 reserved, 1 available, 1 missing -> shortage 1, available-to-reserve 1, never "6 needed"', () => {
    const ships: Ship[] = [
      { id: 's1', name: 'Ship A', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'R', activeBuildId: 'b1', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active' },
      { id: 's2', name: 'Ship B', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'R', activeBuildId: 'b2', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active' },
      { id: 's3', name: 'Ship C', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'R', activeBuildId: 'b3', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active' },
    ]
    const builds: Build[] = [
      { id: 'b1', shipId: 's1', name: 'Mission A', role: 'R', readiness: 0, isActive: true, missing: [], kind: 'MISSION' },
      { id: 'b2', shipId: 's2', name: 'Mission B', role: 'R', readiness: 0, isActive: true, missing: [], kind: 'MISSION' },
      { id: 'b3', shipId: 's3', name: 'Mission C', role: 'R', readiness: 0, isActive: true, missing: [], kind: 'MISSION' },
    ]

    const installedRows = [
      hp({ shipId: 's1', buildId: 'b1', slotLabel: 'Shield 1', installedItem: 'FR-66', targetItem: 'FR-66', status: 'OK' }),
      hp({ shipId: 's1', buildId: 'b1', slotLabel: 'Shield 2', installedItem: 'FR-66', targetItem: 'FR-66', status: 'OK' }),
    ]
    const reservedRows = [
      hp({ shipId: 's2', buildId: 'b2', slotLabel: 'Shield 1', installedItem: 'AllStop', targetItem: 'FR-66', status: 'Missing' }),
      hp({ shipId: 's2', buildId: 'b2', slotLabel: 'Shield 2', installedItem: 'AllStop', targetItem: 'FR-66', status: 'Missing' }),
    ]
    const unresolvedRows = [
      hp({ shipId: 's3', buildId: 'b3', slotLabel: 'Shield 1', installedItem: 'AllStop', targetItem: 'FR-66', status: 'Missing' }),
      hp({ shipId: 's3', buildId: 'b3', slotLabel: 'Shield 2', installedItem: 'AllStop', targetItem: 'FR-66', status: 'Missing' }),
    ]
    const hardpoints = [...installedRows, ...reservedRows, ...unresolvedRows]

    const installedLoadouts: InstalledLoadoutEntry[] = [{ shipId: 's1', slotLabel: 'Shield 1', installedItem: 'FR-66' }, { shipId: 's1', slotLabel: 'Shield 2', installedItem: 'FR-66' }]
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'b2', fleetAssetId: 's2', targetSlotLabel: 'Shield 1', componentName: 'FR-66', quantity: 1, status: 'ACTIVE', createdAt: 'now', updatedAt: 'now' },
      { id: 'r2', missionConfigurationId: 'b2', fleetAssetId: 's2', targetSlotLabel: 'Shield 2', componentName: 'FR-66', quantity: 1, status: 'ACTIVE', createdAt: 'now', updatedAt: 'now' },
    ]
    const hangarItems: HangarItem[] = [{ id: 'hi1', name: 'FR-66', type: 'Shield', size: 'S1', qty: 3, neededBy: 'None', disposition: 'Store' }]

    const list = buildProcurementList(hardpoints, builds, ships, installedLoadouts, reservations, hangarItems)
    const fr66 = list.find((l) => l.itemName === 'FR-66')!

    expect(fr66.qtyNeeded).toBe(1)
    expect(fr66.availableToReserve).toBe(1)
    expect(fr66.qtyNeeded).not.toBe(6)
  })

  it('20. a genuinely missing item with no owned quantity at all generates the correct procurement quantity', () => {
    const ships: Ship[] = [{ id: 's1', name: 'Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'R', activeBuildId: 'b1', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active' }]
    const builds: Build[] = [{ id: 'b1', shipId: 's1', name: 'Mission', role: 'R', readiness: 0, isActive: true, missing: [], kind: 'MISSION' }]
    const hardpoints = [hp({ shipId: 's1', buildId: 'b1', targetItem: 'FR-66', status: 'Missing' })]
    const list = buildProcurementList(hardpoints, builds, ships, [], [], [])
    expect(list.find((l) => l.itemName === 'FR-66')?.qtyNeeded).toBe(1)
  })

  it('21. procurement aggregates across Missions without double counting a single reserved unit', () => {
    const ships: Ship[] = [{ id: 's1', name: 'Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'R', activeBuildId: 'b1', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active' }]
    const builds: Build[] = [{ id: 'b1', shipId: 's1', name: 'Mission', role: 'R', readiness: 0, isActive: true, missing: [], kind: 'MISSION' }]
    const hardpoints = [
      hp({ shipId: 's1', buildId: 'b1', slotLabel: 'Shield 1', targetItem: 'FR-66', status: 'Missing' }),
    ]
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'b1', fleetAssetId: 's1', targetSlotLabel: 'Shield 1', componentName: 'FR-66', quantity: 1, status: 'ACTIVE', createdAt: 'now', updatedAt: 'now' },
    ]
    const hangarItems: HangarItem[] = [{ id: 'hi1', name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }]
    const list = buildProcurementList(hardpoints, builds, ships, [], reservations, hangarItems)
    expect(list.find((l) => l.itemName === 'FR-66')).toBeUndefined()
  })

  it('19. an available-unreserved item does not generate a procurement shortage', () => {
    const ships: Ship[] = [{ id: 's1', name: 'Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'R', activeBuildId: 'b1', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active' }]
    const builds: Build[] = [{ id: 'b1', shipId: 's1', name: 'Mission', role: 'R', readiness: 0, isActive: true, missing: [], kind: 'MISSION' }]
    const hardpoints = [hp({ shipId: 's1', buildId: 'b1', targetItem: 'FR-66', status: 'Missing' })]
    const hangarItems: HangarItem[] = [{ id: 'hi1', name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }]
    const list = buildProcurementList(hardpoints, builds, ships, [], [], hangarItems)
    const fr66 = list.find((l) => l.itemName === 'FR-66')!
    expect(fr66.qtyNeeded).toBe(0)
    expect(fr66.availableToReserve).toBe(1)
  })
})
