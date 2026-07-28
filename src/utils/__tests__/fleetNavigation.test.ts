import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyFleetFilters,
  matchesFleetFilters,
  manufacturersInFleet,
  sortFleetEntries,
  isFleetFilterActive,
  loadPersistedFleetView,
  savePersistedFleetView,
  DEFAULT_FLEET_FILTERS,
  DEFAULT_FLEET_VIEW,
  type FleetNavigationEntry,
} from '../fleetNavigation'
import type { BuildProgressResult } from '../buildProgress'
import type { FleetBuildState, RsiRole, Ship } from '../../types'

function ship(overrides: Partial<Ship> = {}): Ship {
  return {
    id: 's', name: 'Ship', manufacturer: 'Drake', ownership: 'Owned', career: 'Combat', role: 'Role',
    activeBuildId: 'b', readiness: 0, priority: 5, missing: [], lifecycleStatus: 'active', ...overrides,
  }
}

function progress(percentage: number, isComplete = false): BuildProgressResult {
  return { percentage, matchedAssignments: 0, requiredAssignments: 0, missingAssignments: [], mismatchedAssignments: [], invalidTargets: [], unresolvedAssignments: [], upgradeOpportunities: [], isComplete, status: isComplete ? 'COMPLETE' : 'IN_PROGRESS' }
}

function entry(overrides: Partial<Ship> = {}, state: FleetBuildState = 'BUILD_IN_PROGRESS', rsiRoles: RsiRole[] = [], pct = 50): FleetNavigationEntry {
  return { ship: ship(overrides), rsiRoles, state, progress: progress(pct, state === 'MISSION_READY') }
}

describe('EWO-053 (Objective B): matchesFleetFilters / applyFleetFilters — composable, independent dimensions', () => {
  it("1. 'All' on every dimension matches everything", () => {
    expect(matchesFleetFilters(entry(), DEFAULT_FLEET_FILTERS)).toBe(true)
  })

  it('2. ownership alone excludes a non-matching ship without touching any other dimension', () => {
    const e = entry({ ownership: 'Loaner' })
    expect(matchesFleetFilters(e, { ...DEFAULT_FLEET_FILTERS, ownership: 'Owned' })).toBe(false)
    expect(matchesFleetFilters(e, { ...DEFAULT_FLEET_FILTERS, ownership: 'Loaner' })).toBe(true)
  })

  it('3. manufacturer alone compares the canonical ship.manufacturer field directly — no internal re-translation', () => {
    const e = entry({ manufacturer: 'Argo' })
    expect(matchesFleetFilters(e, { ...DEFAULT_FLEET_FILTERS, manufacturer: 'Argo' })).toBe(true)
    expect(matchesFleetFilters(e, { ...DEFAULT_FLEET_FILTERS, manufacturer: 'Drake' })).toBe(false)
  })

  it('4. rsiRole alone matches a ship carrying more than one role (a ship can appear under more than one role filter)', () => {
    const e = entry({}, 'BUILD_IN_PROGRESS', ['Industrial', 'Support'])
    expect(matchesFleetFilters(e, { ...DEFAULT_FLEET_FILTERS, rsiRole: 'Industrial' })).toBe(true)
    expect(matchesFleetFilters(e, { ...DEFAULT_FLEET_FILTERS, rsiRole: 'Support' })).toBe(true)
    expect(matchesFleetFilters(e, { ...DEFAULT_FLEET_FILTERS, rsiRole: 'Combat' })).toBe(false)
  })

  it("5. readiness alone reads the existing FleetBuildState classification — never a second readiness calculation", () => {
    const ready = entry({}, 'MISSION_READY', [], 100)
    const factoryOnly = entry({}, 'FACTORY_ONLY', [], 100)
    expect(matchesFleetFilters(ready, { ...DEFAULT_FLEET_FILTERS, readiness: 'MISSION_READY' })).toBe(true)
    expect(matchesFleetFilters(factoryOnly, { ...DEFAULT_FLEET_FILTERS, readiness: 'MISSION_READY' })).toBe(false)
    expect(matchesFleetFilters(factoryOnly, { ...DEFAULT_FLEET_FILTERS, readiness: 'FACTORY_LOADOUT' })).toBe(true)
  })

  it('6. Composable Filters — Industrial + Argo (the mission\'s own worked example) composes as AND, never replacing one active dimension with another', () => {
    const mole = entry({ id: 'mole', manufacturer: 'Argo' }, 'BUILD_IN_PROGRESS', ['Industrial'])
    const vulture = entry({ id: 'vulture', manufacturer: 'Drake' }, 'BUILD_IN_PROGRESS', ['Industrial'])
    const filters = { ...DEFAULT_FLEET_FILTERS, rsiRole: 'Industrial' as const, manufacturer: 'Argo' }
    const result = applyFleetFilters([mole, vulture], filters)
    expect(result.map((r) => r.ship.id)).toEqual(['mole'])
  })

  it('7. all three dimensions plus readiness compose together (Industrial + Argo + Ready) — a real, non-trivial four-way AND', () => {
    const moleReady = entry({ id: 'mole-ready', manufacturer: 'Argo' }, 'MISSION_READY', ['Industrial'], 100)
    const moleNotReady = entry({ id: 'mole-not-ready', manufacturer: 'Argo' }, 'BUILD_IN_PROGRESS', ['Industrial'], 40)
    const filters = { ownership: 'Owned' as const, rsiRole: 'Industrial' as const, manufacturer: 'Argo', readiness: 'MISSION_READY' as const }
    const result = applyFleetFilters([moleReady, moleNotReady], filters)
    expect(result.map((r) => r.ship.id)).toEqual(['mole-ready'])
  })

  it('8. isFleetFilterActive is false only when every dimension is All', () => {
    expect(isFleetFilterActive(DEFAULT_FLEET_FILTERS)).toBe(false)
    expect(isFleetFilterActive({ ...DEFAULT_FLEET_FILTERS, manufacturer: 'Argo' })).toBe(true)
  })
})

describe('EWO-053 (Objective B): manufacturersInFleet', () => {
  it('9. returns only manufacturers actually present in the fleet, deduplicated and sorted — never the full universe catalog', () => {
    const ships = [ship({ id: 'a', manufacturer: 'Drake' }), ship({ id: 'b', manufacturer: 'Argo' }), ship({ id: 'c', manufacturer: 'Drake' })]
    expect(manufacturersInFleet(ships)).toEqual(['Argo', 'Drake'])
  })

  it('10. an empty fleet returns an empty list, not an error', () => {
    expect(manufacturersInFleet([])).toEqual([])
  })
})

describe('EWO-053 (Objective B): sortFleetEntries', () => {
  it('11. Name sorts alphabetically by ship name', () => {
    const a = entry({ id: 'a', name: 'Zeus' })
    const b = entry({ id: 'b', name: 'Avenger' })
    expect(sortFleetEntries([a, b], 'Name').map((e) => e.ship.id)).toEqual(['b', 'a'])
  })

  it('12. Manufacturer sorts by the canonical ship.manufacturer field, never a second translation of it', () => {
    const a = entry({ id: 'a', manufacturer: 'Origin' })
    const b = entry({ id: 'b', manufacturer: 'Argo' })
    expect(sortFleetEntries([a, b], 'Manufacturer').map((e) => e.ship.id)).toEqual(['b', 'a'])
  })

  it('13. RsiRole sorts by each ship\'s own alphabetically-first classified role; roleless ships sort last', () => {
    const combat = entry({ id: 'combat' }, 'BUILD_IN_PROGRESS', ['Combat'])
    const industrial = entry({ id: 'industrial' }, 'BUILD_IN_PROGRESS', ['Industrial'])
    const roleless = entry({ id: 'roleless' }, 'BUILD_IN_PROGRESS', [])
    const sorted = sortFleetEntries([roleless, industrial, combat], 'RsiRole').map((e) => e.ship.id)
    expect(sorted).toEqual(['combat', 'industrial', 'roleless'])
  })

  it('14. Priority sorts ascending by the ship\'s own stored priority value', () => {
    const low = entry({ id: 'low', priority: 1 })
    const high = entry({ id: 'high', priority: 9 })
    expect(sortFleetEntries([high, low], 'Priority').map((e) => e.ship.id)).toEqual(['low', 'high'])
  })

  it('15. Readiness delegates to the existing compareByReadinessRank — never a second readiness ordering', () => {
    const ready = entry({ id: 'ready' }, 'MISSION_READY', [], 100)
    const inProgress = entry({ id: 'wip' }, 'BUILD_IN_PROGRESS', [], 50)
    expect(sortFleetEntries([inProgress, ready], 'Readiness').map((e) => e.ship.id)).toEqual(['ready', 'wip'])
  })

  it('16. never mutates the input array — a pure function, safe to call against live state', () => {
    const list = [entry({ id: 'b', name: 'B' }), entry({ id: 'a', name: 'A' })]
    const before = list.map((e) => e.ship.id)
    sortFleetEntries(list, 'Name')
    expect(list.map((e) => e.ship.id)).toEqual(before)
  })
})

describe('EWO-053 (Objective B): Persistent View — session-scoped, defensive read/write', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('17. with nothing stored yet, loads the default view', () => {
    expect(loadPersistedFleetView()).toEqual(DEFAULT_FLEET_VIEW)
  })

  it('18. a saved view round-trips exactly through save + load', () => {
    const view = { filters: { ...DEFAULT_FLEET_FILTERS, manufacturer: 'Argo', rsiRole: 'Industrial' as const }, sortMode: 'Manufacturer' as const, viewMode: 'Table' as const }
    savePersistedFleetView(view)
    expect(loadPersistedFleetView()).toEqual(view)
  })

  it('19. malformed stored JSON falls back to the default view rather than throwing', () => {
    sessionStorage.setItem('sfm-fleet-navigation-view', '{not valid json')
    expect(() => loadPersistedFleetView()).not.toThrow()
    expect(loadPersistedFleetView()).toEqual(DEFAULT_FLEET_VIEW)
  })

  it('20. an unrecognized sortMode/viewMode value in storage falls back to the default rather than propagating garbage into the UI', () => {
    sessionStorage.setItem('sfm-fleet-navigation-view', JSON.stringify({ filters: DEFAULT_FLEET_FILTERS, sortMode: 'Nonsense', viewMode: 'Nonsense' }))
    const loaded = loadPersistedFleetView()
    expect(loaded.sortMode).toBe(DEFAULT_FLEET_VIEW.sortMode)
    expect(loaded.viewMode).toBe(DEFAULT_FLEET_VIEW.viewMode)
  })
})
