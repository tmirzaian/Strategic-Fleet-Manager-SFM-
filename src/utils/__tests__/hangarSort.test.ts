import { describe, it, expect } from 'vitest'
import { sortHangarEntries, type HangarSortEntry } from '../hangarSort'
import type { HangarItem } from '../../types'

function entry(overrides: Partial<HangarItem> & { installedQuantity?: number; reservedQuantity?: number; availableQuantity?: number; neededByCount?: number }): HangarSortEntry {
  const item: HangarItem = {
    id: overrides.id ?? 'id',
    name: overrides.name ?? 'Item',
    type: overrides.type ?? 'Type',
    size: overrides.size ?? 'S1',
    qty: overrides.qty ?? 1,
    neededBy: 'None',
    disposition: 'Store',
  }
  return {
    item,
    installedQuantity: overrides.installedQuantity ?? 0,
    reservedQuantity: overrides.reservedQuantity ?? 0,
    availableQuantity: overrides.availableQuantity ?? 0,
    neededByCount: overrides.neededByCount ?? 0,
  }
}

const entries: HangarSortEntry[] = [
  entry({ name: 'Zebra Rack', type: 'MissileRack', size: 'S10', installedQuantity: 1, reservedQuantity: 0, availableQuantity: 2, neededByCount: 0 }),
  entry({ name: 'Alpha Shield', type: 'Shield', size: 'S1', installedQuantity: 0, reservedQuantity: 3, availableQuantity: 9, neededByCount: 2 }),
  entry({ name: 'Mid Cooler', type: 'Cooler', size: 'S2', installedQuantity: 2, reservedQuantity: 1, availableQuantity: 1, neededByCount: 1 }),
]

describe('sortHangarEntries (EWO-072 Part F)', () => {
  it('sorts by Item Name ascending/descending', () => {
    const asc = sortHangarEntries(entries, 'name', 'asc')
    expect(asc.map((e) => e.item.name)).toEqual(['Alpha Shield', 'Mid Cooler', 'Zebra Rack'])
    const desc = sortHangarEntries(entries, 'name', 'desc')
    expect(desc.map((e) => e.item.name)).toEqual(['Zebra Rack', 'Mid Cooler', 'Alpha Shield'])
  })

  it('sorts by Type alphabetically', () => {
    const asc = sortHangarEntries(entries, 'type', 'asc')
    expect(asc.map((e) => e.item.type)).toEqual(['Cooler', 'MissileRack', 'Shield'])
  })

  it('sorts by Size numerically, not lexically (S1, S2, S10 in that order)', () => {
    const asc = sortHangarEntries(entries, 'size', 'asc')
    expect(asc.map((e) => e.item.size)).toEqual(['S1', 'S2', 'S10'])
  })

  it('sorts by Installed numerically', () => {
    const asc = sortHangarEntries(entries, 'installed', 'asc')
    expect(asc.map((e) => e.installedQuantity)).toEqual([0, 1, 2])
  })

  it('sorts by Reserved numerically', () => {
    const asc = sortHangarEntries(entries, 'reserved', 'asc')
    expect(asc.map((e) => e.reservedQuantity)).toEqual([0, 1, 3])
  })

  it('sorts by Available numerically', () => {
    const asc = sortHangarEntries(entries, 'available', 'asc')
    expect(asc.map((e) => e.availableQuantity)).toEqual([1, 2, 9])
    const desc = sortHangarEntries(entries, 'available', 'desc')
    expect(desc.map((e) => e.availableQuantity)).toEqual([9, 2, 1])
  })

  it('sorts by Needed By unresolved-requirement count numerically', () => {
    const asc = sortHangarEntries(entries, 'neededBy', 'asc')
    expect(asc.map((e) => e.neededByCount)).toEqual([0, 1, 2])
  })

  it('is stable and deterministic on ties (falls back to name)', () => {
    const tied: HangarSortEntry[] = [
      entry({ name: 'B Item', availableQuantity: 5 }),
      entry({ name: 'A Item', availableQuantity: 5 }),
    ]
    const sorted = sortHangarEntries(tied, 'available', 'asc')
    expect(sorted.map((e) => e.item.name)).toEqual(['A Item', 'B Item'])
  })
})
