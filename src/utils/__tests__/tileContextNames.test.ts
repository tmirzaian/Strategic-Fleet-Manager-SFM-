import { describe, it, expect } from 'vitest'
import { buildTileContextNames } from '../tileContextNames'
import type { Ship } from '../../types'

function ship(overrides: Partial<Ship> = {}): Ship {
  return { id: 's', name: 'Ship', manufacturer: 'M', ownership: 'Owned', career: 'Combat', role: 'Role', activeBuildId: 'b', readiness: 0, priority: 5, missing: [], lifecycleStatus: 'active', ...overrides }
}

describe('buildTileContextNames (Alpha 2.5A, Part 2)', () => {
  it('9/10/11: shows up to three names', () => {
    const ships = [ship({ id: 'a', name: 'Alpha', priority: 1 }), ship({ id: 'b', name: 'Beta', priority: 2 })]
    const result = buildTileContextNames(ships)
    expect(result.shown.map((e) => e.name)).toEqual(['Alpha', 'Beta'])
    expect(result.overflowCount).toBe(0)
  })

  it('12. more than three ships produces a +N overflow count', () => {
    const ships = Array.from({ length: 7 }, (_, i) => ship({ id: `s${i}`, name: `Ship ${i}`, priority: i }))
    const result = buildTileContextNames(ships)
    expect(result.shown).toHaveLength(3)
    expect(result.overflowCount).toBe(4)
  })

  it('13. Fleet Asset nickname is preferred — Ship.name already resolves this upstream', () => {
    const ships = [ship({ id: 'ghost', name: 'Nightwing' })]
    const result = buildTileContextNames(ships)
    expect(result.shown[0].name).toBe('Nightwing')
  })

  it('preserves deterministic ordering by priority, then name, then id', () => {
    const ships = [ship({ id: 'z', name: 'Zebra', priority: 1 }), ship({ id: 'a', name: 'Alpha', priority: 1 })]
    const result = buildTileContextNames(ships)
    expect(result.shown.map((e) => e.name)).toEqual(['Alpha', 'Zebra'])
  })

  it('returns an empty result for zero ships without error', () => {
    const result = buildTileContextNames([])
    expect(result.shown).toEqual([])
    expect(result.overflowCount).toBe(0)
  })
})
