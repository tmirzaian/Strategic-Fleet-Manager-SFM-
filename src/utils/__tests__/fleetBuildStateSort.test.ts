import { describe, it, expect } from 'vitest'
import { compareByReadinessRank } from '../fleetBuildState'
import type { BuildProgressResult } from '../buildProgress'
import type { FleetBuildState, Ship } from '../../types'

function ship(overrides: Partial<Ship> = {}): Ship {
  return {
    id: 's', name: 'Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'Role',
    activeBuildId: 'b', readiness: 0, priority: 5, missing: [], ...overrides,
  }
}

function progress(percentage: number, isComplete = false): BuildProgressResult {
  return { percentage, matchedAssignments: 0, requiredAssignments: 0, missingAssignments: [], mismatchedAssignments: [], invalidTargets: [], upgradeOpportunities: [], unresolvedAssignments: [], isComplete, status: isComplete ? 'COMPLETE' : 'IN_PROGRESS' }
}

function entry(id: string, state: FleetBuildState, pct: number, priority = 5) {
  return { ship: ship({ id, priority }), state, progress: progress(pct, state === 'MISSION_READY') }
}

describe('compareByReadinessRank (Part 10)', () => {
  it('15. completed custom Builds rank above incomplete custom Builds', () => {
    const complete = entry('a', 'MISSION_READY', 100)
    const inProgress = entry('b', 'BUILD_IN_PROGRESS', 80)
    const sorted = [inProgress, complete].sort(compareByReadinessRank)
    expect(sorted[0].ship.id).toBe('a')
  })

  it('16. Factory-only ships sort separately from (below) completed custom Builds', () => {
    const complete = entry('a', 'MISSION_READY', 100)
    const factoryOnly = entry('b', 'FACTORY_ONLY', 100)
    const sorted = [factoryOnly, complete].sort(compareByReadinessRank)
    expect(sorted[0].ship.id).toBe('a')
    expect(sorted[1].ship.id).toBe('b')
  })

  it('incomplete custom Builds sort by descending percentage within their group', () => {
    const low = entry('a', 'BUILD_IN_PROGRESS', 40)
    const high = entry('b', 'BUILD_IN_PROGRESS', 90)
    const sorted = [low, high].sort(compareByReadinessRank)
    expect(sorted.map((e) => e.ship.id)).toEqual(['b', 'a'])
  })

  it('Factory-only ships rank above Invalid Builds', () => {
    const factoryOnly = entry('a', 'FACTORY_ONLY', 100)
    const invalid = entry('b', 'INVALID_BUILD', 0)
    const sorted = [invalid, factoryOnly].sort(compareByReadinessRank)
    expect(sorted[0].ship.id).toBe('a')
  })

  it('full ordering: complete > in-progress (by %) > factory-only > invalid', () => {
    const items = [
      entry('invalid', 'INVALID_BUILD', 0),
      entry('factory', 'FACTORY_ONLY', 100),
      entry('progress-low', 'BUILD_IN_PROGRESS', 30),
      entry('complete', 'MISSION_READY', 100),
      entry('progress-high', 'BUILD_IN_PROGRESS', 70),
    ]
    const sorted = [...items].sort(compareByReadinessRank)
    expect(sorted.map((e) => e.ship.id)).toEqual(['complete', 'progress-high', 'progress-low', 'factory', 'invalid'])
  })

  it('uses priority, then name, then id as a stable tie-breaker within the same state/percentage', () => {
    const a = entry('z-id', 'FACTORY_ONLY', 100, 2)
    const b = entry('a-id', 'FACTORY_ONLY', 100, 1)
    const sorted = [a, b].sort(compareByReadinessRank)
    expect(sorted[0].ship.id).toBe('a-id') // lower priority number sorts first
  })
})
