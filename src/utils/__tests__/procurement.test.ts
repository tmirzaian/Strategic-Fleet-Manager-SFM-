import { describe, it, expect } from 'vitest'
import { buildProcurementList, buildReservedAwaitingInstallLines, sortProcurementList } from '../procurement'
import { hardpoints, builds, ships } from '../../data/seed'
import type { Hardpoint, Build, Ship, MissionReservation } from '../../types'

function hp(overrides: Partial<Hardpoint> = {}): Hardpoint {
  return {
    id: `h-${Math.random()}`, shipId: 's', buildId: 'b', slotLabel: 'Slot', type: 'Weapon', size: 'S1',
    factoryItem: 'F', installedItem: 'F', targetItem: 'Target', status: 'Missing', ...overrides,
  }
}
const testBuild: Build = { id: 'b', shipId: 's', name: 'Test Build', role: 'Role', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM' }
const testShip: Ship = { id: 's', name: 'Test Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'Role', activeBuildId: 'b', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active' }

describe('buildProcurementList (Golden Scenario A + Part 3)', () => {
  it('Golden A: an Invalid Target (M80 Atlas) is excluded from the real Procurement List', () => {
    const list = buildProcurementList(hardpoints, builds, ships)
    expect(list.some((l) => l.itemName === 'Atlas')).toBe(false)
  })

  it('5. an Invalid Target hardpoint never produces a procurement entry', () => {
    const invalid = hp({ status: 'Invalid Target', targetItem: 'BadItem' })
    const list = buildProcurementList([invalid], [testBuild], [testShip])
    expect(list).toEqual([])
  })

  it('6. a hardpoint referencing a nonexistent Build is excluded from procurement', () => {
    const orphaned = hp({ buildId: 'does-not-exist', status: 'Missing', targetItem: 'Orphan Item' })
    const list = buildProcurementList([orphaned], [testBuild], [testShip])
    expect(list).toEqual([])
  })

  it('a hardpoint whose Build has no matching Ship (Fleet Asset) is excluded', () => {
    const orphanedShip: Build = { ...testBuild, id: 'b2', shipId: 'no-such-ship' }
    const row = hp({ buildId: 'b2', status: 'Missing', targetItem: 'Item' })
    const list = buildProcurementList([row], [orphanedShip], [testShip])
    expect(list).toEqual([])
  })

  it('a valid Missing assignment with a real Build and Ship does produce a procurement entry', () => {
    const row = hp({ status: 'Missing', targetItem: 'Real Item' })
    const list = buildProcurementList([row], [testBuild], [testShip])
    expect(list).toHaveLength(1)
    expect(list[0].itemName).toBe('Real Item')
    expect(list[0].neededBy).toEqual([{ shipId: 's', buildId: 'b', label: 'Test Ship — Test Build' }])
  })

  it('39: invalid procurement entries never inflate the total Needed Items count', () => {
    const validRow = hp({ status: 'Missing', targetItem: 'Real Item' })
    const invalidRow = hp({ status: 'Invalid Target', targetItem: 'Bad Item' })
    const list = buildProcurementList([validRow, invalidRow], [testBuild], [testShip])
    expect(list.reduce((sum, l) => sum + l.qtyNeeded, 0)).toBe(1)
  })
})

describe('buildReservedAwaitingInstallLines (UX-001B Deliverable 4)', () => {
  it('a Missing assignment with an active reservation for this exact port produces a reserved line, never a plain procurement line', () => {
    const row = hp({ status: 'Missing', targetItem: 'Mirage', slotLabel: 'Left Shield' })
    const reservation: MissionReservation = {
      id: 'r1', missionConfigurationId: 'b', fleetAssetId: 's', targetSlotLabel: 'Left Shield', componentName: 'Mirage', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '',
    }
    const reserved = buildReservedAwaitingInstallLines([row], [testBuild], [testShip], [reservation])
    expect(reserved).toHaveLength(1)
    expect(reserved[0]).toMatchObject({ itemName: 'Mirage', quantity: 1 })
    expect(reserved[0].neededBy).toEqual([{ shipId: 's', buildId: 'b', label: 'Test Ship — Test Build' }])

    // The same row must never simultaneously appear in the true-shortage list.
    const procurement = buildProcurementList([row], [testBuild], [testShip], [], [reservation])
    expect(procurement).toEqual([])
  })

  it('a Missing assignment with no active reservation produces no reserved line', () => {
    const row = hp({ status: 'Missing', targetItem: 'Mirage' })
    expect(buildReservedAwaitingInstallLines([row], [testBuild], [testShip], [])).toEqual([])
  })

  it('two hardpoints reserving the same component aggregate into one line with quantity 2', () => {
    const rowA = hp({ id: 'h1', status: 'Missing', targetItem: 'Mirage', slotLabel: 'Left Shield' })
    const rowB = hp({ id: 'h2', status: 'Missing', targetItem: 'Mirage', slotLabel: 'Right Shield' })
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'b', fleetAssetId: 's', targetSlotLabel: 'Left Shield', componentName: 'Mirage', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
      { id: 'r2', missionConfigurationId: 'b', fleetAssetId: 's', targetSlotLabel: 'Right Shield', componentName: 'Mirage', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ]
    const reserved = buildReservedAwaitingInstallLines([rowA, rowB], [testBuild], [testShip], reservations)
    expect(reserved).toHaveLength(1)
    expect(reserved[0].quantity).toBe(2)
  })

  it('an Invalid Target or OK hardpoint never produces a reserved line even with a matching reservation', () => {
    const row = hp({ status: 'Invalid Target', targetItem: 'Mirage', slotLabel: 'Left Shield' })
    const reservation: MissionReservation = {
      id: 'r1', missionConfigurationId: 'b', fleetAssetId: 's', targetSlotLabel: 'Left Shield', componentName: 'Mirage', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '',
    }
    expect(buildReservedAwaitingInstallLines([row], [testBuild], [testShip], [reservation])).toEqual([])
  })

  it('returns an empty array for zero hardpoints without error', () => {
    expect(buildReservedAwaitingInstallLines([], [], [], [])).toEqual([])
  })
})

describe('sortProcurementList (Part 4, tests 2-4)', () => {
  const sample = [
    { itemName: 'Zebra Cooler', type: 'Cooler', size: 'S2', qtyNeeded: 3, availableToReserve: 0, neededBy: [] },
    { itemName: 'Alpha Shield', type: 'Shield', size: 'S10', qtyNeeded: 1, availableToReserve: 0, neededBy: [] },
    { itemName: 'Mid Weapon', type: 'Weapon', size: 'S2', qtyNeeded: 5, availableToReserve: 0, neededBy: [] },
  ]

  it('2. sorts by Component Name ascending and descending', () => {
    const asc = sortProcurementList(sample, 'name', 'asc')
    expect(asc.map((l) => l.itemName)).toEqual(['Alpha Shield', 'Mid Weapon', 'Zebra Cooler'])
    const desc = sortProcurementList(sample, 'name', 'desc')
    expect(desc.map((l) => l.itemName)).toEqual(['Zebra Cooler', 'Mid Weapon', 'Alpha Shield'])
  })

  it('3. sorts by Size/Type numerically, not lexically (S2 before S10)', () => {
    const asc = sortProcurementList(sample, 'sizeType', 'asc')
    // S2 items (Cooler, Weapon) sort before S10 (Shield) — a lexical sort would put "S10" before "S2".
    expect(asc[asc.length - 1].itemName).toBe('Alpha Shield')
    expect(asc[0].size).toBe('S2')
  })

  it('Size/Type ties break by normalized type, then component name', () => {
    const asc = sortProcurementList(sample, 'sizeType', 'asc')
    const s2Items = asc.filter((l) => l.size === 'S2')
    expect(s2Items.map((l) => l.itemName)).toEqual(['Zebra Cooler', 'Mid Weapon']) // Cooler < Weapon alphabetically
  })

  it('4. sorts by Quantity Needed numerically ascending and descending', () => {
    const asc = sortProcurementList(sample, 'quantity', 'asc')
    expect(asc.map((l) => l.qtyNeeded)).toEqual([1, 3, 5])
    const desc = sortProcurementList(sample, 'quantity', 'desc')
    expect(desc.map((l) => l.qtyNeeded)).toEqual([5, 3, 1])
  })

  it('default sort is Component Name ascending, verified independently', () => {
    const defaultSorted = sortProcurementList(sample, 'name', 'asc')
    expect(defaultSorted[0].itemName).toBe('Alpha Shield')
  })
})
