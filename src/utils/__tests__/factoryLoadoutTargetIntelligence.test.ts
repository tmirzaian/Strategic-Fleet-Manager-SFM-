import { describe, it, expect, vi } from 'vitest'
import type { Ship, Build, Hardpoint, HangarItem, MissionReservation } from '../../types'

/**
 * EWO-104 (corrected) — the resolver reads `shipDefinitions`/
 * `shipFactoryTemplates` as module-level constants (never as a caller
 * param), unlike every other authority this app composes. Real generated
 * ship data is large and its exact contents aren't a stable test fixture
 * (`docs`/ADR-005 notes it's largely regenerated, not hand-authored) — so,
 * matching this repo's own established practice of isolating logic under
 * test from unpredictable real datasets, this module is mocked with a
 * small, fully controlled fixture. `shipDefinitions.test.ts` (real,
 * unmocked data with early-return guards) is the right place to test the
 * DATA itself; this file tests the RESOLVER's logic built on top of it.
 */
vi.mock('../../data/shipDefinitions', () => ({
  shipDefinitions: [
    { id: 'ship-a', displayName: 'Ship Alpha' },
    { id: 'ship-b', displayName: 'Ship Beta' },
    { id: 'ship-c', displayName: 'Ship Gamma' },
  ],
  shipFactoryTemplates: {
    'ship-a': [
      { slotLabel: 'Shield 1', type: 'Shield', size: 'S1', factoryItem: 'Mirage', factoryEntityClass: 'MIRAGE_EC' },
      { slotLabel: 'Cooler 1', type: 'Cooler', size: 'S1', factoryItem: 'CoolerX', factoryEntityClass: 'COOLERX_EC' },
    ],
    'ship-b': [
      { slotLabel: 'Shield 1', type: 'Shield', size: 'S1', factoryItem: 'Mirage', factoryEntityClass: 'MIRAGE_EC' },
      { slotLabel: 'Shield 2', type: 'Shield', size: 'S1', factoryItem: 'Mirage', factoryEntityClass: 'MIRAGE_EC' },
    ],
    'ship-c': [],
  },
}))

const { resolveFactoryLoadoutTargetIntelligence, isCommanderManagedBuild } = await import('../factoryLoadoutTargetIntelligence')

function ship(overrides: Partial<Ship> = {}): Ship {
  return { id: 's1', name: 'Corsair', manufacturer: 'RSI', ownership: 'Owned', career: 'Combat', role: 'Role', activeBuildId: 'b1', readiness: 0, priority: 1, missing: [], lifecycleStatus: 'active', ...overrides }
}

function build(overrides: Partial<Build> = {}): Build {
  return { id: 'b1', shipId: 's1', name: 'Stealth Build', role: '', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM', ...overrides }
}

function hp(overrides: Partial<Hardpoint> & Pick<Hardpoint, 'id' | 'slotLabel' | 'status'>): Hardpoint {
  return {
    shipId: 's1',
    buildId: 'b1',
    type: 'Shield',
    size: 'S1',
    factoryItem: overrides.targetItem ?? '—',
    installedItem: overrides.installedItem ?? '—',
    targetItem: overrides.targetItem ?? '—',
    ...overrides,
  }
}

function baseParams(overrides: Partial<Parameters<typeof resolveFactoryLoadoutTargetIntelligence>[0]> = {}) {
  return {
    ships: [ship()],
    builds: [build()],
    hardpoints: [],
    hangarItems: [] as HangarItem[],
    installedLoadouts: [],
    reservations: [] as MissionReservation[],
    ...overrides,
  }
}

describe('resolveFactoryLoadoutTargetIntelligence', () => {
  it('only a Commander-managed target requirement (Missing on a real target) creates demand', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    expect(result.demandComponents).toHaveLength(1)
    expect(result.demandComponents[0].componentName).toBe('Mirage')
  })

  it('a Factory-kind build creates zero demand (its hardpoints materialize as OK, never Missing)', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'OK', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC', installedItem: 'Mirage' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ builds: [build({ kind: 'FACTORY' })], hardpoints }))
    expect(result.demandComponents).toEqual([])
  })

  it('a retired fleet asset\'s hardpoints are excluded from demand', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ ships: [ship({ lifecycleStatus: 'retired' })], hardpoints }))
    expect(result.demandComponents).toEqual([])
  })

  it('a satisfied (OK) target is excluded from demand', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    expect(result.demandComponents).toEqual([])
  })

  it('an intentional empty target ("—") is excluded from demand, even with an otherwise-Missing status', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: '—' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    expect(result.demandComponents).toEqual([])
  })

  it('canonical identity matching works by entityClass, even when the display name differs', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage Mk2 (Renamed)', targetEntityClass: 'MIRAGE_EC' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    const shipA = result.sourceShips.find((s) => s.shipDefinitionId === 'ship-a')
    expect(shipA).toBeTruthy()
    expect(shipA!.matches[0].componentName).toBe('Mirage Mk2 (Renamed)')
  })

  it('falls back to exact-name matching per the existing componentIdentityMatches policy when either side lacks an entityClass', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Cooler', type: 'Cooler', status: 'Missing', targetItem: 'CoolerX' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    const shipA = result.sourceShips.find((s) => s.shipDefinitionId === 'ship-a')
    expect(shipA).toBeTruthy()
    expect(shipA!.matches.some((m) => m.componentName === 'CoolerX')).toBe(true)
  })

  it('one source ship matching one requirement', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Cooler', type: 'Cooler', status: 'Missing', targetItem: 'CoolerX', targetEntityClass: 'COOLERX_EC' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    expect(result.sourceShips.map((s) => s.shipDefinitionId)).toEqual(['ship-a'])
    expect(result.sourceShips[0].distinctComponentCount).toBe(1)
  })

  it('one source ship matching several requirements', () => {
    const hardpoints = [
      hp({ id: 'hp-1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' }),
      hp({ id: 'hp-2', slotLabel: 'Cooler', type: 'Cooler', status: 'Missing', targetItem: 'CoolerX', targetEntityClass: 'COOLERX_EC' }),
    ]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    const shipA = result.sourceShips.find((s) => s.shipDefinitionId === 'ship-a')!
    expect(shipA.distinctComponentCount).toBe(2)
  })

  it('several source ships matching the same component', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    expect(result.sourceShips.map((s) => s.shipDefinitionId).sort()).toEqual(['ship-a', 'ship-b'])
  })

  it('repeated fleet demand across builds aggregates quantities correctly', () => {
    const hardpoints = [
      hp({ id: 'hp-1', shipId: 's1', buildId: 'b1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' }),
      hp({ id: 'hp-2', shipId: 's2', buildId: 'b2', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' }),
    ]
    const result = resolveFactoryLoadoutTargetIntelligence(
      baseParams({ ships: [ship({ id: 's1' }), ship({ id: 's2', name: 'Gladius' })], builds: [build({ id: 'b1', shipId: 's1' }), build({ id: 'b2', shipId: 's2' })], hardpoints })
    )
    expect(result.demandComponents[0].fleetQuantityNeeded).toBe(2)
    expect(result.totalFleetRequirementUnits).toBe(2)
  })

  it('multiple builds/ships are listed correctly in each match\'s affected list', () => {
    const hardpoints = [
      hp({ id: 'hp-1', shipId: 's1', buildId: 'b1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' }),
      hp({ id: 'hp-2', shipId: 's2', buildId: 'b2', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' }),
    ]
    const result = resolveFactoryLoadoutTargetIntelligence(
      baseParams({
        ships: [ship({ id: 's1', name: 'Corsair' }), ship({ id: 's2', name: 'Gladius' })],
        builds: [build({ id: 'b1', shipId: 's1', name: 'Build One' }), build({ id: 'b2', shipId: 's2', name: 'Build Two' })],
        hardpoints,
      })
    )
    const shipA = result.sourceShips.find((s) => s.shipDefinitionId === 'ship-a')!
    const affected = shipA.matches[0].affected
    expect(affected).toHaveLength(2)
    expect(affected.map((a) => `${a.shipName} — ${a.buildName} ×${a.quantity}`).sort()).toEqual(['Corsair — Build One ×1', 'Gladius — Build Two ×1'])
  })

  it('factory quantity is preserved per source ship — ship-b carries two Mirage slots, ship-a carries one', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    const shipA = result.sourceShips.find((s) => s.shipDefinitionId === 'ship-a')!
    const shipB = result.sourceShips.find((s) => s.shipDefinitionId === 'ship-b')!
    expect(shipA.matches[0].factoryQuantity).toBe(1)
    expect(shipB.matches[0].factoryQuantity).toBe(2)
  })

  it('category indicators map correctly onto the stable core categories', () => {
    const hardpoints = [
      hp({ id: 'hp-1', slotLabel: 'Shield', type: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' }),
      hp({ id: 'hp-2', slotLabel: 'Cooler', type: 'Cooler', status: 'Missing', targetItem: 'CoolerX', targetEntityClass: 'COOLERX_EC' }),
    ]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    const shipA = result.sourceShips.find((s) => s.shipDefinitionId === 'ship-a')!
    expect(shipA.categoriesPresent.sort()).toEqual(['Cooler', 'Shield'])
  })

  it('deterministic ranking: more distinct matched components ranks first, name is the stable tie-breaker', () => {
    const hardpoints = [
      hp({ id: 'hp-1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' }),
      hp({ id: 'hp-2', slotLabel: 'Cooler', type: 'Cooler', status: 'Missing', targetItem: 'CoolerX', targetEntityClass: 'COOLERX_EC' }),
    ]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    // ship-a matches both Mirage and CoolerX (2 distinct); ship-b matches only Mirage (1 distinct).
    expect(result.sourceShips.map((s) => s.shipDefinitionId)).toEqual(['ship-a', 'ship-b'])
  })

  it('retired source ownership does not affect the static source roster — a source ship neither owned nor represented in the active fleet still appears', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Cooler', type: 'Cooler', status: 'Missing', targetItem: 'CoolerX', targetEntityClass: 'COOLERX_EC' })]
    // No FleetAsset/Ship instance anywhere corresponds to 'ship-a' or 'ship-b' — the source roster is a static catalog lookup, independent of ownership.
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints }))
    expect(result.sourceShips.some((s) => s.shipDefinitionId === 'ship-a')).toBe(true)
  })

  it('fleet demand nets against owned, unreserved Hangar stock — fully-owned demand does not appear at all', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const hangarItems: HangarItem[] = [{ id: 'h1', name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints, hangarItems }))
    expect(result.demandComponents).toEqual([])
  })

  it('factoryDataAvailable is true when at least one known ship definition carries real factory-loadout data', () => {
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams())
    expect(result.factoryDataAvailable).toBe(true)
  })
})

/**
 * EWO-104 Amendment 2 — Custom Target Acquisition Boundary. Every scenario
 * below exercises the three mandatory conditions (custom-loadout origin,
 * genuine remaining acquisition need, an eligible NPC factory match)
 * together, plus the explicit isCommanderManagedBuild guard and the
 * reservation-aware remaining-quantity call path (Part C).
 */
describe('resolveFactoryLoadoutTargetIntelligence — EWO-104 Amendment 2: Custom Target Acquisition Boundary', () => {
  it('isCommanderManagedBuild: true for CUSTOM/MISSION/TEMPLATE/undefined kind, false only for FACTORY', () => {
    expect(isCommanderManagedBuild({ kind: 'CUSTOM' })).toBe(true)
    expect(isCommanderManagedBuild({ kind: 'MISSION' })).toBe(true)
    expect(isCommanderManagedBuild({ kind: 'TEMPLATE' })).toBe(true)
    expect(isCommanderManagedBuild({ kind: undefined })).toBe(true)
    expect(isCommanderManagedBuild({ kind: 'FACTORY' })).toBe(false)
  })

  it('a Factory-kind build creates zero demand even in the pathological case where its own hardpoint status somehow reads Missing — the explicit isCommanderManagedBuild guard is independent of the status check', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ builds: [build({ kind: 'FACTORY' })], hardpoints }))
    expect(result.demandComponents).toEqual([])
  })

  it('a custom target equal to the ship model\'s own factory component is included as demand when physically unsatisfied', () => {
    // Demand targets the exact same component ("Mirage"/MIRAGE_EC) ship-a
    // and ship-b themselves stock at the factory — the resolver never
    // compares against the SHIP'S OWN factory item, only its own installed
    // state, so this is ordinary eligible demand.
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ builds: [build({ kind: 'CUSTOM' })], hardpoints }))
    expect(result.demandComponents).toHaveLength(1)
  })

  it('a custom target equal to the factory component creates zero demand once physically installed (status OK)', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Shield', status: 'OK', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC', installedItem: 'Mirage' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ builds: [build({ kind: 'CUSTOM' })], hardpoints }))
    expect(result.demandComponents).toEqual([])
  })

  it('a Missing hardpoint whose own exact slot already has a valid active reservation creates zero remaining demand', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'b1', fleetAssetId: 's1', targetSlotLabel: 'Left Shield', componentName: 'Mirage', componentEntityClass: 'MIRAGE_EC', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints, reservations }))
    expect(result.demandComponents).toEqual([])
  })

  it('partially covered demand (one reserved row, one uncovered row) preserves only the genuinely remaining quantity', () => {
    const hardpoints = [
      hp({ id: 'hp-1', shipId: 's1', buildId: 'b1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' }),
      hp({ id: 'hp-2', shipId: 's2', buildId: 'b2', slotLabel: 'Right Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' }),
    ]
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'b1', fleetAssetId: 's1', targetSlotLabel: 'Left Shield', componentName: 'Mirage', componentEntityClass: 'MIRAGE_EC', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ]
    const result = resolveFactoryLoadoutTargetIntelligence(
      baseParams({ ships: [ship({ id: 's1' }), ship({ id: 's2', name: 'Gladius' })], builds: [build({ id: 'b1', shipId: 's1' }), build({ id: 'b2', shipId: 's2' })], hardpoints, reservations })
    )
    expect(result.demandComponents).toHaveLength(1)
    expect(result.demandComponents[0].fleetQuantityNeeded).toBe(1)
    expect(result.demandComponents[0].affected).toHaveLength(1)
    expect(result.demandComponents[0].affected[0].shipName).toBe('Gladius')
  })

  it('a reservation for a DIFFERENT slot/build does not suppress this hardpoint\'s own demand', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Left Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'other-build', fleetAssetId: 'other-ship', targetSlotLabel: 'Right Shield', componentName: 'Mirage', componentEntityClass: 'MIRAGE_EC', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ hardpoints, reservations }))
    expect(result.demandComponents).toHaveLength(1)
    expect(result.demandComponents[0].fleetQuantityNeeded).toBe(1)
  })

  it('retired fleet assets create zero demand (Amendment 2 restatement) even on a custom build', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ ships: [ship({ lifecycleStatus: 'retired' })], builds: [build({ kind: 'CUSTOM' })], hardpoints }))
    expect(result.demandComponents).toEqual([])
  })

  it('Invalid Target, Unresolved, intentional-empty, OK, and Upgrade Available rows remain excluded on a custom build', () => {
    const hardpoints = [
      hp({ id: 'hp-invalid', slotLabel: 'A', status: 'Invalid Target', targetItem: 'BadItem' }),
      hp({ id: 'hp-unresolved', slotLabel: 'B', status: 'Unresolved', targetItem: 'SomeItem' }),
      hp({ id: 'hp-empty', slotLabel: 'C', status: 'Missing', targetItem: '—' }),
      hp({ id: 'hp-ok', slotLabel: 'D', status: 'OK', targetItem: 'Mirage', installedItem: 'Mirage' }),
      hp({ id: 'hp-upgrade', slotLabel: 'E', status: 'Upgrade Available', installedItem: 'Old', targetItem: 'New' }),
    ]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ builds: [build({ kind: 'CUSTOM' })], hardpoints }))
    expect(result.demandComponents).toEqual([])
  })

  it('eligible narrowed demand still matches NPC factory sources correctly end to end', () => {
    const hardpoints = [hp({ id: 'hp-1', slotLabel: 'Shield', status: 'Missing', targetItem: 'Mirage', targetEntityClass: 'MIRAGE_EC' })]
    const result = resolveFactoryLoadoutTargetIntelligence(baseParams({ builds: [build({ kind: 'CUSTOM' })], hardpoints }))
    expect(result.sourceShips.map((s) => s.shipDefinitionId).sort()).toEqual(['ship-a', 'ship-b'])
  })
})
