import { describe, it, expect } from 'vitest'
import { comparePriority, normalizeFleetPriorities, reorderFleetPriority, closePriorityGapOnRemoval, buildFleetPriorityOptions } from '../fleetPriority'

describe('comparePriority', () => {
  it('sorts ascending by rank, Unprioritized (null) always last', () => {
    const values: (number | null)[] = [3, null, 1, 2]
    expect([...values].sort(comparePriority)).toEqual([1, 2, 3, null])
  })

  it('two Unprioritized values are equal', () => {
    expect(comparePriority(null, null)).toBe(0)
  })
})

describe('normalizeFleetPriorities', () => {
  it('repairs a duplicate into a clean, unique 1..N sequence, preserving array order as the tiebreak', () => {
    const items = [
      { id: 'a', priority: 1 },
      { id: 'b', priority: 2 },
      { id: 'c', priority: 2 }, // duplicate
      { id: 'd', priority: 4 },
    ]
    const result = normalizeFleetPriorities(items)
    expect(result.map((r) => r.priority)).toEqual([1, 2, 3, 4])
    expect(result.find((r) => r.id === 'b')!.priority).toBe(2) // 'b' precedes 'c' in array order, so 'b' keeps the lower rank
    expect(result.find((r) => r.id === 'c')!.priority).toBe(3)
  })

  it('invalid values (0, negative, non-integer) become Unprioritized', () => {
    const items = [
      { id: 'a', priority: 0 },
      { id: 'b', priority: -1 },
      { id: 'c', priority: 1.5 },
      { id: 'd', priority: 1 },
    ]
    const result = normalizeFleetPriorities(items)
    expect(result.find((r) => r.id === 'd')!.priority).toBe(1)
    expect(result.find((r) => r.id === 'a')!.priority).toBeNull()
    expect(result.find((r) => r.id === 'b')!.priority).toBeNull()
    expect(result.find((r) => r.id === 'c')!.priority).toBeNull()
  })

  it('is idempotent — running it twice produces the identical result', () => {
    const items = [
      { id: 'a', priority: 5 },
      { id: 'b', priority: 5 },
      { id: 'c', priority: null },
    ]
    const once = normalizeFleetPriorities(items)
    const twice = normalizeFleetPriorities(once)
    expect(twice).toEqual(once)
  })

  it('closes gaps — a fleet with priorities 1, 5, 9 becomes 1, 2, 3', () => {
    const items = [
      { id: 'a', priority: 1 },
      { id: 'b', priority: 5 },
      { id: 'c', priority: 9 },
    ]
    expect(normalizeFleetPriorities(items).map((r) => r.priority)).toEqual([1, 2, 3])
  })
})

describe('reorderFleetPriority', () => {
  const fleet = [
    { id: 'a', priority: 1 },
    { id: 'b', priority: 2 },
    { id: 'c', priority: 3 },
  ]

  it('moving the last ship to position 1 shifts every other ship down by one', () => {
    const result = reorderFleetPriority(fleet, 'c', 1)
    const byId = new Map(result.map((r) => [r.id, r.priority]))
    expect(byId.get('c')).toBe(1)
    expect(byId.get('a')).toBe(2)
    expect(byId.get('b')).toBe(3)
  })

  it('setting a ranked ship to null (Unprioritized) closes the gap for the rest', () => {
    const result = reorderFleetPriority(fleet, 'a', null)
    const byId = new Map(result.map((r) => [r.id, r.priority]))
    expect(byId.get('a')).toBeNull()
    expect(byId.get('b')).toBe(1)
    expect(byId.get('c')).toBe(2)
  })

  it('clamps a requested rank beyond the fleet size to the end, never leaving a gap', () => {
    const result = reorderFleetPriority(fleet, 'a', 999)
    const byId = new Map(result.map((r) => [r.id, r.priority]))
    expect(byId.get('a')).toBe(3)
    expect(byId.get('b')).toBe(1)
    expect(byId.get('c')).toBe(2)
  })

  it('only returns entries whose rank actually changed — a true no-op (requesting the target\'s own current position) returns an empty array', () => {
    const result = reorderFleetPriority(fleet, 'c', 3) // 'c' is already 3, the end
    expect(result).toEqual([])
  })

  it('a real move only returns the entries that actually shifted, never the whole fleet', () => {
    // Moving 'a' (currently 1) to 2 only displaces 'b' — 'c' (already 3, unaffected) is omitted.
    const result = reorderFleetPriority(fleet, 'a', 2)
    const byId = new Map(result.map((r) => [r.id, r.priority]))
    expect(byId.get('a')).toBe(2)
    expect(byId.get('b')).toBe(1)
    expect(byId.has('c')).toBe(false)
  })
})

describe('closePriorityGapOnRemoval', () => {
  it('shifts every ship ranked after the removed one down by one, and never includes the removed ship itself', () => {
    const fleet = [
      { id: 'a', priority: 1 },
      { id: 'b', priority: 2 },
      { id: 'c', priority: 3 },
    ]
    const result = closePriorityGapOnRemoval(fleet, 'a')
    expect(result.find((r) => r.id === 'a')).toBeUndefined()
    const byId = new Map(result.map((r) => [r.id, r.priority]))
    expect(byId.get('b')).toBe(1)
    expect(byId.get('c')).toBe(2)
  })
})

describe('buildFleetPriorityOptions (EWO-066A Part C)', () => {
  const fleet = [
    { id: 'corsair', name: 'Corsair', priority: 1 },
    { id: 'ghost', name: 'Ghost Mk II', priority: 2 },
    { id: 'mole', name: 'MOLE', priority: 3 },
    { id: 'stv', name: 'STV', priority: 4 },
  ]

  it('matches the Chief Architect\'s own worked example exactly, for a ranked target', () => {
    const options = buildFleetPriorityOptions(fleet, 'mole')
    expect(options.map((o) => o.label)).toEqual([
      'Unprioritized',
      '1 • Corsair',
      '2 • Ghost Mk II',
      '3 • MOLE (Current)',
      '4 • STV',
    ])
  })

  it('option values are exactly what setFleetPriority expects', () => {
    const options = buildFleetPriorityOptions(fleet, 'mole')
    expect(options.map((o) => o.value)).toEqual(['UNPRIORITIZED', '1', '2', '3', '4'])
  })

  it('an Unprioritized target gets one extra trailing position with no current occupant', () => {
    const unprioritized = [...fleet, { id: 'pisces', name: 'Pisces Rescue', priority: null }]
    const options = buildFleetPriorityOptions(unprioritized, 'pisces')
    expect(options.map((o) => o.label)).toEqual([
      'Unprioritized',
      '1 • Corsair',
      '2 • Ghost Mk II',
      '3 • MOLE',
      '4 • STV',
      '5 • (Last Priority)',
    ])
  })
})
