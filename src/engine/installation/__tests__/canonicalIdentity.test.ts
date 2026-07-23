import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFleetStore } from '../../../store/useFleetStore'
import { materializeFleetAsset } from '../../../utils/fleetAssetMaterializer'
import { identitiesMatch, resolveComponentIdentity } from '../componentIdentityService'
import { executeInstallation } from '../installationEngine'

/**
 * EWO-STAB-003C (ADR-010) — the ten required regression scenarios.
 *
 * "Veil" is used throughout as the real fixture wherever a genuinely
 * resolvable, entityClass-bearing component is needed: it exists in the
 * real generated catalog (`SHLD_ASAS_S01_Veil_SCItem`, category Shield,
 * size 1 — confirmed by direct lookup against
 * generated-data/component-metadata-catalog.runtime.json) and, unlike
 * Slipstream/Snowblind/Mirage, carries no hand-authored override table
 * entry in src/data/componentCatalog.ts, so it resolves its entityClass
 * straight from the real catalog. No naturally-occurring duplicate
 * "Veil" entityClass exists in the current catalog snapshot — consistent
 * with ADR-010's finding that there is no proven Veil-specific metadata
 * defect — so the two-different-entityClass-same-name collision tests
 * (5/6/7) construct that scenario directly against `identitiesMatch`,
 * the actual shared comparison rule, rather than presupposing a
 * collision the data doesn't currently contain.
 *
 * Every seed ship's factory Shield slot is already fully satisfied
 * (status 'OK') by construction — installComponent correctly refuses to
 * "install into" an already-satisfied slot (EWO-STAB-002). Tests that
 * install Veil therefore remove the factory-installed item first, the
 * same real workflow a Commander swapping equipment would perform.
 */

const VEIL_ENTITY_CLASS = 'SHLD_ASAS_S01_Veil_SCItem'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('EWO-STAB-003C: required regression coverage', () => {
  it('1. a legacy save containing only component names (no entityClass anywhere) still loads and functions', async () => {
    localStorage.setItem(
      'sfm-fleet-store',
      JSON.stringify({
        state: {
          fleetAssets: [],
          hangarItems: [{ id: 'legacy-1', name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }],
          reservations: [],
          installedLoadouts: [],
        },
        version: 8,
      })
    )
    const { useFleetStore: reloaded } = await import('../../../store/useFleetStore')
    const state = reloaded.getState()
    expect(state.hasPersistedState).toBe(true)
    expect(state.hangarItems.some((h) => h.name === 'FR-66' && h.entityClass === undefined)).toBe(true)
    // Still fully functional: a legacy, entityClass-less component can
    // still be installed via the same engine (first vacating Shield 1,
    // which starts factory-satisfied).
    reloaded.getState().removeComponent('ghost', 'Left Shield Generator')
    const result = reloaded.getState().installComponent('ghost', 'FR-66', 'Left Shield Generator')
    expect(result.matched).toBe(true)
  })

  it('2. a newly installed cataloged component persists both display name and entityClass', async () => {
    const { useFleetStore: store } = await import('../../../store/useFleetStore')
    store.getState().removeComponent('ghost', 'Left Shield Generator')
    const result = store.getState().installComponent('ghost', 'Veil', 'Left Shield Generator')
    expect(result.matched).toBe(true)
    const ship = store.getState().ships.find((s) => s.id === 'ghost')!
    const hp = store.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.installedItem).toBe('Veil')
    expect(hp.installedEntityClass).toBe(VEIL_ENTITY_CLASS)
  })

  it('3. a newly created target (ship materialization) persists canonical identity when resolvable', () => {
    const { hardpoints } = materializeFleetAsset({
      definition: {
        id: 'test-ship',
        internalName: 'test-ship',
        displayName: 'Test Ship',
        manufacturer: 'Test',
        classification: { rsiRoles: [], focusTags: [] },
        career: 'Combat',
        role: 'Test',
        equipmentGroups: [],
        portIds: [],
        factoryLoadoutId: 'test-factory',
        sourceMetadata: { sourceType: 'seed' },
      } as never,
      template: [{ slotLabel: 'Shield 1', type: 'Shield', size: 'S1', factoryItem: 'Veil' }],
    })
    const hp = hardpoints.find((h) => h.slotLabel === 'Shield 1')!
    expect(hp.targetItem).toBe('Veil')
    expect(hp.targetEntityClass).toBe(VEIL_ENTITY_CLASS)
    expect(hp.factoryEntityClass).toBe(VEIL_ENTITY_CLASS)
    expect(hp.installedEntityClass).toBe(VEIL_ENTITY_CLASS)
  })

  it('4. a reservation persists componentEntityClass when resolvable', async () => {
    const { useFleetStore: store } = await import('../../../store/useFleetStore')
    store.getState().addHangarItem({ name: 'Veil', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const save = store.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Veil Test Loadout',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': 'Veil' },
      setActive: true,
    })
    expect(save.success).toBe(true)
    const reserve = store.getState().reserveComponent({ missionConfigurationId: save.buildId!, fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'Veil' })
    expect(reserve.success).toBe(true)
    const reservation = store.getState().reservations.find((r) => r.id === reserve.reservationId)!
    expect(reservation.componentEntityClass).toBe(VEIL_ENTITY_CLASS)
  })

  it('5. two components sharing a display name but having different entityClass values remain distinct', () => {
    const a = { displayName: 'Veil', entityClass: 'SHLD_ASAS_S01_Veil_SCItem', category: 'Shield', size: 1 }
    const b = { displayName: 'Veil', entityClass: 'SHLD_SOME_OTHER_Veil_SCItem', category: 'Shield', size: 2 }
    expect(identitiesMatch(a, b)).toBe(false)
  })

  it('6. two records with the same entityClass match even if presentation names differ in case or formatting', () => {
    const a = { displayName: 'veil', entityClass: 'SHLD_ASAS_S01_Veil_SCItem', category: 'Shield', size: 1 }
    const b = { displayName: 'VEIL (Shield)', entityClass: 'SHLD_ASAS_S01_Veil_SCItem', category: 'Shield', size: 1 }
    expect(identitiesMatch(a, b)).toBe(true)
  })

  it('7. legacy name-only records continue to match through the documented display-name fallback', () => {
    const a = { displayName: 'Veil', entityClass: null, category: null, size: null }
    const b = { displayName: 'veil', entityClass: null, category: null, size: null }
    expect(identitiesMatch(a, b)).toBe(true)
    // One side lacking entityClass still falls back to the legacy
    // name comparison rather than refusing to match at all.
    const c = { displayName: 'Veil', entityClass: 'SHLD_ASAS_S01_Veil_SCItem', category: 'Shield', size: 1 }
    expect(identitiesMatch(a, c)).toBe(true)
  })

  it("8. removal and return to inventory preserve the component's own identity rather than deriving it from the destination port", async () => {
    const { useFleetStore: store } = await import('../../../store/useFleetStore')
    store.getState().removeComponent('ghost', 'Left Shield Generator')
    const install = store.getState().installComponent('ghost', 'Veil', 'Left Shield Generator')
    expect(install.matched).toBe(true)
    const remove = store.getState().removeComponent('ghost', 'Left Shield Generator', true)
    expect(remove.matched).toBe(true)
    const returned = store.getState().hangarItems.find((h) => h.name === 'Veil')
    expect(returned).toBeDefined()
    expect(returned!.entityClass).toBe(VEIL_ENTITY_CLASS)
  })

  it('9. ship-to-ship transfer preserves canonical identity', async () => {
    const { useFleetStore: store } = await import('../../../store/useFleetStore')
    store.getState().removeComponent('ghost', 'Left Shield Generator')
    const install = store.getState().installComponent('ghost', 'Veil', 'Left Shield Generator')
    expect(install.matched).toBe(true)
    // Vulture's Right Shield Generator (S1, genuinely empty from factory)
    // is the real compatible destination — Corsair's own Shield Generator
    // is S3, incompatible with an S1 Veil.
    store.getState().removeComponent('vulture', 'Right Shield Generator')
    const transfer = store.getState().moveComponentBetweenShips('ghost', 'Left Shield Generator', 'vulture', 'Right Shield Generator')
    expect(transfer.matched).toBe(true)
    const vulture = store.getState().ships.find((s) => s.id === 'vulture')!
    const hp = store.getState().hardpoints.find((h) => h.buildId === vulture.activeBuildId && h.slotLabel === 'Right Shield Generator')!
    expect(hp.installedItem).toBe('Veil')
    expect(hp.installedEntityClass).toBe(VEIL_ENTITY_CLASS)
  })

  it('10. an identity-aware ownership validation failure performs no mutation', async () => {
    const { useFleetStore: store } = await import('../../../store/useFleetStore')
    // Vacate Shield 1 first — a fresh seed slot starts factory-satisfied
    // (status 'OK'), which the engine already refuses to "install into"
    // for an unrelated reason (EWO-STAB-002); this test needs the
    // reserved-elsewhere path specifically, so it needs an open slot.
    store.getState().removeComponent('ghost', 'Shield 1')
    const state = {
      ships: store.getState().ships,
      builds: store.getState().builds,
      hardpoints: store.getState().hardpoints,
      hangarItems: [{ id: 'a', name: 'Veil', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' as const }],
      reservations: [
        {
          id: 'res-1',
          missionConfigurationId: 'some-other-build',
          fleetAssetId: 'ghost',
          targetSlotLabel: 'Shield 1',
          componentName: 'Veil',
          componentEntityClass: VEIL_ENTITY_CLASS,
          quantity: 1,
          status: 'ACTIVE' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      installedLoadouts: store.getState().installedLoadouts,
    }
    let mutated = false
    const result = executeInstallation(
      { operation: 'INSTALL', component: { displayName: 'Veil' }, destination: { shipId: 'ghost', slotLabel: 'Shield 1' } },
      state,
      {
        applyShipMutation: () => {
          mutated = true
        },
        commitHangarItems: () => {
          mutated = true
        },
        commitReservations: () => {
          mutated = true
        },
        returnToInventory: () => {
          mutated = true
        },
      }
    )
    expect(result.ok).toBe(false)
    expect(mutated).toBe(false)
  })
})

describe('EWO-STAB-003C: identity resolution reused, never reimplemented', () => {
  it('confirms resolveComponentIdentity finds Veil in the real generated catalog with its real entityClass', () => {
    const identity = resolveComponentIdentity({ displayName: 'Veil' })
    expect(identity).toEqual({ displayName: 'Veil', entityClass: VEIL_ENTITY_CLASS, category: 'Shield', size: 1 })
  })
})
