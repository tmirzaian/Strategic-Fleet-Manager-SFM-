import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => localStorage.clear())

function addGladius(nickname?: string) {
  const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
  const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', nickname)
  return added.assetId!
}

describe('SW-015C: retireFleetAsset — a manual (non-seed) vessel', () => {
  it('Deliverable 1: sets lifecycleStatus to retired and stamps retiredAt on both FleetAsset and Ship', () => {
    const id = addGladius()
    const before = new Date().toISOString()
    const result = useFleetStore.getState().retireFleetAsset(id)
    expect(result.success).toBe(true)

    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === id)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === id)!
    expect(asset.lifecycleStatus).toBe('retired')
    expect(ship.lifecycleStatus).toBe('retired')
    expect(asset.retiredAt).toBeDefined()
    expect(new Date(asset.retiredAt!).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime())
  })

  it('Deliverable 5: never deletes the Ship/Build/Hardpoint/InstalledLoadout rows — the vessel stays fully materialized', () => {
    const id = addGladius()
    const buildsBefore = useFleetStore.getState().builds.filter((b) => b.shipId === id).length
    const hardpointsBefore = useFleetStore.getState().hardpoints.filter((h) => h.shipId === id).length

    useFleetStore.getState().retireFleetAsset(id)

    expect(useFleetStore.getState().ships.some((s) => s.id === id)).toBe(true)
    expect(useFleetStore.getState().builds.filter((b) => b.shipId === id).length).toBe(buildsBefore)
    expect(useFleetStore.getState().hardpoints.filter((h) => h.shipId === id).length).toBe(hardpointsBefore)
  })

  it('Deliverable 5: never touches the custom image reference', async () => {
    const { storeShipImage } = await import('../../utils/shipImageStorage')
    const id = addGladius()
    await storeShipImage(id, new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))
    useFleetStore.getState().updateFleetAssetCustomImage(id, `ships/${id}.png`)

    useFleetStore.getState().retireFleetAsset(id)

    expect(useFleetStore.getState().fleetAssets.find((a) => a.id === id)?.customImageRef).toBe(`ships/${id}.png`)
  })

  it('fails cleanly for an unknown vessel id', () => {
    const result = useFleetStore.getState().retireFleetAsset('not-a-real-id')
    expect(result.success).toBe(false)
  })

  it('fails cleanly when retiring an already-retired vessel', () => {
    const id = addGladius()
    useFleetStore.getState().retireFleetAsset(id)
    const second = useFleetStore.getState().retireFleetAsset(id)
    expect(second.success).toBe(false)
  })

  it('Deliverable 5 (Instance Isolation): retiring one vessel does not affect another of the same model', () => {
    const idA = addGladius('Keep Active')
    const idB = addGladius('Retire Me')
    useFleetStore.getState().retireFleetAsset(idB)

    expect(useFleetStore.getState().fleetAssets.find((a) => a.id === idA)?.lifecycleStatus).toBe('active')
    expect(useFleetStore.getState().fleetAssets.find((a) => a.id === idB)?.lifecycleStatus).toBe('retired')
  })
})

describe('SW-015C (Deliverable 6): retireFleetAsset releases active reservations', () => {
  it('releases a reservation recorded directly against the vessel, without deleting the underlying inventory', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({
      missionConfigurationId: 'ghost-escort',
      fleetAssetId: 'ghost',
      targetSlotLabel: 'Left Shield Generator',
      componentName: 'FR-66',
    })
    expect(reserve.success).toBe(true)

    const result = useFleetStore.getState().retireFleetAsset('ghost')
    expect(result.releasedReservationCount).toBe(1)

    const reservation = useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation.status).toBe('RELEASED')
    // The Hangar quantity itself is untouched — releasing a reservation
    // returns stock to "available," it never deletes the owned quantity.
    expect(useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')?.qty).toBe(2)
  })

  it('reports zero released reservations (and a success result) for a vessel with none', () => {
    const id = addGladius()
    const result = useFleetStore.getState().retireFleetAsset(id)
    expect(result.success).toBe(true)
    expect(result.releasedReservationCount).toBe(0)
  })
})

describe('SW-015C (Deliverable 4): retireFleetAsset closes the active Fleet Priority gap', () => {
  it('shifts down every other ACTIVE ship ranked after the retiring one, without touching a retired ship elsewhere', () => {
    const idA = addGladius('Rank 1')
    const idB = addGladius('Rank 2')
    const idC = addGladius('Rank 3')
    useFleetStore.getState().setFleetPriority(idA, 1)
    useFleetStore.getState().setFleetPriority(idB, 2)
    useFleetStore.getState().setFleetPriority(idC, 3)

    useFleetStore.getState().retireFleetAsset(idB)

    const shipC = useFleetStore.getState().ships.find((s) => s.id === idC)!
    expect(shipC.priority).toBe(2) // shifted down to fill the vacated rank 2
    const shipA = useFleetStore.getState().ships.find((s) => s.id === idA)!
    expect(shipA.priority).toBe(1) // unaffected, was already ahead of the gap
  })

  it("preserves the retiring ship's own last priority value rather than nulling it — \"for potential future restoration\"", () => {
    const idA = addGladius('Ranked')
    useFleetStore.getState().setFleetPriority(idA, 1)
    useFleetStore.getState().retireFleetAsset(idA)
    const retired = useFleetStore.getState().fleetAssets.find((a) => a.id === idA)!
    expect(retired.priority).toBe(1)
  })
})

describe('SW-015C (Deliverable 8): recommissionFleetAsset', () => {
  it('restores lifecycleStatus to active — the same record, not a duplicate', () => {
    const id = addGladius()
    useFleetStore.getState().retireFleetAsset(id)
    const before = useFleetStore.getState().fleetAssets.length

    const result = useFleetStore.getState().recommissionFleetAsset(id)
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().fleetAssets.find((a) => a.id === id)?.lifecycleStatus).toBe('active')
    expect(useFleetStore.getState().fleetAssets.length).toBe(before) // no duplicate created
  })

  it('clears retiredAt', () => {
    const id = addGladius()
    useFleetStore.getState().retireFleetAsset(id)
    useFleetStore.getState().recommissionFleetAsset(id)
    expect(useFleetStore.getState().fleetAssets.find((a) => a.id === id)?.retiredAt).toBeUndefined()
  })

  it('resets priority to Unprioritized rather than restoring a possibly-stale rank', () => {
    const idA = addGladius('Ranked')
    useFleetStore.getState().setFleetPriority(idA, 1)
    useFleetStore.getState().retireFleetAsset(idA)
    useFleetStore.getState().recommissionFleetAsset(idA)
    expect(useFleetStore.getState().ships.find((s) => s.id === idA)?.priority).toBeNull()
  })

  it('never restores a released reservation', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({
      missionConfigurationId: 'ghost-escort',
      fleetAssetId: 'ghost',
      targetSlotLabel: 'Left Shield Generator',
      componentName: 'FR-66',
    })
    expect(reserve.success).toBe(true)

    useFleetStore.getState().retireFleetAsset('ghost')
    useFleetStore.getState().recommissionFleetAsset('ghost')

    const reservation = useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation.status).toBe('RELEASED')
  })

  it('fails cleanly for an unknown vessel id', () => {
    expect(useFleetStore.getState().recommissionFleetAsset('not-a-real-id').success).toBe(false)
  })

  it('fails cleanly when recommissioning an already-active vessel', () => {
    const id = addGladius()
    expect(useFleetStore.getState().recommissionFleetAsset(id).success).toBe(false)
  })
})

describe('SW-015C: retire/recommission for a seed-migrated vessel (Ghost)', () => {
  it('retiring "ghost" keeps it in `ships`, marked retired, and records the seedAssetOverrides diff', () => {
    const seedAssetId = useFleetStore.getState().fleetAssets.find((a) => a.shipDefinitionId === 'ghost')!.id
    const result = useFleetStore.getState().retireFleetAsset('ghost')
    expect(result.success).toBe(true)

    expect(useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.lifecycleStatus).toBe('retired')
    expect(useFleetStore.getState().seedAssetOverrides[seedAssetId]?.lifecycleStatus).toBe('retired')
  })

  it('recommissioning "ghost" restores active status and clears the override diff back to active', () => {
    useFleetStore.getState().retireFleetAsset('ghost')
    useFleetStore.getState().recommissionFleetAsset('ghost')
    expect(useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.lifecycleStatus).toBe('active')
  })

  it('survives a genuine store reload', async () => {
    const { useFleetStore: store } = await import('../useFleetStore')
    store.getState().retireFleetAsset('ghost')

    const { vi } = await import('vitest')
    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')

    expect(reloaded.getState().ships.find((s) => s.id === 'ghost')?.lifecycleStatus).toBe('retired')
  })
})
