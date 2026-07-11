import { describe, it, expect } from 'vitest'
import { sortHangarItems } from '../hangarSort'
import type { HangarItem } from '../../types'

const items: HangarItem[] = [
  { id: '1', name: 'Zebra Rack', type: 'MissileRack', size: 'S10', qty: 2, neededBy: 'None', disposition: 'Store' },
  { id: '2', name: 'Alpha Shield', type: 'Shield', size: 'S1', qty: 9, neededBy: 'None', disposition: 'Store' },
  { id: '3', name: 'Mid Cooler', type: 'Cooler', size: 'S2', qty: 1, neededBy: 'None', disposition: 'Store' },
]

describe('sortHangarItems (Part 16)', () => {
  it('23. sorts by Item Name ascending/descending', () => {
    const asc = sortHangarItems(items, 'name', 'asc')
    expect(asc.map((i) => i.name)).toEqual(['Alpha Shield', 'Mid Cooler', 'Zebra Rack'])
    const desc = sortHangarItems(items, 'name', 'desc')
    expect(desc.map((i) => i.name)).toEqual(['Zebra Rack', 'Mid Cooler', 'Alpha Shield'])
  })

  it('24. sorts by Type alphabetically', () => {
    const asc = sortHangarItems(items, 'type', 'asc')
    expect(asc.map((i) => i.type)).toEqual(['Cooler', 'MissileRack', 'Shield'])
  })

  it('25. sorts by Size numerically, not lexically (S1, S2, S10 in that order)', () => {
    const asc = sortHangarItems(items, 'size', 'asc')
    expect(asc.map((i) => i.size)).toEqual(['S1', 'S2', 'S10'])
  })

  it('26. sorts by Quantity numerically', () => {
    const asc = sortHangarItems(items, 'quantity', 'asc')
    expect(asc.map((i) => i.qty)).toEqual([1, 2, 9])
    const desc = sortHangarItems(items, 'quantity', 'desc')
    expect(desc.map((i) => i.qty)).toEqual([9, 2, 1])
  })

  it('is stable and deterministic on ties (falls back to name)', () => {
    const tied: HangarItem[] = [
      { id: 'a', name: 'B Item', type: 'X', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' },
      { id: 'b', name: 'A Item', type: 'X', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' },
    ]
    const sorted = sortHangarItems(tied, 'quantity', 'asc')
    expect(sorted.map((i) => i.name)).toEqual(['A Item', 'B Item'])
  })
})
