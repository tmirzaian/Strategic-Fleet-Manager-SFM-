import { describe, it, expect, beforeEach } from 'vitest'
import { resolveReservationEligibility } from '../hangarReservationEligibility'
import { useFleetStore } from '../../store/useFleetStore'
import type { HangarItem, MissionReservation } from '../../types'

const initialState = useFleetStore.getState()

beforeEach(() => {
  useFleetStore.setState(initialState, true)
})

function args(hangarItems: HangarItem[], reservations: MissionReservation[] = []) {
  const s = useFleetStore.getState()
  return [s.ships, s.builds, s.fleetAssets, s.hardpoints, hangarItems, s.installedLoadouts, reservations] as const
}

/**
 * EWO-072 (Part B/K) — `resolveReservationEligibility` is the one
 * canonical answer every Hangar Inventory surface (row Reserve
 * visibility, Needed By counts, the Reserve modal's own Fleet Asset/
 * Build/Target options) is required to share. FR-66 has a real, genuine,
 * unresolved Ghost-Escort requirement in the seed fixture (see
 * HangarInventory.test.tsx's own established use of this exact pair).
 */
describe('resolveReservationEligibility (EWO-072 Part B/K)', () => {
  it('is ineligible when Available stock exists but no real unresolved target requirement does anywhere', () => {
    const hangarItems: HangarItem[] = [{ id: '1', name: 'Fictitious Widget', type: 'Cooler', size: 'S1', qty: 3, neededBy: 'None', disposition: 'Store' }]
    const result = resolveReservationEligibility('Fictitious Widget', undefined, ...args(hangarItems))
    expect(result.availability.availableQuantity).toBe(3)
    expect(result.unreservedNeededBy).toHaveLength(0)
    expect(result.eligible).toBe(false)
  })

  it('is ineligible when a real unresolved requirement exists but no Available stock does', () => {
    const result = resolveReservationEligibility('FR-66', undefined, ...args([]))
    expect(result.availability.availableQuantity).toBe(0)
    expect(result.neededBy.length).toBeGreaterThan(0)
    expect(result.eligible).toBe(false)
  })

  it('is eligible only when BOTH Available stock and a real unresolved, unreserved requirement exist at once', () => {
    const hangarItems: HangarItem[] = [{ id: '1', name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }]
    const result = resolveReservationEligibility('FR-66', undefined, ...args(hangarItems))
    expect(result.availability.availableQuantity).toBe(1)
    expect(result.unreservedNeededBy.length).toBeGreaterThan(0)
    expect(result.eligible).toBe(true)
  })

  it('becomes ineligible again once the only unresolved requirement is already covered by an ACTIVE reservation', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66', quantity: 1 })
    expect(reserve.success).toBe(true)
    const result = resolveReservationEligibility('FR-66', undefined, ...args(useFleetStore.getState().hangarItems, useFleetStore.getState().reservations))
    // The one real Ghost-Escort requirement is now reserved — no
    // unreserved match remains, even though stock is still Available.
    expect(result.unreservedNeededBy).toHaveLength(0)
    expect(result.eligible).toBe(false)
  })
})
