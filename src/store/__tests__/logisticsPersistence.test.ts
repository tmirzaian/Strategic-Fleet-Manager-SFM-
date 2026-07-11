import { describe, it, expect, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  localStorage.clear()
})

describe('Logistics persistence (Alpha 2.3, schemaVersion 4)', () => {
  it('29/Golden G: reservations and inventory survive a genuine store reload', async () => {
    const { useFleetStore } = await import('../useFleetStore')

    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    const raw = localStorage.getItem('sfm-fleet-store')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw!)
    expect(persisted.state.reservations.some((r: { id: string }) => r.id === reserve.reservationId)).toBe(true)

    const { vi } = await import('vitest')
    vi.resetModules()
    const { useFleetStore: reloadedStore } = await import('../useFleetStore')

    const rehydratedReservation = reloadedStore.getState().reservations.find((r) => r.id === reserve.reservationId)
    expect(rehydratedReservation).toBeDefined()
    expect(rehydratedReservation?.status).toBe('ACTIVE')
    expect(rehydratedReservation?.componentName).toBe('FR-66')

    const rehydratedHangar = reloadedStore.getState().hangarItems.find((h) => h.name === 'FR-66')
    expect(rehydratedHangar).toBeDefined()
  })

  it('installed loadout changes survive a genuine store reload', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    useFleetStore.getState().installComponent('ghost', 'Slipstream', 'Power 1', 'ghost-stealth')

    const { vi } = await import('vitest')
    vi.resetModules()
    const { useFleetStore: reloadedStore } = await import('../useFleetStore')

    const entry = reloadedStore.getState().installedLoadouts.find((e) => e.shipId === 'ghost' && e.slotLabel === 'Power 1')
    expect(entry?.installedItem).toBe('Slipstream')
  })

  it('30: an invalidated reservation reference is flagged, not silently deleted or substituted', async () => {
    localStorage.clear()
    const { vi } = await import('vitest')
    vi.resetModules()
    const { useFleetStore } = await import('../useFleetStore')

    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    useFleetStore.getState().deleteBuild('ghost-escort')
    const reservation = useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation).toBeDefined()
    expect(reservation.status).toBe('RELEASED')
  })
})
