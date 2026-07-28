import type { HangarItem } from '../types'

/**
 * EWO-072 (Part E) — compact, composable Hangar Inventory filters,
 * mirroring the exact AND-composition architecture Fleet Dashboard's own
 * filter matrix already established (`fleetNavigation.ts`): every
 * dimension defaults to 'All' (a no-op) and is independent of every
 * other, so "Type: Shield AND Size: S1 AND Availability: Available" is a
 * simple conjunction, never a single mutually-exclusive selector.
 *
 * Type and Size options are deliberately never hard-coded — both are
 * derived from what's actually present in the Commander's own Hangar
 * (`typesInHangar`/`sizesInHangar`), the same "narrow among what you
 * actually have" principle `manufacturersInFleet` already established.
 */

export type TypeFilterValue = string | 'All'
export type SizeFilterValue = string | 'All'
export type ReservationFilterValue = 'All' | 'Reserved' | 'Unreserved'
export type AvailabilityFilterValue = 'All' | 'Available' | 'Unavailable'

export interface HangarFilterState {
  type: TypeFilterValue
  size: SizeFilterValue
  reservation: ReservationFilterValue
  availability: AvailabilityFilterValue
}

export const DEFAULT_HANGAR_FILTERS: HangarFilterState = {
  type: 'All',
  size: 'All',
  reservation: 'All',
  availability: 'All',
}

export function isHangarFilterActive(filters: HangarFilterState): boolean {
  return filters.type !== 'All' || filters.size !== 'All' || filters.reservation !== 'All' || filters.availability !== 'All'
}

/** The real, present set of Types/Sizes in this Commander's own Hangar —
 * never a hard-coded universal list. Sorted for a stable, predictable
 * pill order; Size sorts by actual numeric rank (S1, S2, ... S10), not
 * lexically. */
export function typesInHangar(items: HangarItem[]): string[] {
  return Array.from(new Set(items.map((i) => i.type))).sort((a, b) => a.localeCompare(b))
}

function parseSizeNumber(size: string): number {
  const match = /(\d+)/.exec(size)
  return match ? Number(match[1]) : 0
}

export function sizesInHangar(items: HangarItem[]): string[] {
  return Array.from(new Set(items.map((i) => i.size))).sort((a, b) => parseSizeNumber(a) - parseSizeNumber(b))
}

/** One row's worth of the derived facts filtering needs — the caller
 * (HangarInventory.tsx) supplies these from the SAME
 * `calculateComponentAvailability` call it already makes for display, so
 * this module never independently recomputes Reserved/Available. */
export interface HangarFilterableRow {
  item: HangarItem
  reservedQuantity: number
  availableQuantity: number
}

export function matchesHangarFilters(row: HangarFilterableRow, filters: HangarFilterState): boolean {
  if (filters.type !== 'All' && row.item.type !== filters.type) return false
  if (filters.size !== 'All' && row.item.size !== filters.size) return false
  if (filters.reservation === 'Reserved' && !(row.reservedQuantity > 0)) return false
  if (filters.reservation === 'Unreserved' && row.reservedQuantity > 0) return false
  if (filters.availability === 'Available' && !(row.availableQuantity > 0)) return false
  if (filters.availability === 'Unavailable' && row.availableQuantity > 0) return false
  return true
}

export function applyHangarFilters<T extends HangarFilterableRow>(rows: T[], filters: HangarFilterState): T[] {
  return rows.filter((row) => matchesHangarFilters(row, filters))
}

export interface HangarFilterChip {
  key: keyof HangarFilterState
  label: string
}

export function hangarFilterChips(filters: HangarFilterState): HangarFilterChip[] {
  const chips: HangarFilterChip[] = []
  if (filters.type !== 'All') chips.push({ key: 'type', label: `Type: ${filters.type}` })
  if (filters.size !== 'All') chips.push({ key: 'size', label: `Size: ${filters.size}` })
  if (filters.reservation !== 'All') chips.push({ key: 'reservation', label: filters.reservation })
  if (filters.availability !== 'All') chips.push({ key: 'availability', label: filters.availability })
  return chips
}
