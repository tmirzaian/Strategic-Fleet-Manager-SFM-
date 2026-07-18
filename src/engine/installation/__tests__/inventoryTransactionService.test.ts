import { describe, it, expect } from 'vitest'
import { checkReservationOwnership, planHangarDecrement } from '../inventoryTransactionService'
import { resolveComponentIdentity } from '../componentIdentityService'
import type { HangarItem, MissionReservation } from '../../../types'

const fr66Identity = resolveComponentIdentity({ displayName: 'FR-66' })!

function hangarItem(overrides: Partial<HangarItem> = {}): HangarItem {
  return { id: 'item-1', name: 'FR-66', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store', ...overrides }
}

function reservation(overrides: Partial<MissionReservation> = {}): MissionReservation {
  return {
    id: 'res-1',
    missionConfigurationId: 'build-1',
    fleetAssetId: 'ghost',
    targetSlotLabel: 'Shield 1',
    componentName: 'FR-66',
    quantity: 1,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('EWO-STAB-003B: InventoryTransactionService — planHangarDecrement', () => {
  it("1. inventorySource 'NONE' touches nothing — the pre-existing Quick Update no-bookkeeping case", () => {
    const hangarItems = [hangarItem()]
    const reservations = [reservation()]
    const plan = planHangarDecrement({ hangarItems, reservations, installedLoadouts: [], itemName: 'FR-66', buildId: 'build-1', slotLabel: 'Shield 1', inventorySource: 'NONE' })
    expect(plan.hangarItems).toBe(hangarItems)
    expect(plan.reservations).toBe(reservations)
    expect(plan.reservationFulfilled).toBe(false)
  })

  it('2. a matching ACTIVE reservation is fulfilled and spread-decremented across matching-name rows, consolidating the old installComponent path', () => {
    const hangarItems = [hangarItem({ id: 'a', qty: 2 })]
    const reservations = [reservation({ quantity: 1 })]
    const plan = planHangarDecrement({ hangarItems, reservations, installedLoadouts: [], itemName: 'FR-66', buildId: 'build-1', slotLabel: 'Shield 1', matchingReservationId: reservations[0].id, inventorySource: 'HANGAR' })
    expect(plan.reservationFulfilled).toBe(true)
    expect(plan.reservations[0].status).toBe('FULFILLED')
    expect(plan.hangarItems.find((h) => h.id === 'a')?.qty).toBe(1)
  })

  it('3. a fulfilled reservation that exhausts a row removes it entirely', () => {
    const hangarItems = [hangarItem({ id: 'a', qty: 1 })]
    const reservations = [reservation({ quantity: 1 })]
    const plan = planHangarDecrement({ hangarItems, reservations, installedLoadouts: [], itemName: 'FR-66', buildId: 'build-1', slotLabel: 'Shield 1', matchingReservationId: reservations[0].id, inventorySource: 'HANGAR' })
    expect(plan.hangarItems.some((h) => h.id === 'a')).toBe(false)
  })

  it('4. no matching reservation, but a specific hangarItemId given — decrements that exact unit by one, consolidating the old moveToShip path', () => {
    const hangarItems = [hangarItem({ id: 'a', qty: 3 })]
    const plan = planHangarDecrement({ hangarItems, reservations: [], installedLoadouts: [], itemName: 'FR-66', buildId: 'build-1', slotLabel: 'Shield 1', hangarItemId: 'a', inventorySource: 'HANGAR' })
    expect(plan.hangarItems.find((h) => h.id === 'a')?.qty).toBe(2)
    expect(plan.reservationFulfilled).toBe(false)
  })

  it('5. hangarItemId decrement floors at zero, never goes negative', () => {
    const hangarItems = [hangarItem({ id: 'a', qty: 0 })]
    const plan = planHangarDecrement({ hangarItems, reservations: [], installedLoadouts: [], itemName: 'FR-66', buildId: 'build-1', slotLabel: 'Shield 1', hangarItemId: 'a', inventorySource: 'HANGAR' })
    expect(plan.hangarItems.find((h) => h.id === 'a')?.qty).toBe(0)
  })

  it('6. a fulfilled reservation never ALSO decrements a specific hangarItemId — the two paths are mutually exclusive, preventing the double-count EWO-029 (Task 7, Scenario E) guarded against', () => {
    const hangarItems = [hangarItem({ id: 'a', qty: 2 })]
    const reservations = [reservation({ quantity: 1 })]
    const plan = planHangarDecrement({ hangarItems, reservations, installedLoadouts: [], itemName: 'FR-66', buildId: 'build-1', slotLabel: 'Shield 1', matchingReservationId: reservations[0].id, hangarItemId: 'a', inventorySource: 'HANGAR' })
    // Reservation path takes exactly 1 (quantity: 1) — if the hangarItemId
    // path also fired, qty would be 0 instead of 1.
    expect(plan.hangarItems.find((h) => h.id === 'a')?.qty).toBe(1)
  })

  it('7. no reservation and no hangarItemId — the long-supported "record an install with no inventory bookkeeping" case (EWO-029) — nothing changes', () => {
    const hangarItems = [hangarItem({ id: 'a', qty: 2 })]
    const plan = planHangarDecrement({ hangarItems, reservations: [], installedLoadouts: [], itemName: 'FR-66', buildId: 'build-1', slotLabel: 'Shield 1', inventorySource: 'HANGAR' })
    expect(plan.hangarItems).toEqual(hangarItems)
    expect(plan.reservationFulfilled).toBe(false)
  })
})

describe('EWO-STAB-003B: InventoryTransactionService — checkReservationOwnership', () => {
  it('8. a matching reservation always passes ownership — it is being fulfilled, not stolen', () => {
    const result = checkReservationOwnership({ identity: fr66Identity, hasMatchingReservation: true, hangarItems: [], installedLoadouts: [], reservations: [] })
    expect(result.ok).toBe(true)
  })

  it('9. no competing reservation at all passes — the pre-existing Quick Update no-bookkeeping case (EWO-029)', () => {
    const result = checkReservationOwnership({ identity: fr66Identity, hasMatchingReservation: false, hangarItems: [], installedLoadouts: [], reservations: [] })
    expect(result.ok).toBe(true)
  })

  it('10. a competing ACTIVE reservation for a different build with zero available stock is blocked (EWO-029, Task 7, Scenario F / Design Authority Ruling 8)', () => {
    const hangarItems = [hangarItem({ id: 'a', qty: 1 })]
    const reservations = [reservation({ missionConfigurationId: 'build-2', quantity: 1 })]
    const result = checkReservationOwnership({ identity: fr66Identity, hasMatchingReservation: false, hangarItems, installedLoadouts: [], reservations })
    expect(result.ok).toBe(false)
  })

  it('11. a competing ACTIVE reservation with real spare stock available is not blocked', () => {
    const hangarItems = [hangarItem({ id: 'a', qty: 2 })]
    const reservations = [reservation({ missionConfigurationId: 'build-2', quantity: 1 })]
    const result = checkReservationOwnership({ identity: fr66Identity, hasMatchingReservation: false, hangarItems, installedLoadouts: [], reservations })
    expect(result.ok).toBe(true)
  })
})
