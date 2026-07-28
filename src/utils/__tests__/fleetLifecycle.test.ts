import { describe, it, expect } from 'vitest'
import { isActiveShip, selectActiveShips, selectRetiredShips, activeReservationsForShip } from '../fleetLifecycle'
import type { Ship, Build, MissionReservation } from '../../types'

function ship(overrides: Partial<Ship> = {}): Ship {
  return {
    id: 's', name: 'Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'Role',
    activeBuildId: 'b', readiness: 0, priority: 5, missing: [], lifecycleStatus: 'active', ...overrides,
  }
}

describe('SW-015C: fleetLifecycle — isActiveShip / selectActiveShips / selectRetiredShips', () => {
  it('isActiveShip is true for active and false for retired', () => {
    expect(isActiveShip(ship({ lifecycleStatus: 'active' }))).toBe(true)
    expect(isActiveShip(ship({ lifecycleStatus: 'retired' }))).toBe(false)
  })

  it('selectActiveShips / selectRetiredShips partition a mixed fleet with no overlap', () => {
    const ships = [
      ship({ id: 'a', lifecycleStatus: 'active' }),
      ship({ id: 'b', lifecycleStatus: 'retired' }),
      ship({ id: 'c', lifecycleStatus: 'active' }),
    ]
    expect(selectActiveShips(ships).map((s) => s.id)).toEqual(['a', 'c'])
    expect(selectRetiredShips(ships).map((s) => s.id)).toEqual(['b'])
  })

  it('an empty fleet produces empty active and retired lists, never throws', () => {
    expect(selectActiveShips([])).toEqual([])
    expect(selectRetiredShips([])).toEqual([])
  })
})

describe('SW-015C: fleetLifecycle — activeReservationsForShip', () => {
  const builds: Build[] = [
    { id: 'b1', shipId: 'ghost', name: 'Build 1', role: 'R', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM' },
    { id: 'b2', shipId: 'ghost', name: 'Build 2', role: 'R', readiness: 0, isActive: false, missing: [], kind: 'CUSTOM' },
    { id: 'b3', shipId: 'vulture', name: 'Build 3', role: 'R', readiness: 0, isActive: true, missing: [], kind: 'CUSTOM' },
  ]
  function reservation(overrides: Partial<MissionReservation> = {}): MissionReservation {
    return {
      id: `r-${Math.random()}`, missionConfigurationId: 'b1', fleetAssetId: 'ghost', targetSlotLabel: 'Slot',
      componentName: 'FR-66', quantity: 1, status: 'ACTIVE', createdAt: '', updatedAt: '', ...overrides,
    }
  }

  it('matches a reservation recorded directly against the ship id (fleetAssetId)', () => {
    const reservations = [reservation({ id: 'r1', fleetAssetId: 'ghost', missionConfigurationId: 'unrelated-build' })]
    expect(activeReservationsForShip('ghost', builds, reservations).map((r) => r.id)).toEqual(['r1'])
  })

  it('matches a reservation recorded against any of the ship\'s builds, even a non-active one', () => {
    const reservations = [reservation({ id: 'r2', fleetAssetId: 'different-ship-id', missionConfigurationId: 'b2' })]
    expect(activeReservationsForShip('ghost', builds, reservations).map((r) => r.id)).toEqual(['r2'])
  })

  it('excludes a reservation belonging to a different ship entirely', () => {
    const reservations = [reservation({ id: 'r3', fleetAssetId: 'vulture', missionConfigurationId: 'b3' })]
    expect(activeReservationsForShip('ghost', builds, reservations)).toEqual([])
  })

  it('excludes a RELEASED/FULFILLED/INVALID reservation — only ACTIVE counts', () => {
    const reservations = [
      reservation({ id: 'r4', status: 'RELEASED' }),
      reservation({ id: 'r5', status: 'FULFILLED' }),
      reservation({ id: 'r6', status: 'INVALID' }),
    ]
    expect(activeReservationsForShip('ghost', builds, reservations)).toEqual([])
  })

  it('never double-counts a reservation matching both fleetAssetId and a build id for the same ship', () => {
    const reservations = [reservation({ id: 'r7', fleetAssetId: 'ghost', missionConfigurationId: 'b1' })]
    expect(activeReservationsForShip('ghost', builds, reservations)).toHaveLength(1)
  })
})
