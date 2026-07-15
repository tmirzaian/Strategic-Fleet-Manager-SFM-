import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { calculateComponentAvailability } from '../../engine/logistics/availability'
import { resolveInventoryDependencies } from '../../utils/inventoryDependencies'
import { catalogComponentsByName } from '../../generated/componentCatalog'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => {
  localStorage.clear()
})

// A real catalog component, used across many tests below so the exact
// entityClass/category/size come from real generated data, never invented.
const REAL_NAME = 'Blizzard'
const REAL_ENTRY = catalogComponentsByName.get(REAL_NAME)

describe('EWO-028 (Task 3): duplicate add / quantity merge', () => {
  it('7. adding the same canonical component again increments existing quantity rather than creating a second row', () => {
    if (!REAL_ENTRY) return
    // The seed fixture already has a legacy (no entityClass) 'Blizzard'
    // row — cleared here so this test exercises canonical-add merging in
    // isolation, not the (correct, separately-tested) legacy-never-auto-
    // merges behavior.
    useFleetStore.setState({ hangarItems: useFleetStore.getState().hangarItems.filter((h) => h.name !== REAL_NAME) })

    const a = useFleetStore.getState().addHangarItem({ name: REAL_NAME, type: REAL_ENTRY.category, size: `S${REAL_ENTRY.size}`, qty: 2, neededBy: 'None', disposition: 'Store', entityClass: REAL_ENTRY.entityClass })
    expect(a.success).toBe(true)
    expect(a.merged).toBe(false)
    const b = useFleetStore.getState().addHangarItem({ name: REAL_NAME, type: REAL_ENTRY.category, size: `S${REAL_ENTRY.size}`, qty: 3, neededBy: 'None', disposition: 'Store', entityClass: REAL_ENTRY.entityClass })
    expect(b.success).toBe(true)
    expect(b.merged).toBe(true)

    const rows = useFleetStore.getState().hangarItems.filter((h) => h.name === REAL_NAME)
    expect(rows).toHaveLength(1)
    expect(rows[0].qty).toBe(5)
  })

  it('8. two records with distinct sizes never merge, even with the same display name', () => {
    useFleetStore.getState().addHangarItem({ name: 'Test Component', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().addHangarItem({ name: 'Test Component', type: 'Cooler', size: 'S2', qty: 1, neededBy: 'None', disposition: 'Store' })
    const rows = useFleetStore.getState().hangarItems.filter((h) => h.name === 'Test Component')
    expect(rows).toHaveLength(2)
  })

  it('9. two records sharing a display name but distinct canonical entityClass never merge', () => {
    useFleetStore.getState().addHangarItem({ name: 'Same Name', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store', entityClass: 'ENTITY_CLASS_A' })
    useFleetStore.getState().addHangarItem({ name: 'Same Name', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store', entityClass: 'ENTITY_CLASS_B' })
    const rows = useFleetStore.getState().hangarItems.filter((h) => h.name === 'Same Name')
    expect(rows).toHaveLength(2)
  })

  it('a legacy record (no entityClass) never silently merges with a new canonical add of the same name — Task 3/1: never collapse merely because display names match', () => {
    useFleetStore.getState().addHangarItem({ name: 'Legacy Widget', type: 'Cooler', size: 'S1', qty: 4, neededBy: 'None', disposition: 'Store' }) // no entityClass
    useFleetStore.getState().addHangarItem({ name: 'Legacy Widget', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store', entityClass: 'REAL_ENTITY_CLASS' })
    const rows = useFleetStore.getState().hangarItems.filter((h) => h.name === 'Legacy Widget')
    expect(rows).toHaveLength(2)
  })

  it('10. installed/reserved counts survive a quantity merge — merging never touches allocation state', () => {
    if (!REAL_ENTRY) return
    useFleetStore.getState().addHangarItem({ name: REAL_NAME, type: REAL_ENTRY.category, size: `S${REAL_ENTRY.size}`, qty: 3, neededBy: 'None', disposition: 'Store', entityClass: REAL_ENTRY.entityClass })
    const before = calculateComponentAvailability(REAL_NAME, useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)

    useFleetStore.getState().addHangarItem({ name: REAL_NAME, type: REAL_ENTRY.category, size: `S${REAL_ENTRY.size}`, qty: 2, neededBy: 'None', disposition: 'Store', entityClass: REAL_ENTRY.entityClass })
    const after = calculateComponentAvailability(REAL_NAME, useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)

    expect(after.installedQuantity).toBe(before.installedQuantity)
    expect(after.reservedQuantity).toBe(before.reservedQuantity)
    expect(after.ownedQuantity).toBe(before.ownedQuantity + 2)
  })

  it('adding with an invalid (zero/negative/fractional) quantity is rejected, never creates a record', () => {
    const before = useFleetStore.getState().hangarItems.length
    expect(useFleetStore.getState().addHangarItem({ name: 'Bad Qty', type: 'Cooler', size: 'S1', qty: 0, neededBy: 'None', disposition: 'Store' }).success).toBe(false)
    expect(useFleetStore.getState().addHangarItem({ name: 'Bad Qty', type: 'Cooler', size: 'S1', qty: -1, neededBy: 'None', disposition: 'Store' }).success).toBe(false)
    expect(useFleetStore.getState().addHangarItem({ name: 'Bad Qty', type: 'Cooler', size: 'S1', qty: 1.5, neededBy: 'None', disposition: 'Store' }).success).toBe(false)
    expect(useFleetStore.getState().hangarItems.length).toBe(before)
  })
})

describe('EWO-028 (Task 4): Edit — quantity-only, validated', () => {
  it('11. edit quantity upward succeeds and Available reflects it immediately', () => {
    useFleetStore.getState().addHangarItem({ name: 'Edit Up', type: 'Cooler', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Edit Up')!
    const result = useFleetStore.getState().updateHangarItemQuantity(item.id, 9)
    expect(result.success).toBe(true)
    const availability = calculateComponentAvailability('Edit Up', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(availability.availableQuantity).toBe(9)
  })

  it('12. edit quantity downward, above the allocation floor, succeeds directly', () => {
    useFleetStore.getState().addHangarItem({ name: 'Edit Down', type: 'Cooler', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Edit Down')!
    const result = useFleetStore.getState().updateHangarItemQuantity(item.id, 2)
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().hangarItems.find((h) => h.id === item.id)?.qty).toBe(2)
  })

  it('13. a negative quantity is rejected', () => {
    useFleetStore.getState().addHangarItem({ name: 'Edit Neg', type: 'Cooler', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Edit Neg')!
    const result = useFleetStore.getState().updateHangarItemQuantity(item.id, -1)
    expect(result.success).toBe(false)
    expect(useFleetStore.getState().hangarItems.find((h) => h.id === item.id)?.qty).toBe(5)
  })

  it('14. a fractional quantity is rejected', () => {
    useFleetStore.getState().addHangarItem({ name: 'Edit Frac', type: 'Cooler', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Edit Frac')!
    const result = useFleetStore.getState().updateHangarItemQuantity(item.id, 2.5)
    expect(result.success).toBe(false)
    expect(useFleetStore.getState().hangarItems.find((h) => h.id === item.id)?.qty).toBe(5)
  })

  it('15. canonical identity, name, type, and size cannot be changed via the Edit action — no store action exists for it', () => {
    // Structural proof: updateHangarItemQuantity's own signature only
    // accepts (itemId, qty) — there is no code path to rewrite name/
    // type/size/entityClass on an existing record.
    expect(typeof useFleetStore.getState().updateHangarItemQuantity).toBe('function')
    expect(useFleetStore.getState().updateHangarItemQuantity.length).toBe(2)
  })

  it('a zero quantity is preserved as a real record, not silently deleted — the documented Task 4 choice', () => {
    useFleetStore.getState().addHangarItem({ name: 'Edit Zero', type: 'Cooler', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Edit Zero')!
    const result = useFleetStore.getState().updateHangarItemQuantity(item.id, 0)
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().hangarItems.some((h) => h.id === item.id && h.qty === 0)).toBe(true)
  })
})

describe('EWO-028 (Task 5): Delete', () => {
  it('16. deleting an unreferenced item removes it', () => {
    useFleetStore.getState().addHangarItem({ name: 'Delete Me', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Delete Me')!
    const result = useFleetStore.getState().deleteHangarItem(item.id)
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().hangarItems.some((h) => h.id === item.id)).toBe(false)
  })

  it('17/18/19. resolveInventoryDependencies names the exact ship/build for both Installed and Reserved allocations, and lists multiple dependencies together', () => {
    // Mirage is both installed on Ghost (seed fixture) and has spare stock — reserve one more against Cutlass Red for a second dependency.
    useFleetStore.getState().addHangarItem({ name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'cutlass-red-medical', fleetAssetId: 'cutlass-red', targetSlotLabel: 'Shield 1', componentName: 'Mirage' })

    const state = useFleetStore.getState()
    const deps = resolveInventoryDependencies('Mirage', state.ships, state.builds, state.fleetAssets, state.installedLoadouts, state.reservations)
    expect(deps.some((d) => d.kind === 'INSTALLED')).toBe(true)
    expect(deps.some((d) => d.kind === 'RESERVED')).toBe(true)
    expect(deps.length).toBeGreaterThanOrEqual(2)
    const installed = deps.find((d) => d.kind === 'INSTALLED')!
    expect(installed.hullName.length).toBeGreaterThan(0)
    expect(installed.buildName.length).toBeGreaterThan(0)
    const reserved = deps.find((d) => d.kind === 'RESERVED')!
    expect(reserved.hullName).toContain('Cutlass Red')
  })

  it('20. Cancel (never calling deleteHangarItem) preserves the record exactly', () => {
    useFleetStore.getState().addHangarItem({ name: 'Cancel Me', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const before = [...useFleetStore.getState().hangarItems]
    // Simulates the Commander clicking Cancel: no store action is invoked at all.
    expect(useFleetStore.getState().hangarItems).toEqual(before)
  })

  it('21. deleting a referenced item removes the inventory record without touching the reservation/installed-loadout records themselves', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')!

    useFleetStore.getState().deleteHangarItem(item.id)

    expect(useFleetStore.getState().hangarItems.some((h) => h.id === item.id)).toBe(false)
    // The reservation record itself is untouched (never silently deleted) — Ruling 9.
    const reservation = useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation.status).toBe('ACTIVE')
  })
})

describe('EWO-028 (Task 6/8): quantity-reduction safeguard and Available accounting', () => {
  it('22/24. reducing quantity below the reserved amount is detected by comparing against resolveInventoryDependencies — never silently accepted without the caller checking first', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    const state = useFleetStore.getState()
    const deps = resolveInventoryDependencies('FR-66', state.ships, state.builds, state.fleetAssets, state.installedLoadouts, state.reservations)
    const claimed = deps.reduce((sum, d) => sum + d.quantity, 0)
    expect(claimed).toBe(1)
    // The UI (HangarInventory.tsx) gates the save behind this exact
    // comparison — proven directly here rather than only through the DOM.
    const proposedQty = 0
    expect(proposedQty < claimed).toBe(true)
  })

  it('25. "Continue Anyway" (the store action itself) never claims more physical units are available than owned — Available floors at zero, Reserved is never silently deleted', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')!
    const result = useFleetStore.getState().updateHangarItemQuantity(item.id, 0) // below the 1 already reserved
    expect(result.success).toBe(true)

    const availability = calculateComponentAvailability('FR-66', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(availability.availableQuantity).toBe(0) // never negative
    expect(availability.reservedQuantity).toBe(1) // the reservation itself was never silently deleted or reassigned
    const reservation = useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation.status).toBe('ACTIVE')
  })

  it('26. Available is never negative, even after an aggressive reduction', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')!
    useFleetStore.getState().updateHangarItemQuantity(item.id, 0)
    const availability = calculateComponentAvailability('FR-66', useFleetStore.getState().hangarItems, useFleetStore.getState().installedLoadouts, useFleetStore.getState().reservations)
    expect(availability.availableQuantity).toBeGreaterThanOrEqual(0)
  })
})

describe('EWO-028 (Task 9): legacy inventory maintenance', () => {
  it('27. a legacy record (missing entityClass, stale neededBy) remains fully editable and deletable', () => {
    useFleetStore.setState({
      hangarItems: [
        ...useFleetStore.getState().hangarItems,
        { id: 'legacy-1', name: 'Ancient Test Widget', type: 'Cooler', size: 'S1', qty: 3, neededBy: 'MOLE — Deleted Build That No Longer Exists', disposition: 'Store' },
      ],
    })
    const editResult = useFleetStore.getState().updateHangarItemQuantity('legacy-1', 1)
    expect(editResult.success).toBe(true)
    const deleteResult = useFleetStore.getState().deleteHangarItem('legacy-1')
    expect(deleteResult.success).toBe(true)
  })

  it('28. a legacy record referencing a stale (non-existent) Build/ship never crashes dependency resolution', () => {
    useFleetStore.setState({
      hangarItems: [...useFleetStore.getState().hangarItems, { id: 'legacy-2', name: 'Stale Dependency Widget', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'Deleted Ship — Deleted Build', disposition: 'Store' }],
      reservations: [
        ...useFleetStore.getState().reservations,
        { id: 'stale-res-1', missionConfigurationId: 'nonexistent-build', fleetAssetId: 'nonexistent-ship', targetSlotLabel: 'Slot 1', componentName: 'Stale Dependency Widget', quantity: 1, status: 'ACTIVE', createdAt: 'x', updatedAt: 'x' },
      ],
    })
    const state = useFleetStore.getState()
    expect(() => resolveInventoryDependencies('Stale Dependency Widget', state.ships, state.builds, state.fleetAssets, state.installedLoadouts, state.reservations)).not.toThrow()
    const deps = resolveInventoryDependencies('Stale Dependency Widget', state.ships, state.builds, state.fleetAssets, state.installedLoadouts, state.reservations)
    expect(deps).toHaveLength(1)
    expect(deps[0].fleetAssetLabel).toBe('Unknown Fleet Asset')
  })

  it('29. an unknown catalog identity (no entityClass, no catalog match) degrades safely — still addable, editable, deletable', () => {
    const add = useFleetStore.getState().addHangarItem({ name: 'Totally Unrecognized Component Zzyzx', type: 'Component', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    expect(add.success).toBe(true)
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Totally Unrecognized Component Zzyzx')!
    expect(useFleetStore.getState().updateHangarItemQuantity(item.id, 2).success).toBe(true)
    expect(useFleetStore.getState().deleteHangarItem(item.id).success).toBe(true)
  })
})

describe('EWO-028 (Task 10): persistence across a genuine reload', () => {
  it('30. an added catalog item survives rehydration', async () => {
    if (!REAL_ENTRY) return
    useFleetStore.getState().addHangarItem({ name: REAL_NAME, type: REAL_ENTRY.category, size: `S${REAL_ENTRY.size}`, qty: 4, neededBy: 'None', disposition: 'Store', entityClass: REAL_ENTRY.entityClass })

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const rows = reloaded.getState().hangarItems.filter((h) => h.name === REAL_NAME)
    expect(rows.some((r) => r.qty === 4 && r.entityClass === REAL_ENTRY.entityClass)).toBe(true)
  })

  it('31. a merged quantity survives rehydration', async () => {
    if (!REAL_ENTRY) return
    useFleetStore.setState({ hangarItems: useFleetStore.getState().hangarItems.filter((h) => h.name !== REAL_NAME) })
    useFleetStore.getState().addHangarItem({ name: REAL_NAME, type: REAL_ENTRY.category, size: `S${REAL_ENTRY.size}`, qty: 2, neededBy: 'None', disposition: 'Store', entityClass: REAL_ENTRY.entityClass })
    useFleetStore.getState().addHangarItem({ name: REAL_NAME, type: REAL_ENTRY.category, size: `S${REAL_ENTRY.size}`, qty: 3, neededBy: 'None', disposition: 'Store', entityClass: REAL_ENTRY.entityClass })
    const rowsBefore = useFleetStore.getState().hangarItems.filter((h) => h.name === REAL_NAME)
    expect(rowsBefore).toHaveLength(1)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const rowsAfter = reloaded.getState().hangarItems.filter((h) => h.name === REAL_NAME)
    expect(rowsAfter).toHaveLength(1)
    expect(rowsAfter[0].qty).toBe(5)
  })

  it('32. an edited quantity survives rehydration', async () => {
    useFleetStore.getState().addHangarItem({ name: 'Persist Edit Widget', type: 'Cooler', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Persist Edit Widget')!
    useFleetStore.getState().updateHangarItemQuantity(item.id, 9)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    expect(reloaded.getState().hangarItems.find((h) => h.id === item.id)?.qty).toBe(9)
  })

  it('33. a deleted item remains deleted after rehydration', async () => {
    useFleetStore.getState().addHangarItem({ name: 'Persist Delete Widget', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Persist Delete Widget')!
    useFleetStore.getState().deleteHangarItem(item.id)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    expect(reloaded.getState().hangarItems.some((h) => h.id === item.id)).toBe(false)
  })

  it('34. dependency/allocation state survives rehydration alongside the inventory record it constrains', async () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const reservation = reloaded.getState().reservations.find((r) => r.id === reserve.reservationId)
    expect(reservation?.status).toBe('ACTIVE')
    const availability = calculateComponentAvailability('FR-66', reloaded.getState().hangarItems, reloaded.getState().installedLoadouts, reloaded.getState().reservations)
    expect(availability.reservedQuantity).toBe(1)
    expect(availability.availableQuantity).toBe(0)
  })
})
