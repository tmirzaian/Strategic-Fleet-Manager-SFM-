import { describe, it, expect, vi } from 'vitest'
import { isActiveShip, selectActiveShips, selectRetiredShips, activeReservationsForShip, resolvePurgeConfirmationPhrase, matchesPurgeConfirmationPhrase } from '../fleetLifecycle'
import type { Ship, Build, MissionReservation, FleetAsset } from '../../types'

// EWO-097 Amendment — a deterministic, mocked catalog so
// resolvePurgeConfirmationPhrase's fallback tier is tested against a
// known display name, independent of whatever ships the real generated
// catalog happens to contain. 'sabre' mirrors the exact Commander field
// report (a mixed-case model name: "Sabre").
vi.mock('../../data/shipDefinitions', () => ({
  shipDefinitionById: new Map([['sabre', { displayName: 'Sabre' }]]),
}))

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

/**
 * EWO-097 Amendment — "Canonical Purge Confirmation Phrase." Commander
 * field testing found the modal's CSS uppercase styling visually
 * transformed the phrase (e.g. "Sabre" rendered as "SABRE") while the
 * comparison stayed case-sensitive against the real, un-transformed
 * string — a real presentation/validation mismatch. These tests cover
 * the two shared helpers now used everywhere (heading, instruction,
 * accessible label, button enablement, and the store action's own
 * validation) so that gap can't reopen.
 */
describe('EWO-097 Amendment: resolvePurgeConfirmationPhrase', () => {
  function asset(overrides: Partial<FleetAsset> = {}): Pick<FleetAsset, 'nickname' | 'shipDefinitionId'> {
    return { shipDefinitionId: 'sabre', nickname: undefined, ...overrides }
  }

  it('1/5. no nickname: resolves to the canonical ship display name, trimmed', () => {
    expect(resolvePurgeConfirmationPhrase(asset())).toBe('Sabre')
    expect(resolvePurgeConfirmationPhrase(asset({ nickname: '' }))).toBe('Sabre')
    expect(resolvePurgeConfirmationPhrase(asset({ nickname: '   ' }))).toBe('Sabre')
  })

  it('2. a non-empty nickname takes precedence over the canonical display name', () => {
    expect(resolvePurgeConfirmationPhrase(asset({ nickname: 'TEST1' }))).toBe('TEST1')
  })

  it('3. the resolved phrase is trimmed', () => {
    expect(resolvePurgeConfirmationPhrase(asset({ nickname: '  TEST1  ' }))).toBe('TEST1')
  })

  it('never returns an empty string, even if the ship definition cannot be resolved', () => {
    expect(resolvePurgeConfirmationPhrase(asset({ shipDefinitionId: 'unknown-model', nickname: undefined }))).toBe('unknown-model')
  })
})

describe('EWO-097 Amendment: matchesPurgeConfirmationPhrase', () => {
  it('1. accepts the phrase in any case — natural, all-caps, or all-lowercase', () => {
    expect(matchesPurgeConfirmationPhrase('Sabre', 'Sabre')).toBe(true)
    expect(matchesPurgeConfirmationPhrase('SABRE', 'Sabre')).toBe(true)
    expect(matchesPurgeConfirmationPhrase('sabre', 'Sabre')).toBe(true)
  })

  it('2. accepts a nickname phrase case-insensitively too', () => {
    expect(matchesPurgeConfirmationPhrase('TEST1', 'TEST1')).toBe(true)
    expect(matchesPurgeConfirmationPhrase('test1', 'TEST1')).toBe(true)
  })

  it('3. ignores leading/trailing whitespace on the entered value', () => {
    expect(matchesPurgeConfirmationPhrase('  Sabre  ', 'Sabre')).toBe(true)
  })

  it('4. rejects a partial match or extra text — case-insensitivity is not substring matching', () => {
    expect(matchesPurgeConfirmationPhrase('Sab', 'Sabre')).toBe(false)
    expect(matchesPurgeConfirmationPhrase('Sabre1', 'Sabre')).toBe(false)
    expect(matchesPurgeConfirmationPhrase('Sabre extra', 'Sabre')).toBe(false)
  })

  it('2. rejects the canonical model name when a nickname is the expected phrase', () => {
    expect(matchesPurgeConfirmationPhrase('Sabre', 'TEST1')).toBe(false)
  })

  it('rejects an empty entered value', () => {
    expect(matchesPurgeConfirmationPhrase('', 'Sabre')).toBe(false)
  })
})
