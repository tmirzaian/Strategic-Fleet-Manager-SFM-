import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => {
  localStorage.clear()
})

/**
 * EWO-084 — integration-level regression coverage for R-004 ("Persisted
 * Component Reference Drift"), exercised through a genuine reload of the
 * real store (the same `vi.resetModules()` + re-import pattern already
 * established by src/store/__tests__/persistenceIncident.test.ts and
 * src/store/__tests__/fleetAssetCustomImage.test.ts), not just the
 * reconciliation module in isolation (see the adjacent
 * persistedComponentIdentityReconciliation.test.ts for those unit tests).
 *
 * "FR-66" is the real fixture used throughout: it resolves unambiguously
 * to `SHLD_GODI_S01_FR66_SCItem` in the real generated catalog AND also
 * exists in the hand-authored CATALOG override table with no entityClass
 * — the exact shape that already caused one real Commander-visible
 * defect (the historical "Snowblind"/"SnowBlind" casing mismatch this
 * Risk Register item is named for). Every test needing the real
 * generated catalog guards on it being present and skips — never fails —
 * when absent (gitignored per ADR-005).
 */

const FR66_ENTITY_CLASS = 'SHLD_GODI_S01_FR66_SCItem'

async function hasRealCatalog(): Promise<boolean> {
  const { resolveComponentByEntityClass } = await import('../../generated/componentCatalog')
  return resolveComponentByEntityClass(FR66_ENTITY_CLASS).status === 'resolved'
}

describe('EWO-084 (R-004): a legacy persisted fixture is corrected on genuine reload', () => {
  it('10. a hand-typed Hangar Inventory record with no entityClass gains one after a genuine reload, with every Commander-owned field untouched', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    if (!(await hasRealCatalog())) return

    const addResult = useFleetStore
      .getState()
      .addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 4, neededBy: 'None', disposition: 'Stockpile' })
    expect(addResult.success).toBe(true)
    const beforeReload = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')
    expect(beforeReload?.entityClass).toBeUndefined() // sanity check: genuinely legacy-shaped going in

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const afterReload = reloaded.getState().hangarItems.find((h) => h.name === 'FR-66')
    expect(afterReload?.entityClass).toBe(FR66_ENTITY_CLASS)
    // Commander-owned fields: completely unaffected.
    expect(afterReload?.qty).toBe(4)
    expect(afterReload?.disposition).toBe('Stockpile')
    expect(afterReload?.name).toBe('FR-66')
  })

  it('a legacy Reservation record with no componentEntityClass gains one after a genuine reload, with quantity/status untouched', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    if (!(await hasRealCatalog())) return

    // Simulates a reservation persisted before EWO-STAB-003C ever added
    // componentEntityClass — a real Build/ship pair with a hand-crafted
    // reservation row lacking it, injected directly the same way
    // src/store/__tests__/fleetAssetCustomImage.test.ts simulates a
    // pre-existing-field-shaped legacy record. 'ghost-escort' / 'ghost' /
    // 'Left Shield Generator' / 'FR-66' is the established real, proven
    // reservation-eligible combo already used by this codebase's own
    // SW-015C-era tests (see docs/Beta-2.1-Stabilization-Resolver-Audit.md's
    // own note on this exact fixture).
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    const reserveResult = useFleetStore.getState().reserveComponent({
      missionConfigurationId: 'ghost-escort',
      fleetAssetId: 'ghost',
      targetSlotLabel: 'Left Shield Generator',
      componentName: 'FR-66',
      quantity: 1,
    })
    expect(reserveResult.success).toBe(true)
    const raw = JSON.parse(localStorage.getItem('sfm-fleet-store')!)
    const reservation = raw.state.reservations.find((r: { componentName: string }) => r.componentName === 'FR-66')
    expect(reservation).toBeDefined()
    delete reservation.componentEntityClass
    localStorage.setItem('sfm-fleet-store', JSON.stringify(raw))

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const reloadedReservation = reloaded.getState().reservations.find((r) => r.componentName === 'FR-66')
    expect(reloadedReservation?.componentEntityClass).toBe(FR66_ENTITY_CLASS)
    expect(reloadedReservation?.quantity).toBe(1)
    expect(reloadedReservation?.status).toBe('ACTIVE')
  })
})

describe('EWO-084 (R-004): the fresh seed baseline is never reconciled — regression guard', () => {
  it('two same-session additions of the same real catalog name still merge into one Hangar row on a totally fresh load (no persisted state at all)', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    if (!(await hasRealCatalog())) return
    expect(useFleetStore.getState().hasPersistedState).toBe(false)

    const first = useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    const second = useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    // If seed-baseline reconciliation ever regresses back in, this drops
    // to false: the first add would silently diverge from a
    // freshly-entityClassed seed row it should never have interacted
    // with in the first place — see
    // persistedComponentIdentityReconciliation.ts's own doc comment on
    // `reconcileArray` for the full mechanism.
    expect(second.merged).toBe(true)
    const matching = useFleetStore.getState().hangarItems.filter((h) => h.name === 'FR-66' && h.qty === 10)
    expect(matching.length).toBe(1)
  })
})

describe('EWO-084 (R-004): idempotent across repeated reloads', () => {
  it('reconciled entityClass values are identical after a first and a second genuine reload — no drift, no oscillation', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    if (!(await hasRealCatalog())) return
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })

    vi.resetModules()
    const { useFleetStore: reload1 } = await import('../useFleetStore')
    const afterFirstReload = reload1.getState().hangarItems.find((h) => h.name === 'FR-66')?.entityClass

    vi.resetModules()
    const { useFleetStore: reload2 } = await import('../useFleetStore')
    const afterSecondReload = reload2.getState().hangarItems.find((h) => h.name === 'FR-66')?.entityClass

    expect(afterFirstReload).toBe(FR66_ENTITY_CLASS)
    expect(afterSecondReload).toBe(FR66_ENTITY_CLASS)
  })
})

describe('EWO-084 (R-004): hydration remains valid when the catalog cannot resolve a reference', () => {
  it('a genuinely uncataloged persisted component name survives a reload with no entityClass, no crash, no data loss', async () => {
    localStorage.setItem(
      'sfm-fleet-store',
      JSON.stringify({
        state: {
          fleetAssets: [],
          hangarItems: [{ id: 'legacy-1', name: 'Not A Real Component XYZ', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' }],
          reservations: [],
          installedLoadouts: [],
        },
        version: 10,
      })
    )
    const { useFleetStore } = await import('../useFleetStore')
    const state = useFleetStore.getState()
    expect(state.hasPersistedState).toBe(true)
    const item = state.hangarItems.find((h) => h.name === 'Not A Real Component XYZ')
    expect(item).toBeDefined()
    expect(item?.entityClass).toBeUndefined()
    expect(item?.qty).toBe(2)
  })
})
