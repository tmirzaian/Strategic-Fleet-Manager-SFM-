import { describe, it, expect } from 'vitest'
import {
  applyHangarFilters,
  DEFAULT_HANGAR_FILTERS,
  hangarFilterChips,
  isHangarFilterActive,
  matchesHangarFilters,
  sizesInHangar,
  typesInHangar,
  type HangarFilterState,
} from '../hangarFilters'
import type { HangarItem } from '../../types'

function item(overrides: Partial<HangarItem>): HangarItem {
  return { id: 'id', name: 'Item', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store', ...overrides }
}

describe('EWO-072 (Part E): hangarFilters', () => {
  it('DEFAULT_HANGAR_FILTERS is all "All" and inactive', () => {
    expect(isHangarFilterActive(DEFAULT_HANGAR_FILTERS)).toBe(false)
  })

  it('isHangarFilterActive is true when any single dimension is not "All"', () => {
    expect(isHangarFilterActive({ ...DEFAULT_HANGAR_FILTERS, type: 'Shield' })).toBe(true)
    expect(isHangarFilterActive({ ...DEFAULT_HANGAR_FILTERS, size: 'S1' })).toBe(true)
    expect(isHangarFilterActive({ ...DEFAULT_HANGAR_FILTERS, reservation: 'Reserved' })).toBe(true)
    expect(isHangarFilterActive({ ...DEFAULT_HANGAR_FILTERS, availability: 'Available' })).toBe(true)
  })

  it('typesInHangar derives dynamically from what is actually present, sorted, deduplicated', () => {
    const items = [item({ type: 'Shield' }), item({ type: 'Cooler' }), item({ type: 'Shield' })]
    expect(typesInHangar(items)).toEqual(['Cooler', 'Shield'])
  })

  it('sizesInHangar sorts by real numeric size rank, never lexically (S1, S2, S10)', () => {
    const items = [item({ size: 'S10' }), item({ size: 'S2' }), item({ size: 'S1' })]
    expect(sizesInHangar(items)).toEqual(['S1', 'S2', 'S10'])
  })

  it('matchesHangarFilters: Type dimension', () => {
    const row = { item: item({ type: 'Shield' }), reservedQuantity: 0, availableQuantity: 1 }
    expect(matchesHangarFilters(row, { ...DEFAULT_HANGAR_FILTERS, type: 'Shield' })).toBe(true)
    expect(matchesHangarFilters(row, { ...DEFAULT_HANGAR_FILTERS, type: 'Cooler' })).toBe(false)
  })

  it('matchesHangarFilters: Reservation dimension — Reserved requires reservedQuantity > 0, Unreserved requires exactly 0', () => {
    const reserved = { item: item({}), reservedQuantity: 2, availableQuantity: 0 }
    const unreserved = { item: item({}), reservedQuantity: 0, availableQuantity: 3 }
    expect(matchesHangarFilters(reserved, { ...DEFAULT_HANGAR_FILTERS, reservation: 'Reserved' })).toBe(true)
    expect(matchesHangarFilters(reserved, { ...DEFAULT_HANGAR_FILTERS, reservation: 'Unreserved' })).toBe(false)
    expect(matchesHangarFilters(unreserved, { ...DEFAULT_HANGAR_FILTERS, reservation: 'Reserved' })).toBe(false)
    expect(matchesHangarFilters(unreserved, { ...DEFAULT_HANGAR_FILTERS, reservation: 'Unreserved' })).toBe(true)
  })

  it('matchesHangarFilters: Availability dimension — Available requires availableQuantity > 0, Unavailable requires exactly 0', () => {
    const available = { item: item({}), reservedQuantity: 0, availableQuantity: 5 }
    const unavailable = { item: item({}), reservedQuantity: 3, availableQuantity: 0 }
    expect(matchesHangarFilters(available, { ...DEFAULT_HANGAR_FILTERS, availability: 'Available' })).toBe(true)
    expect(matchesHangarFilters(available, { ...DEFAULT_HANGAR_FILTERS, availability: 'Unavailable' })).toBe(false)
    expect(matchesHangarFilters(unavailable, { ...DEFAULT_HANGAR_FILTERS, availability: 'Available' })).toBe(false)
    expect(matchesHangarFilters(unavailable, { ...DEFAULT_HANGAR_FILTERS, availability: 'Unavailable' })).toBe(true)
  })

  it('applyHangarFilters combines every active dimension with AND logic', () => {
    const rows = [
      { item: item({ name: 'A', type: 'Shield', size: 'S1' }), reservedQuantity: 0, availableQuantity: 2 },
      { item: item({ name: 'B', type: 'Shield', size: 'S2' }), reservedQuantity: 0, availableQuantity: 2 },
      { item: item({ name: 'C', type: 'Cooler', size: 'S1' }), reservedQuantity: 0, availableQuantity: 2 },
      { item: item({ name: 'D', type: 'Shield', size: 'S1' }), reservedQuantity: 2, availableQuantity: 0 },
    ]
    const filters: HangarFilterState = { type: 'Shield', size: 'S1', reservation: 'All', availability: 'Available' }
    const result = applyHangarFilters(rows, filters)
    expect(result.map((r) => r.item.name)).toEqual(['A'])
  })

  it('hangarFilterChips returns one chip per active dimension, with the exact filter value in the label', () => {
    const chips = hangarFilterChips({ type: 'Shield', size: 'S1', reservation: 'Reserved', availability: 'All' })
    expect(chips.map((c) => c.label)).toEqual(['Type: Shield', 'Size: S1', 'Reserved'])
  })

  it('hangarFilterChips returns nothing when no filter is active', () => {
    expect(hangarFilterChips(DEFAULT_HANGAR_FILTERS)).toEqual([])
  })
})
