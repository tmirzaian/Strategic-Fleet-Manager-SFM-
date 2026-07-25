import { describe, it, expect } from 'vitest'
import { deriveFleetPriorityActions, PRIORITY_ACTION_CATEGORY_ORDER } from '../priorityActions'
import type { Hardpoint, HangarItem, InstalledLoadoutEntry, MissionReservation, Ship } from '../../types'

function ship(overrides: Partial<Ship> = {}): Ship {
  return { id: 's', name: 'Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'Role', activeBuildId: 'b', readiness: 0, priority: 5, missing: [], ...overrides }
}

function hp(overrides: Partial<Hardpoint> = {}): Hardpoint {
  return {
    id: 'hp',
    shipId: 's',
    buildId: 'b',
    slotLabel: 'Slot',
    type: 'Shield',
    size: 'S1',
    factoryItem: 'Factory',
    installedItem: '—',
    targetItem: 'Target',
    status: 'Missing',
    ...overrides,
  }
}

/**
 * UX-001A (Deliverable 4) — Priority Actions data layer.
 */
describe('deriveFleetPriorityActions', () => {
  it('returns nothing when every required assignment is already OK or has no target', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [
      hp({ shipId: 'a', buildId: 'b', status: 'OK' }),
      hp({ shipId: 'a', buildId: 'b', targetItem: '—', status: 'Missing' }),
    ]
    expect(deriveFleetPriorityActions([s], hardpoints, [], [], [])).toEqual([])
  })

  it('excludes structural rows even when their own status is non-OK', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [hp({ shipId: 'a', buildId: 'b', status: 'Missing', isStructural: true })]
    expect(deriveFleetPriorityActions([s], hardpoints, [], [], [])).toEqual([])
  })

  it('classifies an Invalid Target assignment under INVALID_TARGET', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [hp({ shipId: 'a', buildId: 'b', status: 'Invalid Target' })]
    const groups = deriveFleetPriorityActions([s], hardpoints, [], [], [])
    expect(groups).toHaveLength(1)
    expect(groups[0].category).toBe('INVALID_TARGET')
    expect(groups[0].count).toBe(1)
    expect(groups[0].context.shown.map((c) => c.shipId)).toEqual(['a'])
  })

  it('classifies an Upgrade Available assignment under UPGRADE_OPPORTUNITY', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [hp({ shipId: 'a', buildId: 'b', status: 'Upgrade Available' })]
    const groups = deriveFleetPriorityActions([s], hardpoints, [], [], [])
    expect(groups.map((g) => g.category)).toEqual(['UPGRADE_OPPORTUNITY'])
  })

  it('classifies a Missing assignment with a matching reservation for this exact port under RESERVED_AWAITING_INSTALL, never CRITICAL_MISSING', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [hp({ shipId: 'a', buildId: 'b', slotLabel: 'Left Shield', targetItem: 'Mirage', status: 'Missing' })]
    const hangarItems: HangarItem[] = [{ id: 'h1', name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }]
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'b', fleetAssetId: 'a', targetSlotLabel: 'Left Shield', componentName: 'Mirage', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ]
    const groups = deriveFleetPriorityActions([s], hardpoints, hangarItems, [], reservations)
    expect(groups.map((g) => g.category)).toEqual(['RESERVED_AWAITING_INSTALL'])
  })

  it('classifies a Missing assignment with genuinely free owned stock under READY_TO_INSTALL', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [hp({ shipId: 'a', buildId: 'b', targetItem: 'Mirage', status: 'Missing' })]
    const hangarItems: HangarItem[] = [{ id: 'h1', name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }]
    const groups = deriveFleetPriorityActions([s], hardpoints, hangarItems, [], [])
    expect(groups.map((g) => g.category)).toEqual(['READY_TO_INSTALL'])
  })

  it('classifies a Missing assignment with no owned stock anywhere under CRITICAL_MISSING', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [hp({ shipId: 'a', buildId: 'b', targetItem: 'Mirage', status: 'Missing' })]
    const groups = deriveFleetPriorityActions([s], hardpoints, [], [], [])
    expect(groups.map((g) => g.category)).toEqual(['CRITICAL_MISSING'])
  })

  it('a Missing assignment whose owned stock is fully committed to a DIFFERENT port is CRITICAL_MISSING, not READY_TO_INSTALL', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [hp({ shipId: 'a', buildId: 'b', slotLabel: 'Left Shield', targetItem: 'Mirage', status: 'Missing' })]
    const hangarItems: HangarItem[] = [{ id: 'h1', name: 'Mirage', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' }]
    const reservations: MissionReservation[] = [
      { id: 'r1', missionConfigurationId: 'other-build', fleetAssetId: 'other-ship', targetSlotLabel: 'Right Shield', componentName: 'Mirage', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '' },
    ]
    const groups = deriveFleetPriorityActions([s], hardpoints, hangarItems, [], reservations)
    expect(groups.map((g) => g.category)).toEqual(['CRITICAL_MISSING'])
  })

  it('every present category is returned in the fixed priority order, regardless of hardpoint iteration order', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [
      hp({ id: 'h1', shipId: 'a', buildId: 'b', slotLabel: 'S1', targetItem: 'Critical Item', status: 'Missing' }),
      hp({ id: 'h2', shipId: 'a', buildId: 'b', slotLabel: 'S2', status: 'Upgrade Available' }),
      hp({ id: 'h3', shipId: 'a', buildId: 'b', slotLabel: 'S3', status: 'Invalid Target' }),
    ]
    const groups = deriveFleetPriorityActions([s], hardpoints, [], [], [])
    const categories = groups.map((g) => g.category)
    const order = categories.map((c) => PRIORITY_ACTION_CATEGORY_ORDER.indexOf(c))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // UX-001A.1 (Deliverable 3) — Commander-value order, not severity: the
    // self-contained, in-app-resolvable Upgrade Opportunity now ranks
    // ahead of Invalid Target (a real defect, but still cheaper to resolve
    // than shopping), and Critical Missing (needs procurement) stays last.
    expect(categories).toEqual(['UPGRADE_OPPORTUNITY', 'INVALID_TARGET', 'CRITICAL_MISSING'])
  })

  it('two ships contributing to the same category are both reflected in that group\'s own ship context', () => {
    const s1 = ship({ id: 'a', name: 'Alpha', activeBuildId: 'ba', priority: 1 })
    const s2 = ship({ id: 'b', name: 'Beta', activeBuildId: 'bb', priority: 2 })
    const hardpoints = [hp({ shipId: 'a', buildId: 'ba', status: 'Invalid Target' }), hp({ shipId: 'b', buildId: 'bb', status: 'Invalid Target' })]
    const groups = deriveFleetPriorityActions([s1, s2], hardpoints, [], [], [])
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(2)
    expect(groups[0].context.shown.map((c) => c.name).sort()).toEqual(['Alpha', 'Beta'])
  })

  it('a ship contributing two assignments to the same category is counted twice but listed once in ship context', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [
      hp({ id: 'h1', shipId: 'a', buildId: 'b', slotLabel: 'S1', status: 'Invalid Target' }),
      hp({ id: 'h2', shipId: 'a', buildId: 'b', slotLabel: 'S2', status: 'Invalid Target' }),
    ]
    const groups = deriveFleetPriorityActions([s], hardpoints, [], [], [])
    expect(groups[0].count).toBe(2)
    expect(groups[0].context.shown).toHaveLength(1)
  })

  it('an Unresolved or already-OK hardpoint on an otherwise-affected ship is silently skipped', () => {
    const s = ship({ id: 'a', activeBuildId: 'b' })
    const hardpoints = [hp({ shipId: 'a', buildId: 'b', slotLabel: 'S1', status: 'Unresolved' }), hp({ shipId: 'a', buildId: 'b', slotLabel: 'S2', status: 'OK' })]
    expect(deriveFleetPriorityActions([s], hardpoints, [], [], [])).toEqual([])
  })

  it('only the ship\'s ACTIVE build is considered — a non-active build\'s own hardpoints never contribute', () => {
    const s = ship({ id: 'a', activeBuildId: 'active-build' })
    const hardpoints = [hp({ shipId: 'a', buildId: 'inactive-build', status: 'Invalid Target' })]
    expect(deriveFleetPriorityActions([s], hardpoints, [], [], [])).toEqual([])
  })

  it('returns an empty array for zero ships without error', () => {
    expect(deriveFleetPriorityActions([], [], [], [], [])).toEqual([])
  })
})
