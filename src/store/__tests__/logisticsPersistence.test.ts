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
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
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
    // MWO-001 (Task 2): 'ghost' now resolves through the real deep-imported
    // Ghost Mk II structure, whose Power Plant port is labeled "Power
    // Plant" (S1), not the old seed fixture's "Power 1" — and, being a
    // genuinely new port from reconciliation's perspective, it starts with
    // no target set (status OK, nothing required) rather than the old seed
    // fixture's baked-in "wants Slipstream" upgrade scenario. Establishing
    // that same want explicitly first (editing ghost-stealth in place) is
    // what lets installComponent's Quick Update fulfill it, exactly like
    // the pre-promotion seed data used to provide for free.
    const { useFleetStore } = await import('../useFleetStore')
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Stealth Build',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: { 'Power Plant': 'Slipstream' },
      setActive: true,
    })
    expect(save.success).toBe(true)
    const installResult = useFleetStore.getState().installComponent('ghost', 'Slipstream', 'Power Plant', 'ghost-stealth')
    expect(installResult.matched).toBe(true)

    const { vi } = await import('vitest')
    vi.resetModules()
    const { useFleetStore: reloadedStore } = await import('../useFleetStore')

    const entry = reloadedStore.getState().installedLoadouts.find((e) => e.shipId === 'ghost' && e.slotLabel === 'Power Plant')
    expect(entry?.installedItem).toBe('Slipstream')
  })

  it('30: an invalidated reservation reference is flagged, not silently deleted or substituted', async () => {
    localStorage.clear()
    const { vi } = await import('vitest')
    vi.resetModules()
    const { useFleetStore } = await import('../useFleetStore')

    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    useFleetStore.getState().deleteBuild('ghost-escort')
    const reservation = useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation).toBeDefined()
    expect(reservation.status).toBe('RELEASED')
  })
})
