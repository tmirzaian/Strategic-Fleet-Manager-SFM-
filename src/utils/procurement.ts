import type { Ship, Build, Hardpoint, InstalledLoadoutEntry, MissionReservation, HangarItem } from '../types'
import { calculateComponentAvailability } from '../engine/logistics/availability'

export interface ProcurementLine {
  itemName: string
  type: string
  size: string
  /** True shortage only — what must still be acquired (Alpha 2.3, Part 15). */
  qtyNeeded: number
  /** Owned but not yet committed to any of these requirements — a
   * Reserve action opportunity, never counted as a shortage. */
  availableToReserve: number
  neededBy: string[]
}

export type ProcurementSortColumn = 'name' | 'sizeType' | 'quantity' | 'unreserved'
export type SortDirection = 'asc' | 'desc'

/**
 * Aggregates fleet-wide demand for components across every Mission
 * Configuration's hardpoints (not just the currently active one), so the
 * Procurement List reflects everything the fleet needs — but, as of
 * Alpha 2.3, answers "what must still be ACQUIRED after Installed and
 * Reserved equipment are considered" (Part 15), not a naive count of every
 * unmatched target.
 *
 * A hardpoint row only becomes unresolved demand when ALL of these hold
 * (Alpha 2.1 Part 3 + Alpha 2.3 Part 15):
 *   1. Its Mission Configuration's Fleet Asset actually exists.
 *   2. The Mission Configuration itself exists and really belongs to it.
 *   3. It has a real target assignment (non-empty targetItem).
 *   4. The target is not an Invalid Target — a data problem, never a
 *      shopping list entry.
 *   5. The target differs from what's Installed (status !== 'OK').
 *   6. No ACTIVE reservation already commits an owned unit to this exact
 *      requirement (Mission + slot + component).
 *
 * For every item name with unresolved demand, owned-but-unreserved
 * inventory offsets the shortage first (shown separately as "available to
 * reserve", never silently counted as satisfied) — only what's left after
 * that is a true procurement shortage. Example (Part 15): 6 required, 2
 * installed, 2 reserved -> 2 rows of real unresolved demand; 1 unit sits
 * unreserved in Hangar -> availableToReserve 1, qtyNeeded 1. Never "6 needed".
 */
export function buildProcurementList(
  hardpoints: Hardpoint[],
  builds: Build[],
  ships: Ship[],
  installedLoadouts: InstalledLoadoutEntry[] = [],
  reservations: MissionReservation[] = [],
  hangarItems: HangarItem[] = []
): ProcurementLine[] {
  interface UnresolvedGroup {
    itemName: string
    type: string
    size: string
    rowCount: number
    neededBy: string[]
  }
  const groups = new Map<string, UnresolvedGroup>()

  for (const hp of hardpoints) {
    if (hp.status === 'OK') continue
    if (hp.status === 'Invalid Target' || hp.status === 'Unresolved') continue
    if (!hp.targetItem || hp.targetItem === '—') continue

    const build = builds.find((b) => b.id === hp.buildId)
    if (!build) continue
    const ship = ships.find((s) => s.id === build.shipId)
    if (!ship) continue

    // An ACTIVE reservation already commits a specific owned unit to this
    // exact requirement — installing it is just execution, not something
    // still to acquire.
    const activeReservation = reservations.find(
      (r) => r.missionConfigurationId === hp.buildId && r.targetSlotLabel === hp.slotLabel && r.componentName === hp.targetItem && r.status === 'ACTIVE'
    )
    if (activeReservation) continue

    const label = `${ship.name} — ${build.name}`
    const existing = groups.get(hp.targetItem)
    if (existing) {
      existing.rowCount += 1
      if (!existing.neededBy.includes(label)) existing.neededBy.push(label)
    } else {
      groups.set(hp.targetItem, { itemName: hp.targetItem, type: hp.type, size: hp.size, rowCount: 1, neededBy: [label] })
    }
  }

  const lines: ProcurementLine[] = []
  for (const group of groups.values()) {
    const availability = calculateComponentAvailability(group.itemName, hangarItems, installedLoadouts, reservations)
    const availableToReserve = Math.min(group.rowCount, availability.availableQuantity)
    const qtyNeeded = Math.max(0, group.rowCount - availability.availableQuantity)
    lines.push({ itemName: group.itemName, type: group.type, size: group.size, qtyNeeded, availableToReserve, neededBy: group.neededBy })
  }

  return lines.sort((a, b) => a.itemName.localeCompare(b.itemName))
}

function parseSizeNumber(size: string): number {
  const match = /(\d+)/.exec(size)
  return match ? Number(match[1]) : 0
}

/**
 * Sorts a procurement list by the requested column/direction (Part 4/16).
 * Size/Type sorts numerically by size first, then normalized type, then
 * component name as a tie-breaker — never lexically on the raw "S10" vs
 * "S2" string. Quantity sorts on the true shortage (qtyNeeded). Stable:
 * ties always fall back to itemName so output is deterministic regardless
 * of input order.
 */
export function sortProcurementList(lines: ProcurementLine[], column: ProcurementSortColumn, direction: SortDirection): ProcurementLine[] {
  const factor = direction === 'asc' ? 1 : -1
  const sorted = [...lines].sort((a, b) => {
    let cmp = 0
    if (column === 'name') {
      cmp = a.itemName.localeCompare(b.itemName)
    } else if (column === 'sizeType') {
      cmp = parseSizeNumber(a.size) - parseSizeNumber(b.size)
      if (cmp === 0) cmp = a.type.localeCompare(b.type)
      if (cmp === 0) cmp = a.itemName.localeCompare(b.itemName)
    } else if (column === 'unreserved') {
      // Blank/dash display (0) sorts as zero — availableToReserve is
      // already a number, never blank, but this keeps the rule explicit
      // per Part 5 ("treat blank or dash values as zero for sorting").
      cmp = (a.availableToReserve || 0) - (b.availableToReserve || 0)
    } else {
      cmp = a.qtyNeeded - b.qtyNeeded
    }
    if (cmp === 0) cmp = a.itemName.localeCompare(b.itemName)
    return cmp * factor
  })
  return sorted
}
