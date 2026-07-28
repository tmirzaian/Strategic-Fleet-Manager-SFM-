import type { HangarItem } from '../types'

/**
 * EWO-072 (Part F) — sorting now covers every approved column, not just
 * the four raw `HangarItem` fields Part 16 originally supported. Installed/
 * Reserved/Available/Needed By are all DERIVED values (they need
 * `calculateComponentAvailability`/`resolveNeededByBuilds` context this
 * module has no business owning) — so this operates on a decorated entry
 * the caller (HangarInventory.tsx) builds once per row from the SAME
 * shared authorities it already calls for display, rather than this
 * module re-deriving anything of its own. The removed Hangar Qty column
 * (EWO-072 Part C) takes its old `'quantity'` sort column with it — there
 * is no longer a raw-quantity column to sort by.
 */
export type HangarSortColumn = 'name' | 'type' | 'size' | 'installed' | 'reserved' | 'available' | 'neededBy'
export type SortDirection = 'asc' | 'desc'

export interface HangarSortEntry {
  item: HangarItem
  installedQuantity: number
  reservedQuantity: number
  availableQuantity: number
  /** Count of unresolved target requirements fleet-wide (Part F: "Needed
   * By sorts by unresolved requirement count"), not a reservation count. */
  neededByCount: number
}

function parseSizeNumber(size: string): number {
  const match = /(\d+)/.exec(size)
  return match ? Number(match[1]) : 0
}

/** Stable: ties always fall back to item name so output stays
 * deterministic regardless of input order. */
export function sortHangarEntries<T extends HangarSortEntry>(entries: T[], column: HangarSortColumn, direction: SortDirection): T[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...entries].sort((a, b) => {
    let cmp = 0
    switch (column) {
      case 'name':
        cmp = a.item.name.localeCompare(b.item.name)
        break
      case 'type':
        cmp = a.item.type.localeCompare(b.item.type)
        break
      case 'size':
        cmp = parseSizeNumber(a.item.size) - parseSizeNumber(b.item.size)
        break
      case 'installed':
        cmp = a.installedQuantity - b.installedQuantity
        break
      case 'reserved':
        cmp = a.reservedQuantity - b.reservedQuantity
        break
      case 'available':
        cmp = a.availableQuantity - b.availableQuantity
        break
      case 'neededBy':
        cmp = a.neededByCount - b.neededByCount
        break
    }
    if (cmp === 0) cmp = a.item.name.localeCompare(b.item.name)
    return cmp * factor
  })
}
