import { describe, it, expect } from 'vitest'
import { computeHardpointStatus, computeHardpointStatusWithValidation } from '../../../utils/hardpointStatus'
import { calculateComponentAvailability } from '../../logistics/availability'
import { resolveComponentIdentity } from '../componentIdentityService'
import { useFleetStore } from '../../../store/useFleetStore'
import type { HangarItem, MissionReservation, InstalledLoadoutEntry } from '../../../types'

/**
 * EWO-STAB-003D (ADR-010) — the ten required regression scenarios for the
 * status/availability consolidation.
 *
 * "Veil" is reused as the one real, entityClass-bearing catalog fixture
 * (see canonicalIdentity.test.ts's own doc comment — confirmed present in
 * the real generated catalog, no hand-authored override entry). As that
 * file already found, the current catalog snapshot has no naturally
 * occurring two-different-entityClass-same-display-name collision, so the
 * "differing entityClass, same name" scenarios construct that case
 * directly with fabricated entityClass strings against a shared 'Veil'
 * display name — never a fabricated catalog override, just two identity
 * values passed directly to these pure functions.
 */

const VEIL_ENTITY_CLASS = 'SHLD_ASAS_S01_Veil_SCItem'

function hangarItem(overrides: Partial<HangarItem> = {}): HangarItem {
  return { id: 'item-1', name: 'Veil', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store', ...overrides }
}

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

describe('EWO-STAB-003D: computeHardpointStatus — identity-aware comparison', () => {
  it('1. entityClass-equal despite differing display-name formatting reads OK', () => {
    const status = computeHardpointStatus('veil', 'VEIL (Shield)', 'Something Else Entirely', {
      installedEntityClass: VEIL_ENTITY_CLASS,
      targetEntityClass: VEIL_ENTITY_CLASS,
      factoryEntityClass: 'PWR_SOME_OTHER_SCItem',
    })
    expect(status).toBe('OK')
  })

  it('2. differing entityClass never reads OK despite an identical display name on both sides', () => {
    const status = computeHardpointStatus('Veil', 'Veil', 'Factory Part', {
      installedEntityClass: 'SHLD_VEIL_VARIANT_A_SCItem',
      targetEntityClass: 'SHLD_VEIL_VARIANT_B_SCItem',
      factoryEntityClass: 'PWR_UNRELATED_SCItem',
    })
    expect(status).not.toBe('OK')
    expect(status).toBe('Upgrade Available')
  })

  it('3. a legacy name-only hardpoint (no identity argument at all) is completely unaffected', () => {
    expect(computeHardpointStatus('Veil', 'Veil', 'Veil')).toBe('OK')
    expect(computeHardpointStatus('Veil', 'Snowblind', 'Veil')).toBe('Missing')
    expect(computeHardpointStatus('Upgrade', 'Snowblind', 'Veil')).toBe('Upgrade Available')
  })
})

describe('EWO-STAB-003D: calculateComponentAvailability — identity-aware matching', () => {
  it('4. availability keeps two same-name, different-entityClass hangar records separate', () => {
    const items = [
      hangarItem({ id: 'a', qty: 3, entityClass: 'SHLD_VEIL_VARIANT_A_SCItem' }),
      hangarItem({ id: 'b', qty: 5, entityClass: 'SHLD_VEIL_VARIANT_B_SCItem' }),
    ]
    const availability = calculateComponentAvailability('Veil', items, [], [], 'SHLD_VEIL_VARIANT_A_SCItem')
    expect(availability.ownedQuantity).toBe(3)
    expect(availability.availableQuantity).toBe(3)
  })

  it('5. a reservation consumes availability only when its own componentEntityClass matches the requested one', () => {
    const items = [hangarItem({ id: 'a', qty: 5, entityClass: 'SHLD_VEIL_VARIANT_A_SCItem' })]
    const reservations = [
      reservation({ id: 'res-a', componentEntityClass: 'SHLD_VEIL_VARIANT_A_SCItem', quantity: 2 }),
      reservation({ id: 'res-b', componentEntityClass: 'SHLD_VEIL_VARIANT_B_SCItem', quantity: 4 }),
    ]
    const availability = calculateComponentAvailability('Veil', items, [], reservations, 'SHLD_VEIL_VARIANT_A_SCItem')
    expect(availability.reservedQuantity).toBe(2)
    expect(availability.availableQuantity).toBe(3)
  })

  it('6. a legacy name-only reservation (no componentEntityClass on either side) still matches by name', () => {
    const items = [hangarItem({ id: 'a', qty: 5 })]
    const reservations = [reservation({ quantity: 2 })]
    const availability = calculateComponentAvailability('Veil', items, [], reservations)
    expect(availability.reservedQuantity).toBe(2)
    expect(availability.availableQuantity).toBe(3)
  })

  it('7. owned/installed/reserved/available math never double-counts across a mixed identity/no-identity data set', () => {
    // Item 'b' and the corsair installed row are legacy (no entityClass of
    // their own), so — per the documented fallback — they still count
    // toward 'Veil' by name even while componentEntityClass is supplied,
    // exactly like every pre-EWO-STAB-003D record continues to. Item 'a'
    // and the ghost installed row match by entityClass. Nothing here is
    // ever counted in more than one of owned/installed/reserved/available.
    const items = [
      hangarItem({ id: 'a', qty: 4, entityClass: 'SHLD_VEIL_VARIANT_A_SCItem' }),
      hangarItem({ id: 'b', qty: 2 }), // legacy, no entityClass
    ]
    const installedLoadouts: InstalledLoadoutEntry[] = [
      { shipId: 'ghost', slotLabel: 'Shield 1', installedItem: 'Veil', entityClass: 'SHLD_VEIL_VARIANT_A_SCItem' },
      { shipId: 'corsair', slotLabel: 'Shield 1', installedItem: 'Veil' }, // legacy
    ]
    const reservations = [reservation({ id: 'res-a', componentEntityClass: 'SHLD_VEIL_VARIANT_A_SCItem', quantity: 1 })]
    const availability = calculateComponentAvailability('Veil', items, installedLoadouts, reservations, 'SHLD_VEIL_VARIANT_A_SCItem')
    expect(availability.ownedQuantity).toBe(availability.availableQuantity + availability.reservedQuantity + availability.installedQuantity)
    expect(availability.installedQuantity).toBe(2)
    expect(availability.reservedQuantity).toBe(1)
    expect(availability.availableQuantity).toBe(5)
  })
})

describe('EWO-STAB-003D: mission target identity propagation (saveMissionConfiguration)', () => {
  it('8. a resolvable typed target persists its canonical targetEntityClass', () => {
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'EWO-STAB-003D Target Test',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': 'Veil' },
      setActive: false,
    })
    expect(save.success).toBe(true)
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === save.buildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetItem).toBe('Veil')
    expect(hp.targetEntityClass).toBe(VEIL_ENTITY_CLASS)
  })

  it('9. an unresolvable typed target is preserved by name with no fabricated entityClass', () => {
    const madeUpName = 'Totally Uncataloged Component XYZ-999'
    expect(resolveComponentIdentity({ displayName: madeUpName })?.entityClass ?? null).toBeNull()
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'EWO-STAB-003D Unresolvable Target Test',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': madeUpName },
      setActive: false,
    })
    expect(save.success).toBe(true)
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === save.buildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetItem).toBe(madeUpName)
    expect(hp.targetEntityClass).toBeUndefined()
  })

  it('10. a validation failure before any identity resolution performs no mutation', () => {
    const buildCountBefore = useFleetStore.getState().builds.length
    const hardpointCountBefore = useFleetStore.getState().hardpoints.length
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ship-that-does-not-exist',
      name: 'Should Never Be Created',
      startingState: 'EMPTY',
      targetOverrides: { 'Shield 1': 'Veil' },
      setActive: false,
    })
    expect(save.success).toBe(false)
    expect(useFleetStore.getState().builds.length).toBe(buildCountBefore)
    expect(useFleetStore.getState().hardpoints.length).toBe(hardpointCountBefore)
  })
})

describe('EWO-STAB-003D: computeHardpointStatusWithValidation threads identity through unchanged', () => {
  it('an Invalid Target is still detected before identity is ever consulted', () => {
    const result = computeHardpointStatusWithValidation('—', 'Veil', 'Veil', 'Quantum Drive', 'S2', {
      targetEntityClass: VEIL_ENTITY_CLASS,
      factoryEntityClass: VEIL_ENTITY_CLASS,
    })
    expect(result.status).toBe('Invalid Target')
  })
})
