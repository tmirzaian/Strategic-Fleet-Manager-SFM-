import type { HangarItem } from '../types'

export type HangarSortColumn = 'name' | 'type' | 'size' | 'quantity'
export type SortDirection = 'asc' | 'desc'

function parseSizeNumber(size: string): number {
  const match = /(\d+)/.exec(size)
  return match ? Number(match[1]) : 0
}

/**
 * Sorts Hangar Inventory items (Part 16). Size sorts numerically
 * (S1, S2, ... S10, not lexically), Quantity sorts numeric, Item Name and
 * Type sort alphabetically. Stable: ties always fall back to item name so
 * output stays deterministic regardless of input order.
 */
export function sortHangarItems(items: HangarItem[], column: HangarSortColumn, direction: SortDirection): HangarItem[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    let cmp = 0
    if (column === 'name') cmp = a.name.localeCompare(b.name)
    else if (column === 'type') cmp = a.type.localeCompare(b.type)
    else if (column === 'size') cmp = parseSizeNumber(a.size) - parseSizeNumber(b.size)
    else cmp = a.qty - b.qty

    if (cmp === 0) cmp = a.name.localeCompare(b.name)
    return cmp * factor
  })
}
