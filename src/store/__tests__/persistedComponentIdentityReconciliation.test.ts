import { describe, it, expect } from 'vitest'
import {
  reconcileHardpointComponentIdentity,
  reconcileInstalledLoadoutEntryIdentity,
  reconcileHangarItemIdentity,
  reconcileReservationIdentity,
  reconcileArray,
} from '../persistedComponentIdentityReconciliation'
import { resolveComponentByEntityClass } from '../../generated/componentCatalog'
import type { Hardpoint, InstalledLoadoutEntry, HangarItem, MissionReservation } from '../../types'

/**
 * EWO-084 — focused unit tests for the R-004 reconciliation layer itself
 * (src/store/persistedComponentIdentityReconciliation.ts), independent of
 * the full useFleetStore hydration pipeline. See
 * src/store/__tests__/r004PersistenceReconciliation.test.ts for the
 * integration-level "genuine reload of a legacy persisted fixture" tests
 * (required test #10) and the seed-baseline exclusion regression guard.
 *
 * Reuses the same real, licensed-catalog fixtures already established by
 * src/data/__tests__/pdcCompatibility.test.ts and
 * src/data/__tests__/componentResolutionOptions.test.ts: "FR-66" (real
 * entityClass `SHLD_GODI_S01_FR66_SCItem`, also present — with no
 * entityClass — in the hand-authored CATALOG override table, which is
 * exactly why this fixture matters here), "Omnisky III Cannon" (a real,
 * single-entityClass name), and M2C "Swarm" (a real, genuinely ambiguous
 * name — three distinct, incompatible-shape entity classes). Every test
 * needing the real generated catalog guards on it being present and
 * skips — never fails — when absent (gitignored per ADR-005), matching
 * this test suite's existing convention throughout.
 */

const FR66_ENTITY_CLASS = 'SHLD_GODI_S01_FR66_SCItem'
const SINGLE_MATCH_NAME = 'Omnisky III Cannon'
const SINGLE_MATCH_ENTITY_CLASS = 'AMRS_LaserCannon_S1'
const SWARM_NAME = 'M2C "Swarm"'

const hasCatalog = resolveComponentByEntityClass(FR66_ENTITY_CLASS).status === 'resolved'
function skipIfNoCatalog() {
  return !hasCatalog
}

function makeHardpoint(overrides: Partial<Hardpoint> = {}): Hardpoint {
  return {
    id: 'hp-1',
    shipId: 'ship-1',
    buildId: 'build-1',
    slotLabel: 'Left Shield Generator',
    type: 'Shield',
    size: 'S1',
    factoryItem: '—',
    installedItem: '—',
    targetItem: '—',
    status: 'OK',
    ...overrides,
  }
}

function makeInstalledLoadoutEntry(overrides: Partial<InstalledLoadoutEntry> = {}): InstalledLoadoutEntry {
  return { shipId: 'ship-1', slotLabel: 'Left Shield Generator', installedItem: '—', ...overrides }
}

function makeHangarItem(overrides: Partial<HangarItem> = {}): HangarItem {
  return { id: 'item-1', name: 'Something', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store', ...overrides }
}

function makeReservation(overrides: Partial<MissionReservation> = {}): MissionReservation {
  return {
    id: 'res-1',
    missionConfigurationId: 'build-1',
    fleetAssetId: 'ship-1',
    targetSlotLabel: 'Left Shield Generator',
    componentName: 'Something',
    quantity: 1,
    status: 'ACTIVE',
    createdAt: 'now',
    updatedAt: 'now',
    ...overrides,
  }
}

describe('EWO-084 (R-004): reconciliation preserves already-valid canonical references', () => {
  it('1. a Hardpoint whose entityClass fields are already populated and correct is returned unchanged (same object reference)', () => {
    const hp = makeHardpoint({ installedItem: SINGLE_MATCH_NAME, installedEntityClass: SINGLE_MATCH_ENTITY_CLASS })
    expect(reconcileHardpointComponentIdentity(hp)).toBe(hp)
  })

  it('1b. an already-populated entityClass is never re-derived or second-guessed, even if it looks unrelated to the name', () => {
    // Deliberately mismatched — reconciliation must never "correct" an
    // existing signal, only ever populate an absent one (Requirement 6/7).
    const hp = makeHardpoint({ installedItem: SINGLE_MATCH_NAME, installedEntityClass: 'SOME_OTHER_ENTITY_CLASS' })
    const result = reconcileHardpointComponentIdentity(hp)
    expect(result).toBe(hp)
    expect(result.installedEntityClass).toBe('SOME_OTHER_ENTITY_CLASS')
  })
})

describe('EWO-084 (R-004): whitespace and case-only drift reconcile correctly', () => {
  it('2. leading/trailing whitespace in the persisted name still resolves a confident entityClass', () => {
    if (skipIfNoCatalog()) return
    const hp = makeHardpoint({ installedItem: `  ${SINGLE_MATCH_NAME}  ` })
    const result = reconcileHardpointComponentIdentity(hp)
    expect(result.installedEntityClass).toBe(SINGLE_MATCH_ENTITY_CLASS)
    // The Commander-facing name string itself is never touched.
    expect(result.installedItem).toBe(`  ${SINGLE_MATCH_NAME}  `)
  })

  it('3. case-only drift reconciles when the name is uniquely resolvable that way', () => {
    if (skipIfNoCatalog()) return
    const hp = makeHardpoint({ installedItem: SINGLE_MATCH_NAME.toUpperCase() })
    const result = reconcileHardpointComponentIdentity(hp)
    expect(result.installedEntityClass).toBe(SINGLE_MATCH_ENTITY_CLASS)
    expect(result.installedItem).toBe(SINGLE_MATCH_NAME.toUpperCase())
  })
})

describe('EWO-084 (R-004): ambiguous and unresolved references are preserved, never guessed', () => {
  it('4. a genuinely ambiguous name is never resolved — entityClass stays absent', () => {
    if (skipIfNoCatalog()) return
    const hp = makeHardpoint({ installedItem: SWARM_NAME })
    const result = reconcileHardpointComponentIdentity(hp)
    expect(result.installedEntityClass).toBeUndefined()
  })

  it('4b. a case-mismatched ambiguous name is also never resolved, even with the case-insensitive fallback enabled internally', () => {
    if (skipIfNoCatalog()) return
    const hp = makeHardpoint({ installedItem: SWARM_NAME.toUpperCase() })
    const result = reconcileHardpointComponentIdentity(hp)
    expect(result.installedEntityClass).toBeUndefined()
  })

  it('5. an unknown/uncataloged component name is preserved exactly as-is — no entityClass fabricated, name untouched, record not converted to empty', () => {
    const hp = makeHardpoint({ installedItem: 'Not A Real Component Name XYZ' })
    const result = reconcileHardpointComponentIdentity(hp)
    expect(result).toBe(hp)
    expect(result.installedItem).toBe('Not A Real Component Name XYZ')
    expect(result.installedEntityClass).toBeUndefined()
  })

  it('12. a "no item" sentinel slot is left completely alone — never treated as an unresolved reference to fix', () => {
    const hp = makeHardpoint({ installedItem: '—', installedEntityClass: undefined })
    expect(reconcileHardpointComponentIdentity(hp)).toBe(hp)
  })
})

describe('EWO-084 (R-004): stale (absent) derived metadata is refreshed from the canonical record', () => {
  it('6. an absent entityClass is populated once a canonical record is confidently resolved (the core R-004 fix)', () => {
    if (skipIfNoCatalog()) return
    // FR-66 also exists in the hand-authored CATALOG override table with
    // NO entityClass — this specifically proves reconciliation is not
    // shadowed by that table (skipCatalogOverride), matching real
    // regression coverage, not just a synthetic name.
    const hp = makeHardpoint({ installedItem: 'FR-66' })
    const result = reconcileHardpointComponentIdentity(hp)
    expect(result.installedEntityClass).toBe(FR66_ENTITY_CLASS)
  })
})

describe('EWO-084 (R-004): Commander-owned fields are never touched', () => {
  it('7. quantity, disposition, and every non-identity field on a HangarItem survive reconciliation completely unchanged', () => {
    if (skipIfNoCatalog()) return
    const item = makeHangarItem({ name: 'FR-66', qty: 7, disposition: 'Stockpile', neededBy: 'Vulture Salvage Build', location: 'Home Base' })
    const result = reconcileHangarItemIdentity(item)
    expect(result.qty).toBe(7)
    expect(result.disposition).toBe('Stockpile')
    expect(result.neededBy).toBe('Vulture Salvage Build')
    expect(result.location).toBe('Home Base')
    expect(result.name).toBe('FR-66')
    expect(result.entityClass).toBe(FR66_ENTITY_CLASS)
  })

  it('7b. a Hardpoint\'s targetItem (a Commander target assignment) is never rewritten, even when its entityClass gets populated', () => {
    if (skipIfNoCatalog()) return
    const hp = makeHardpoint({ targetItem: '  FR-66  ' })
    const result = reconcileHardpointComponentIdentity(hp)
    expect(result.targetItem).toBe('  FR-66  ')
    expect(result.targetEntityClass).toBe(FR66_ENTITY_CLASS)
  })

  it('7c. a Reservation\'s quantity/status/componentName are never rewritten, even when its componentEntityClass gets populated', () => {
    if (skipIfNoCatalog()) return
    const reservation = makeReservation({ componentName: 'FR-66', quantity: 3, status: 'ACTIVE' })
    const result = reconcileReservationIdentity(reservation)
    expect(result.componentName).toBe('FR-66')
    expect(result.quantity).toBe(3)
    expect(result.status).toBe('ACTIVE')
    expect(result.componentEntityClass).toBe(FR66_ENTITY_CLASS)
  })
})

describe('EWO-084 (R-004): idempotency', () => {
  it('8. reconciling the same record twice produces the exact same result the second time — and the second pass is a true no-op (same reference)', () => {
    if (skipIfNoCatalog()) return
    const hp = makeHardpoint({ installedItem: 'FR-66' })
    const once = reconcileHardpointComponentIdentity(hp)
    const twice = reconcileHardpointComponentIdentity(once)
    expect(twice).toBe(once)
    expect(twice.installedEntityClass).toBe(FR66_ENTITY_CLASS)
  })

  it('8b. reconciling an already-clean array twice returns the exact same array reference both times', () => {
    if (skipIfNoCatalog()) return
    const items = [makeHangarItem({ id: 'a', name: 'FR-66', entityClass: FR66_ENTITY_CLASS }), makeHangarItem({ id: 'b', name: 'Unrelated' })]
    const once = reconcileArray(items, reconcileHangarItemIdentity)
    const twice = reconcileArray(once, reconcileHangarItemIdentity)
    expect(once).toBe(items)
    expect(twice).toBe(once)
  })
})

describe('EWO-084 (R-004): multiple persisted record types are covered', () => {
  it('9. InstalledLoadoutEntry reconciles the same way as Hardpoint', () => {
    if (skipIfNoCatalog()) return
    const entry = makeInstalledLoadoutEntry({ installedItem: 'FR-66' })
    expect(reconcileInstalledLoadoutEntryIdentity(entry).entityClass).toBe(FR66_ENTITY_CLASS)
  })

  it('9b. HangarItem reconciles the same way as Hardpoint', () => {
    if (skipIfNoCatalog()) return
    const item = makeHangarItem({ name: 'FR-66' })
    expect(reconcileHangarItemIdentity(item).entityClass).toBe(FR66_ENTITY_CLASS)
  })

  it('9c. MissionReservation reconciles the same way as Hardpoint', () => {
    if (skipIfNoCatalog()) return
    const reservation = makeReservation({ componentName: 'FR-66' })
    expect(reconcileReservationIdentity(reservation).componentEntityClass).toBe(FR66_ENTITY_CLASS)
  })
})

describe('EWO-084 (R-004): no unrelated record is modified', () => {
  it('11. reconciling an array only changes the records that actually needed it — array-level and element-level referential stability for the rest', () => {
    if (skipIfNoCatalog()) return
    const untouched1 = makeHangarItem({ id: 'untouched-1', name: 'Already Correct', entityClass: 'SOME_REAL_CLASS' })
    const untouched2 = makeHangarItem({ id: 'untouched-2', name: 'Genuinely Unknown XYZ' })
    const needsReconciliation = makeHangarItem({ id: 'needs-it', name: 'FR-66' })
    const items = [untouched1, needsReconciliation, untouched2]
    const result = reconcileArray(items, reconcileHangarItemIdentity)
    expect(result).not.toBe(items) // array changed — one element genuinely reconciled
    expect(result[0]).toBe(untouched1) // unaffected element: same reference
    expect(result[2]).toBe(untouched2) // unaffected element: same reference
    expect(result[1]).not.toBe(needsReconciliation)
    expect(result[1].entityClass).toBe(FR66_ENTITY_CLASS)
  })

  it('11b. an array where nothing needs reconciling returns the exact same array reference — no rebuild at all', () => {
    const items = [makeHangarItem({ id: 'a', name: 'Already Correct', entityClass: 'SOME_REAL_CLASS' }), makeHangarItem({ id: 'b', name: 'Genuinely Unknown XYZ' })]
    expect(reconcileArray(items, reconcileHangarItemIdentity)).toBe(items)
  })
})
