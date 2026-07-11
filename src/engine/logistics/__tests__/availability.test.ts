import { describe, it, expect } from 'vitest'
import { calculateComponentAvailability } from '../availability'
import type { HangarItem, InstalledLoadoutEntry, MissionReservation } from '../../../types'

function hangarItem(overrides: Partial<HangarItem> = {}): HangarItem {
  return { id: 'h1', name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store', ...overrides }
}
function reservation(overrides: Partial<MissionReservation> = {}): MissionReservation {
  return {
    id: 'r1', missionConfigurationId: 'b1', fleetAssetId: 's1', targetSlotLabel: 'Shield 1',
    componentName: 'FR-66', quantity: 1, status: 'ACTIVE', createdAt: 'now', updatedAt: 'now', ...overrides,
  }
}

describe('calculateComponentAvailability (Part 5)', () => {
  it('1. available quantity = hangar stock minus active reservations', () => {
    const result = calculateComponentAvailability('FR-66', [hangarItem({ qty: 4 })], [], [reservation({ quantity: 2 })])
    expect(result.availableQuantity).toBe(2)
  })

  it('2. reserved quantity sums only ACTIVE reservations for this component', () => {
    const reservations = [
      reservation({ id: 'r1', quantity: 1, status: 'ACTIVE' }),
      reservation({ id: 'r2', quantity: 1, status: 'RELEASED' }),
      reservation({ id: 'r3', quantity: 2, status: 'ACTIVE' }),
    ]
    const result = calculateComponentAvailability('FR-66', [hangarItem({ qty: 5 })], [], reservations)
    expect(result.reservedQuantity).toBe(3)
  })

  it('3. installed quantity counts unique InstalledLoadout entries, not raw duplicated Hardpoint rows', () => {
    const installedLoadouts: InstalledLoadoutEntry[] = [
      { shipId: 'ghost', slotLabel: 'Shield 1', installedItem: 'FR-66' },
      { shipId: 'cutlass-red', slotLabel: 'Shield 2', installedItem: 'FR-66' },
    ]
    const result = calculateComponentAvailability('FR-66', [], installedLoadouts, [])
    expect(result.installedQuantity).toBe(2)
  })

  it('4. owned quantity reconciles as available + reserved + installed', () => {
    const installedLoadouts: InstalledLoadoutEntry[] = [{ shipId: 'ghost', slotLabel: 'Shield 1', installedItem: 'FR-66' }]
    const result = calculateComponentAvailability('FR-66', [hangarItem({ qty: 4 })], installedLoadouts, [reservation({ quantity: 2 })])
    expect(result.ownedQuantity).toBe(result.availableQuantity + result.reservedQuantity + result.installedQuantity)
    expect(result.ownedQuantity).toBe(2 + 2 + 1)
  })

  it('5. a component with zero owned quantity has zero everything, correctly representing MISSING context', () => {
    const result = calculateComponentAvailability('Nonexistent Item', [], [], [])
    expect(result.ownedQuantity).toBe(0)
    expect(result.availableQuantity).toBe(0)
  })

  it('31. negative inventory is impossible even with inconsistent over-reservation data', () => {
    const result = calculateComponentAvailability('FR-66', [hangarItem({ qty: 1 })], [], [reservation({ quantity: 5 })])
    expect(result.availableQuantity).toBe(0)
    expect(result.availableQuantity).toBeGreaterThanOrEqual(0)
  })
})
