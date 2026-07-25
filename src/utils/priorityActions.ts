import type { Hardpoint, HangarItem, InstalledLoadoutEntry, MissionReservation, Ship } from '../types'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { findActiveSlotReservation } from '../engine/logistics/reservationLookup'
import { buildTileContextNames, type TileContextResult } from './tileContextNames'

/**
 * UX-001A — Mission Control Hero Refactor, Deliverable 4 (Priority
 * Actions). Five categories.
 *
 * UX-001A.1 (Deliverable 3) — ordered by Commander value (lowest effort /
 * highest readiness impact first), deliberately NOT by severity alone.
 * The original UX-001A order put Invalid Target first because it reads as
 * the most severe defect; this order instead asks "how many clicks does
 * resolving this actually cost the Commander right now":
 *
 *   1. RESERVED_AWAITING_INSTALL — already committed to this exact port (a
 *      real MissionReservation matches build+slot); installing it is a
 *      single action with zero further decision-making. The cheapest
 *      possible win.
 *   2. READY_TO_INSTALL — genuinely owned, free Hangar stock; one click
 *      away, no shopping required.
 *   3. UPGRADE_OPPORTUNITY — something is already installed, and the
 *      Commander's own chosen Target differs from it; usually a single
 *      install action too, just not guaranteed already-owned.
 *   4. INVALID_TARGET — a real defect, but one the Commander can resolve
 *      entirely inside the app (choose a valid target) without leaving
 *      Ship Workspace — more effort than 1-3, but still self-contained.
 *   5. CRITICAL_MISSING — required and not owned anywhere; the only
 *      category this panel can't resolve by itself (needs procurement).
 *      Ranks last even though its NAME reads as severe — it is the one
 *      category this panel cannot turn into an immediate action.
 *
 * Reuses the exact same accounting authorities every other page already
 * calls (`calculateComponentAvailability`, `findActiveSlotReservation`) —
 * never a second readiness/inventory computation.
 */
export type PriorityActionCategory = 'INVALID_TARGET' | 'RESERVED_AWAITING_INSTALL' | 'READY_TO_INSTALL' | 'UPGRADE_OPPORTUNITY' | 'CRITICAL_MISSING'

export const PRIORITY_ACTION_CATEGORY_ORDER: PriorityActionCategory[] = [
  'RESERVED_AWAITING_INSTALL',
  'READY_TO_INSTALL',
  'UPGRADE_OPPORTUNITY',
  'INVALID_TARGET',
  'CRITICAL_MISSING',
]

export interface PriorityActionGroup {
  category: PriorityActionCategory
  /** Total affected required assignments across the fleet (may exceed
   * `context.shown.length + context.overflowCount`'s own ship count, since
   * one ship can contribute more than one assignment to the same
   * category — this is the count a Commander expects next to the label). */
  count: number
  context: TileContextResult
}

export function deriveFleetPriorityActions(
  ships: Ship[],
  hardpoints: Hardpoint[],
  hangarItems: HangarItem[],
  installedLoadouts: InstalledLoadoutEntry[],
  reservations: MissionReservation[]
): PriorityActionGroup[] {
  const shipsByCategory = new Map<PriorityActionCategory, Map<string, Ship>>()
  const countByCategory = new Map<PriorityActionCategory, number>()
  function record(category: PriorityActionCategory, ship: Ship) {
    countByCategory.set(category, (countByCategory.get(category) ?? 0) + 1)
    const shipMap = shipsByCategory.get(category) ?? new Map<string, Ship>()
    shipMap.set(ship.id, ship)
    shipsByCategory.set(category, shipMap)
  }

  for (const ship of ships) {
    const activeHardpoints = hardpoints.filter((h) => h.buildId === ship.activeBuildId)
    for (const hp of activeHardpoints) {
      if (hp.isStructural) continue
      if (hp.status === 'Unresolved' || hp.status === 'OK') continue
      if (!hp.targetItem || hp.targetItem === '—') continue

      if (hp.status === 'Invalid Target') {
        record('INVALID_TARGET', ship)
        continue
      }
      if (hp.status === 'Upgrade Available') {
        record('UPGRADE_OPPORTUNITY', ship)
        continue
      }
      // status === 'Missing' from here on.
      const ownReservation = findActiveSlotReservation(reservations, {
        missionConfigurationId: ship.activeBuildId,
        targetSlotLabel: hp.slotLabel,
        componentName: hp.targetItem,
        componentEntityClass: hp.targetEntityClass,
      })
      if (ownReservation) {
        record('RESERVED_AWAITING_INSTALL', ship)
        continue
      }
      const availability = calculateComponentAvailability(hp.targetItem, hangarItems, installedLoadouts, reservations, hp.targetEntityClass)
      if (availability.availableQuantity > 0) {
        record('READY_TO_INSTALL', ship)
      } else {
        record('CRITICAL_MISSING', ship)
      }
    }
  }

  const groups: PriorityActionGroup[] = []
  for (const category of PRIORITY_ACTION_CATEGORY_ORDER) {
    const count = countByCategory.get(category) ?? 0
    if (count === 0) continue
    const affectedShips = Array.from(shipsByCategory.get(category)?.values() ?? [])
    groups.push({ category, count, context: buildTileContextNames(affectedShips) })
  }
  return groups
}
